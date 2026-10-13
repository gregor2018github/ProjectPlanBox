"""Consistent database backups via ``VACUUM INTO``, and the backup folder's files.

A backup is ``planbox-<compact UTC stamp>-<label>.db``. The stamp is fixed
width, so names sort chronologically.
"""

import os
import re
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

_NAME = re.compile(r"^planbox-(\d{8}T\d{9}Z)-([a-z][a-z0-9-]*)\.db$")


@dataclass(frozen=True, slots=True)
class BackupFile:
    """One backup in a folder.

    Attributes:
        path: The file.
        label: Why it was taken, e.g. ``daily`` or ``pre-migration``.
        taken_at: When it was taken (UTC).
        size: Size in bytes.
    """

    path: Path
    label: str
    taken_at: datetime
    size: int


def backup_name(label: str, stamp: str) -> str:
    """Returns the file name for a backup taken at ``stamp`` (UTC ISO-8601)."""
    compact = stamp.replace("-", "").replace(":", "").replace(".", "")
    return f"planbox-{compact}-{label}.db"


def backup_database(
    conn: sqlite3.Connection, backups_dir: Path, *, label: str, stamp: str, keep: int
) -> Path:
    """Writes a compacted, consistent copy of the database and prunes old copies.

    Args:
        conn: Connection to the database to back up.
        backups_dir: Target folder; created if missing.
        label: Short reason that ends up in the filename, e.g. ``pre-migration``.
        stamp: UTC ISO-8601 timestamp (as produced by ``to_iso``).
        keep: Number of backups with this label to keep, newest first.

    Returns:
        Path of the new backup file (the existing one if a backup with this
        label was already taken in the same millisecond).
    """
    backups_dir.mkdir(parents=True, exist_ok=True)
    target = backups_dir / backup_name(label, stamp)
    if not target.exists():
        conn.execute("VACUUM INTO ?", (str(target),))
    prune_backups(backups_dir, label, keep)
    return target


def list_backups(folder: Path) -> list[BackupFile]:
    """Returns the backups in ``folder``, newest first (empty if it does not exist)."""
    if not folder.is_dir():
        return []
    found: list[BackupFile] = []
    for path in folder.iterdir():
        match = _NAME.match(path.name)
        if match is None or not path.is_file():
            continue
        taken_at = datetime.strptime(match[1], "%Y%m%dT%H%M%S%fZ").replace(tzinfo=UTC)
        found.append(BackupFile(path, match[2], taken_at, path.stat().st_size))
    found.sort(key=lambda b: b.path.name, reverse=True)
    return found


def prune_backups(folder: Path, label: str, keep: int) -> None:
    """Deletes all but the ``keep`` newest backups with ``label`` in ``folder``."""
    for old in [b for b in list_backups(folder) if b.label == label][keep:]:
        old.path.unlink()


def copy_backup(source: Path, folder: Path) -> Path:
    """Copies a backup into ``folder`` so that it never appears half-written.

    The copy goes to a temporary name first and is renamed when complete, so
    an interrupted copy (a USB stick pulled out) leaves no file that looks
    like a backup.

    Returns:
        The copy.
    """
    target = folder / source.name
    partial = folder / f"{source.name}.partial"
    shutil.copyfile(source, partial)
    os.replace(partial, target)
    return target
