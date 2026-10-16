"""Google Drive sync use cases.

Every device (each PC, the phone app) keeps exactly one file in the app data
folder: its whole database as an export (``planbox-<device id>.json.gz``).

- **Upload** replaces this device's file with a fresh export.
- **Download** merges every other device's file into this database with the
  import rule (ARCHITECTURE §13): per row, the newer version wins.
- **Sync** is download, then upload, so the file this device leaves behind
  already holds everything it learned.

No device ever writes another device's file, so two devices syncing at the
same moment cannot overwrite each other.
"""

import gzip
import json
import secrets
from datetime import datetime, timedelta

from pydantic import ValidationError

from planbox import __version__
from planbox.config import Settings
from planbox.core.clock import Clock, to_iso, utc_now_iso
from planbox.core.cloud import google
from planbox.core.cloud.google import Drive, DriveFile, OAuthClient, SignedOut, Transport
from planbox.core.cloud.models import (
    CloudDevice,
    CloudState,
    CloudStatus,
    DeviceMerge,
    Download,
    PendingSignIn,
    Upload,
)
from planbox.core.cloud.store import CloudStore
from planbox.core.data.document import from_file, to_file
from planbox.core.data.schemas import ExportFile
from planbox.core.data.transfer import TransferService
from planbox.core.errors import Conflict, DomainError, ValidationFailed

FILE_PREFIX = "planbox-"
FILE_SUFFIX = ".json.gz"
SIGN_IN_LIFETIME = timedelta(minutes=15)
MAX_NAME = 60


def file_name(device_id: str) -> str:
    """The Drive file name of a device."""
    return f"{FILE_PREFIX}{device_id}{FILE_SUFFIX}"


def pack(document: ExportFile) -> bytes:
    """An export document as gzip-compressed JSON (exports compress about tenfold)."""
    return gzip.compress(document.model_dump_json().encode("utf-8"), mtime=0)


def unpack(content: bytes) -> ExportFile:
    """The export document in a downloaded file.

    Raises:
        ValidationFailed: If the file is not a PlanBox export.
    """
    try:
        return ExportFile.model_validate(json.loads(gzip.decompress(content)))
    except (OSError, EOFError, ValueError, ValidationError) as exc:
        raise ValidationFailed("The file in Google Drive is not a PlanBox export.") from exc


def stamp(value: str) -> str:
    """An instant from Google (RFC 3339) in PlanBox's fixed-width form."""
    try:
        return to_iso(datetime.fromisoformat(value))
    except ValueError:
        return value


def device_of(file: DriveFile, own_id: str) -> CloudDevice | None:
    """The device a Drive file belongs to (None for files that are not PlanBox's)."""
    if not (file.name.startswith(FILE_PREFIX) and file.name.endswith(FILE_SUFFIX)):
        return None
    device_id = file.name[len(FILE_PREFIX) : -len(FILE_SUFFIX)]
    return CloudDevice(
        device_id=device_id,
        name=file.properties.get("planbox_name") or "Unnamed device",
        uploaded_at=stamp(file.modified_time),
        exported_at=file.properties.get("planbox_exported_at"),
        app_version=file.properties.get("planbox_app_version"),
        size=file.size,
        this_device=device_id == own_id,
    )


class CloudService:
    """Connects to Google Drive and moves exports to and from it."""

    def __init__(
        self,
        settings: Settings,
        clock: Clock,
        state: CloudState,
        transfer: TransferService,
        transport: Transport,
    ) -> None:
        self._settings = settings
        self._clock = clock
        self._state = state
        self._transfer = transfer
        self._transport = transport
        self._store = CloudStore(settings.data_dir)

    # ---- status and sign-in

    def status(self) -> CloudStatus:
        """Sync as this device sees it (no call to Google)."""
        record = self._store.load()
        with self._state.lock:
            pending = self._state.pending
            connecting = pending is not None and pending.expires_at > self._clock.now()
            error = self._state.error
        return CloudStatus(
            available=self._settings.cloud_ready,
            connected=record.refresh_token is not None,
            connecting=connecting,
            device_id=record.device_id,
            device_name=self._settings.device_name,
            last_upload_at=record.last_upload_at,
            last_download_at=record.last_download_at,
            error=error,
        )

    def start_sign_in(self, redirect_uri: str) -> str:
        """Starts a browser sign-in; returns the Google page to open.

        Raises:
            Conflict: If no OAuth client is configured.
        """
        client = self._client()
        verifier, challenge = google.pkce_pair()
        state = secrets.token_urlsafe(24)
        with self._state.lock:
            self._state.pending = PendingSignIn(
                state, verifier, redirect_uri, self._clock.now() + SIGN_IN_LIFETIME
            )
            self._state.error = None
        return google.authorization_url(client, redirect_uri, state, challenge)

    def finish_sign_in(self, state: str, code: str | None, error: str | None) -> None:
        """Completes the sign-in the browser came back from.

        Raises:
            Conflict: If no sign-in with this ``state`` is waiting (or it expired).
            UpstreamFailed: If Google refuses the code.
        """
        with self._state.lock:
            pending = self._state.pending
            if (
                pending is None
                or not secrets.compare_digest(pending.state, state)
                or pending.expires_at <= self._clock.now()
            ):
                raise Conflict("This sign-in is unknown or expired. Start it again in PlanBox.")
            self._state.pending = None
        try:
            if error is not None or code is None:
                raise Conflict(f"Google did not allow access ({error or 'no code'}).")
            token, refresh = google.exchange_code(
                self._transport,
                self._client(),
                code=code,
                verifier=pending.verifier,
                redirect_uri=pending.redirect_uri,
                now=self._clock.now(),
            )
        except DomainError as exc:
            with self._state.lock:
                self._state.error = exc.detail
            raise
        self._store.update(refresh_token=refresh, merged={})
        with self._state.lock:
            self._state.token = token
            self._state.error = None

    def sign_out(self) -> CloudStatus:
        """Forgets the sign-in here and withdraws it at Google. Drive files stay."""
        record = self._store.load()
        if record.refresh_token is not None:
            google.revoke(self._transport, record.refresh_token)
        self._store.update(refresh_token=None, merged={})
        with self._state.lock:
            self._state.token = None
            self._state.pending = None
        return self.status()

    # ---- Drive

    def devices(self) -> list[CloudDevice]:
        """Every device with a file in Drive, this one first, then by name."""
        own = self._store.load().device_id
        found = [d for f in self._drive().list(FILE_PREFIX) if (d := device_of(f, own))]
        return sorted(found, key=lambda d: (not d.this_device, d.name.lower(), d.device_id))

    def upload(self) -> Upload:
        """Replaces this device's file in Drive with a fresh export.

        Raises:
            Conflict: If not connected, or a sync is already running.
        """
        with self._busy():
            return self._upload(self._drive())

    def download(self) -> Download:
        """Merges every other device's file that changed since it was last merged.

        A file that cannot be merged (another PlanBox version) is reported
        and skipped; the others are still merged.

        Raises:
            Conflict: If not connected, or a sync is already running.
        """
        with self._busy():
            return self._download(self._drive())

    def sync(self) -> tuple[Download, Upload]:
        """Download, then upload."""
        with self._busy():
            drive = self._drive()
            return self._download(drive), self._upload(drive)

    def _upload(self, drive: Drive) -> Upload:
        record = self._store.load()
        export = self._transfer.export()
        content = pack(to_file(export))
        name = file_name(record.device_id)
        existing = next((f.id for f in drive.list(name) if f.name == name), None)
        drive.upload(
            name,
            content,
            {
                "planbox_name": self._settings.device_name[:MAX_NAME],
                "planbox_exported_at": export.exported_at,
                "planbox_app_version": __version__,
            },
            existing,
        )
        now = utc_now_iso(self._clock)
        self._store.update(last_upload_at=now)
        return Upload(uploaded_at=now, size=len(content))

    def _download(self, drive: Drive) -> Download:
        record = self._store.load()
        merged = dict(record.merged)
        results: list[DeviceMerge] = []
        for file in drive.list(FILE_PREFIX):
            device = device_of(file, record.device_id)
            if device is None or device.this_device:
                continue
            if merged.get(device.device_id) == file.modified_time:
                results.append(DeviceMerge(device, "unchanged"))
                continue
            try:
                report = self._transfer.import_export(from_file(unpack(drive.download(file.id))))
            except SignedOut:
                raise
            except DomainError as exc:
                results.append(DeviceMerge(device, "failed", error=exc.detail))
                continue
            merged[device.device_id] = file.modified_time
            results.append(DeviceMerge(device, "merged", report=report))
        self._store.update(merged=merged, last_download_at=utc_now_iso(self._clock))
        results.sort(key=lambda m: (m.device.name.lower(), m.device.device_id))
        return Download(results)

    # ---- helpers

    def _client(self) -> OAuthClient:
        settings = self._settings
        if not (settings.google_client_id and settings.google_client_secret):
            raise Conflict(
                "Google Drive sync is not set up on this PC. Add google_client_id and "
                "google_client_secret to settings.toml (see README)."
            )
        return OAuthClient(settings.google_client_id, settings.google_client_secret)

    def _drive(self) -> Drive:
        """Drive with a valid access token (renewed when it has run out).

        Raises:
            Conflict: If this device is not connected.
        """
        client = self._client()
        record = self._store.load()
        if record.refresh_token is None:
            raise Conflict("Connect Google Drive first.")
        now = self._clock.now()
        with self._state.lock:
            token = self._state.token
        if token is None or token.expires_at <= now:
            try:
                token = google.refresh_access(self._transport, client, record.refresh_token, now)
            except SignedOut:
                self._store.update(refresh_token=None)
                raise
            with self._state.lock:
                self._state.token = token
        return Drive(self._transport, token.value)

    def _busy(self) -> "_Busy":
        return _Busy(self._state)


class _Busy:
    """Holds the sync lock; a second sync at the same time is refused, not queued."""

    def __init__(self, state: CloudState) -> None:
        self._state = state

    def __enter__(self) -> None:
        if not self._state.busy.acquire(blocking=False):
            raise Conflict("A sync is already running. Try again in a moment.")

    def __exit__(self, *_: object) -> None:
        self._state.busy.release()
