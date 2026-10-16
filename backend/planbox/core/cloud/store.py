"""What this device remembers about Google Drive sync, in ``<data>/cloud.json``.

The file holds this device's sync id, the refresh token and when it last
synced. It sits next to the database (``private_data/``), never in it, so an
export or a backup never carries the token to another device.
"""

import json
import os
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path
from typing import cast

from planbox.core.ids import new_id


@dataclass(frozen=True, slots=True)
class CloudRecord:
    """The contents of ``cloud.json``.

    Attributes:
        device_id: Names this device's file in Drive; made once, kept forever.
        refresh_token: Google's long-lived token, or None when not connected.
        last_upload_at: When this device last uploaded (UTC), if ever.
        last_download_at: When this device last merged the others (UTC), if ever.
        merged: Per other device, the Drive modification time of the file
            last merged, so an unchanged file is not merged twice.
    """

    device_id: str
    refresh_token: str | None = None
    last_upload_at: str | None = None
    last_download_at: str | None = None
    merged: dict[str, str] = field(default_factory=dict[str, str])


class CloudStore:
    """Reads and writes ``cloud.json`` (written atomically)."""

    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / "cloud.json"

    def load(self) -> CloudRecord:
        """The record; a new device id is made (and saved) the first time."""
        if self._path.is_file():
            try:
                raw: object = json.loads(self._path.read_text(encoding="utf-8"))
            except ValueError:
                raw = {}
            if isinstance(raw, dict):
                return _record(raw)  # pyright: ignore[reportUnknownArgumentType]
        record = CloudRecord(device_id=new_id())
        self.save(record)
        return record

    def save(self, record: CloudRecord) -> None:
        """Replaces the file."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        partial = self._path.with_suffix(".partial")
        partial.write_text(json.dumps(asdict(record), indent=2), encoding="utf-8")
        os.replace(partial, self._path)

    def update(self, **changes: object) -> CloudRecord:
        """Loads, changes some fields, saves and returns the record."""
        record = replace(self.load(), **changes)  # pyright: ignore[reportArgumentType]
        self.save(record)
        return record


def _record(raw: dict[str, object]) -> CloudRecord:
    def text(key: str) -> str | None:
        value = raw.get(key)
        return value if isinstance(value, str) and value else None

    merged = raw.get("merged")
    return CloudRecord(
        device_id=text("device_id") or new_id(),
        refresh_token=text("refresh_token"),
        last_upload_at=text("last_upload_at"),
        last_download_at=text("last_download_at"),
        merged=(
            {str(k): str(v) for k, v in cast("dict[object, object]", merged).items()}
            if isinstance(merged, dict)
            else {}
        ),
    )
