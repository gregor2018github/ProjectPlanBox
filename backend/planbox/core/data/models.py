"""Backup, export and import values."""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

type Value = str | int | float | None
"""A column value as SQLite stores it in PlanBox's STRICT tables (no BLOBs)."""


@dataclass(frozen=True, slots=True)
class TableShape:
    """A synced table: one that carries ``id``, ``updated_at`` and ``deleted_at``.

    Attributes:
        name: Table name.
        columns: Column names in table order.
        types: Each column's declared type (``TEXT``, ``INTEGER``, ``REAL``, ``ANY``).
    """

    name: str
    columns: tuple[str, ...]
    types: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class MigrationStamp:
    """One applied migration; two databases with equal stamps have equal tables."""

    owner: str
    version: int
    checksum: str


@dataclass(frozen=True, slots=True)
class TableDump:
    """Every row of one table, tombstones included.

    Attributes:
        columns: Column names; each row lists its values in this order.
        rows: The rows.
    """

    columns: tuple[str, ...]
    rows: list[tuple[Value, ...]]


@dataclass(frozen=True, slots=True)
class Export:
    """A whole database as data: what an export file holds.

    Attributes:
        app_version: The PlanBox version that wrote it.
        exported_at: UTC instant.
        migrations: The schema it was taken from.
        tables: Rows per synced table.
    """

    app_version: str
    exported_at: str
    migrations: list[MigrationStamp]
    tables: dict[str, TableDump]


@dataclass(slots=True)
class TableMerge:
    """What merging one table did.

    Attributes:
        table: Table name.
        inserted: Rows that were new here.
        updated: Rows the export had in a newer version.
        unchanged: Rows that were equal, or newer here.
        conflicts: Live rows that collided with a different live row on a
            unique rule (the same tag name, the same check-in day) and were
            stored deleted instead.
    """

    table: str
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    conflicts: int = 0


@dataclass(frozen=True, slots=True)
class ImportReport:
    """The outcome of an import.

    Attributes:
        backup: File name of the backup taken just before.
        tables: Per table, in name order.
    """

    backup: str
    tables: list[TableMerge]


@dataclass(frozen=True, slots=True)
class OffsiteStatus:
    """The off-site backup folder.

    Attributes:
        path: The configured folder.
        reachable: Whether it exists right now (a USB stick may be out).
        latest: The newest backup there, if any.
        error: Why the last copy failed, until a copy succeeds again.
    """

    path: Path
    reachable: bool
    latest: datetime | None
    error: str | None
