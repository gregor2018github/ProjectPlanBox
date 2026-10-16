"""Google Drive sync values."""

import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from planbox.core.cloud.google import AccessToken
from planbox.core.data.models import ImportReport


@dataclass(slots=True)
class PendingSignIn:
    """A browser sign-in that was started and has not come back yet."""

    state: str
    verifier: str
    redirect_uri: str
    expires_at: datetime


@dataclass(slots=True)
class CloudState:
    """In-memory sync state shared by every request (one per app).

    Attributes:
        lock: Guards the fields below.
        busy: Serialises uploads and downloads.
        pending: The browser sign-in in progress, if any.
        token: The current access token, if one was fetched.
        error: Why the last sign-in failed, until the next attempt.
    """

    lock: threading.Lock = field(default_factory=threading.Lock)
    busy: threading.Lock = field(default_factory=threading.Lock)
    pending: PendingSignIn | None = None
    token: AccessToken | None = None
    error: str | None = None


@dataclass(frozen=True, slots=True)
class CloudStatus:
    """Sync as this device sees it, without asking Google."""

    available: bool
    connected: bool
    connecting: bool
    device_id: str
    device_name: str
    last_upload_at: str | None
    last_download_at: str | None
    error: str | None


@dataclass(frozen=True, slots=True)
class CloudDevice:
    """A device's file in Drive."""

    device_id: str
    name: str
    uploaded_at: str
    exported_at: str | None
    app_version: str | None
    size: int
    this_device: bool


@dataclass(frozen=True, slots=True)
class Upload:
    """What an upload did."""

    uploaded_at: str
    size: int


@dataclass(frozen=True, slots=True)
class DeviceMerge:
    """What merging one other device's file did.

    Attributes:
        device: The device.
        status: ``merged``, ``unchanged`` (merged before and not changed
            since) or ``failed``.
        error: Why it failed.
        report: The merge, when it ran.
    """

    device: CloudDevice
    status: Literal["merged", "unchanged", "failed"]
    error: str | None = None
    report: ImportReport | None = None


@dataclass(frozen=True, slots=True)
class Download:
    """What a download did, per other device."""

    devices: list[DeviceMerge]
