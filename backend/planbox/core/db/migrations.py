"""Numbered SQL migrations with per-owner sequences.

Each owner (``core`` and every module) keeps its own folder of
``NNNN_snake_name.sql`` files. Applied migrations are recorded in
``schema_migrations`` together with a checksum. Editing an applied file makes
startup fail on purpose: fixes go into a new migration.

This module and the repositories are the only places that run SQL.
"""

import hashlib
import re
import sqlite3
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from planbox.core.clock import Clock, to_iso, utc_now_iso
from planbox.core.db.backup import backup_database

_FILENAME_RE = re.compile(r"^(?P<version>\d{4})_(?P<name>[a-z0-9]+(?:_[a-z0-9]+)*)\.sql$")
_FK_OFF_DIRECTIVE = "-- planbox: foreign_keys=off"

_CREATE_BOOKKEEPING = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    owner TEXT NOT NULL,
    version INTEGER NOT NULL,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    PRIMARY KEY (owner, version)
) STRICT
"""


class MigrationError(RuntimeError):
    """Raised when migrations are malformed, edited after applying, or fail."""


@dataclass(frozen=True, slots=True)
class MigrationSource:
    """A folder of migrations belonging to one owner.

    Attributes:
        owner: ``core`` or a module id.
        directory: Folder holding the ``NNNN_name.sql`` files.
    """

    owner: str
    directory: Path


@dataclass(frozen=True, slots=True)
class Migration:
    """One migration file, loaded and checksummed."""

    owner: str
    version: int
    name: str
    sql: str
    checksum: str
    foreign_keys_off: bool

    @property
    def label(self) -> str:
        """Human-readable identifier such as ``todos/0002_add_rrule``."""
        return f"{self.owner}/{self.version:04d}_{self.name}"


def discover(source: MigrationSource) -> list[Migration]:
    """Loads and validates an owner's migration files.

    Versions must start at 1 and have no gaps. Other files in the folder
    (such as ``.gitkeep``) are ignored; ``.sql`` files with a bad name are not.

    Raises:
        MigrationError: If the folder is missing, a filename is malformed,
            or the version sequence has duplicates or gaps.
    """
    if not source.directory.is_dir():
        raise MigrationError(f"{source.owner}: migrations folder {source.directory} not found")

    migrations: list[Migration] = []
    for path in sorted(source.directory.glob("*.sql")):
        match = _FILENAME_RE.fullmatch(path.name)
        if match is None:
            raise MigrationError(f"{source.owner}: bad migration filename {path.name!r}")
        # Normalise line endings so a checkout with CRLF does not change the checksum.
        sql = path.read_text(encoding="utf-8").replace("\r\n", "\n")
        migrations.append(
            Migration(
                owner=source.owner,
                version=int(match["version"]),
                name=match["name"],
                sql=sql,
                checksum=hashlib.sha256(sql.encode("utf-8")).hexdigest(),
                foreign_keys_off=sql.lstrip().startswith(_FK_OFF_DIRECTIVE),
            )
        )

    versions = [m.version for m in migrations]
    expected = list(range(1, len(migrations) + 1))
    if versions != expected:
        raise MigrationError(
            f"{source.owner}: migration versions must be 1..n without gaps, got {versions}"
        )
    return migrations


def applied_versions(conn: sqlite3.Connection) -> dict[str, int]:
    """Returns the highest applied version per owner (empty for a new database)."""
    if not _has_bookkeeping(conn):
        return {}
    rows = conn.execute(
        "SELECT owner, MAX(version) AS version FROM schema_migrations GROUP BY owner"
    ).fetchall()
    return {str(row["owner"]): int(row["version"]) for row in rows}


def pending(conn: sqlite3.Connection, sources: Sequence[MigrationSource]) -> list[Migration]:
    """Returns migrations not yet applied, in application order.

    Application order is the order of ``sources`` (core first, then modules in
    registry order), then version.

    Raises:
        MigrationError: If an applied migration's file changed or disappeared.
    """
    applied: dict[tuple[str, int], tuple[str, str]] = {}
    if _has_bookkeeping(conn):
        for row in conn.execute("SELECT owner, version, name, checksum FROM schema_migrations"):
            applied[(str(row["owner"]), int(row["version"]))] = (
                str(row["name"]),
                str(row["checksum"]),
            )

    result: list[Migration] = []
    known_owners = {source.owner for source in sources}
    for source in sources:
        on_disk = discover(source)
        for migration in on_disk:
            recorded = applied.pop((migration.owner, migration.version), None)
            if recorded is None:
                result.append(migration)
            elif recorded[1] != migration.checksum:
                raise MigrationError(
                    f"{migration.label} was edited after it was applied. "
                    "Restore the original file and put the change in a new migration."
                )

    missing = sorted(
        f"{owner}/{version:04d}" for owner, version in applied if owner in known_owners
    )
    if missing:
        raise MigrationError(f"applied migrations missing on disk: {', '.join(missing)}")
    return result


def migrate(
    conn: sqlite3.Connection,
    sources: Sequence[MigrationSource],
    *,
    clock: Clock,
    backups_dir: Path | None = None,
    keep_backups: int = 10,
) -> list[Migration]:
    """Applies all pending migrations, each in its own transaction.

    If anything is pending and the database already holds tables, a backup is
    written to ``backups_dir`` first (when given).

    Args:
        conn: An autocommit connection (see ``connect``).
        sources: Owners in application order; core must come first.
        clock: Supplies ``applied_at`` and the backup timestamp.
        backups_dir: Where to write the pre-migration backup, or ``None`` to skip it.
        keep_backups: How many backups to keep; older ones are deleted.

    Returns:
        The migrations that were applied, in order.

    Raises:
        MigrationError: If validation fails or a migration raises. The failing
            migration is rolled back; earlier ones in the same run stay applied.
    """
    todo = pending(conn, sources)
    if not todo:
        return []

    if backups_dir is not None and _has_user_tables(conn):
        backup_database(
            conn, backups_dir, label="pre-migration", stamp=to_iso(clock.now()), keep=keep_backups
        )

    conn.execute(_CREATE_BOOKKEEPING)
    for migration in todo:
        _apply(conn, migration, clock)
    return todo


def _apply(conn: sqlite3.Connection, migration: Migration, clock: Clock) -> None:
    if migration.foreign_keys_off:
        # Cannot be changed inside a transaction, so toggle around it.
        conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.execute("BEGIN IMMEDIATE")
        try:
            # executescript performs no implicit transaction control in autocommit mode,
            # so the whole file runs inside the BEGIN above.
            conn.executescript(migration.sql)
            if migration.foreign_keys_off:
                violations = conn.execute("PRAGMA foreign_key_check").fetchall()
                if violations:
                    raise MigrationError(
                        f"{migration.label} left {len(violations)} foreign key violation(s)"
                    )
            conn.execute(
                "INSERT INTO schema_migrations (owner, version, name, checksum, applied_at) "
                "VALUES (:owner, :version, :name, :checksum, :applied_at)",
                {
                    "owner": migration.owner,
                    "version": migration.version,
                    "name": migration.name,
                    "checksum": migration.checksum,
                    "applied_at": utc_now_iso(clock),
                },
            )
        except BaseException as exc:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            if isinstance(exc, MigrationError):
                raise
            if isinstance(exc, sqlite3.Error):
                raise MigrationError(f"{migration.label} failed: {exc}") from exc
            raise
        conn.execute("COMMIT")
    finally:
        if migration.foreign_keys_off:
            conn.execute("PRAGMA foreign_keys = ON")


def _has_bookkeeping(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations'"
    ).fetchone()
    return row is not None


def _has_user_tables(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1"
    ).fetchone()
    return row is not None
