"""Consistent database backups via ``VACUUM INTO``."""

import sqlite3
from pathlib import Path


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
        Path of the new backup file.
    """
    backups_dir.mkdir(parents=True, exist_ok=True)
    compact = stamp.replace("-", "").replace(":", "").replace(".", "")
    target = backups_dir / f"planbox-{compact}-{label}.db"
    conn.execute("VACUUM INTO ?", (str(target),))

    # Filenames sort chronologically because the stamp is fixed-width.
    existing = sorted(backups_dir.glob(f"planbox-*-{label}.db"), reverse=True)
    for old in existing[keep:]:
        old.unlink()
    return target
