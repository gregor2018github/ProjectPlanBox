"""Export the database as data, and merge such an export back in.

The merge is the sync rule PlanBox is built for (ARCHITECTURE §13): per
row, the newer ``updated_at`` wins, and deletes travel as tombstones. So
exporting on one PC and importing on the other, then the other way round,
leaves both with the same data.
"""

import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from planbox import __version__
from planbox.core.clock import Clock, to_iso, utc_now_iso
from planbox.core.data.models import (
    Export,
    ImportReport,
    TableDump,
    TableMerge,
    TableShape,
    Value,
)
from planbox.core.data.repository import DataRepository
from planbox.core.db import transaction
from planbox.core.db.backup import backup_database
from planbox.core.errors import Conflict, ValidationFailed
from planbox.core.search.service import SearchService

PRE_IMPORT_KEEP = 10
"""Backups taken before an import that are kept."""


def _canonical(values: tuple[Value, ...]) -> str:
    return json.dumps(values, separators=(",", ":"))


def _later(instant: str) -> str:
    """The instant one millisecond after ``instant``."""
    return to_iso(datetime.fromisoformat(instant) + timedelta(milliseconds=1))


def _fits(value: Value, declared: str) -> bool:
    """Whether a value has its column's type.

    STRICT tables alone would store an integer in a TEXT column as text,
    which no PlanBox code ever writes.
    """
    if value is None or declared == "ANY":
        return True
    if declared == "TEXT":
        return isinstance(value, str)
    if declared == "INTEGER":
        return isinstance(value, int) and not isinstance(value, bool)
    if declared == "REAL":
        return isinstance(value, int | float) and not isinstance(value, bool)
    return False


class TransferService:
    """Exports and imports whole databases."""

    def __init__(
        self,
        conn: sqlite3.Connection,
        repository: DataRepository,
        search: SearchService,
        clock: Clock,
        backups_dir: Path,
    ) -> None:
        self._conn = conn
        self._repo = repository
        self._search = search
        self._clock = clock
        self._backups_dir = backups_dir

    def export(self) -> Export:
        """Every synced table with all its rows, tombstones included, read in one snapshot."""
        with transaction(self._conn):
            return Export(
                app_version=__version__,
                exported_at=utc_now_iso(self._clock),
                migrations=self._repo.migrations(),
                tables={
                    t.name: TableDump(t.columns, self._repo.rows(t)) for t in self._repo.tables()
                },
            )

    def import_export(self, data: Export) -> ImportReport:
        """Merges an export into this database, the newest version of each row winning.

        A backup is written first, and the whole merge is one transaction:
        it applies completely or not at all. The search index is rebuilt
        afterwards, since merged rows may be older than its watermarks.

        Raises:
            Conflict: If the export comes from a different schema version.
            ValidationFailed: If it names unknown tables or columns, holds
                values the tables reject, or rows that point at missing rows.
        """
        if data.migrations != self._repo.migrations():
            raise Conflict(
                f"The export was written by PlanBox {data.app_version} with a different "
                f"database version than this one ({__version__}). Update both PCs to the "
                "same version and export again."
            )
        shapes = {t.name: t for t in self._repo.tables()}
        for name, dump in data.tables.items():
            shape = shapes.get(name)
            if shape is None:
                raise ValidationFailed(f"The export has an unknown table {name!r}.")
            if sorted(dump.columns) != sorted(shape.columns):
                raise ValidationFailed(f"The export's columns for {name!r} do not match.")
            declared = [shape.types[shape.columns.index(c)] for c in dump.columns]
            for row in dump.rows:
                if len(row) != len(declared) or not all(map(_fits, row, declared)):
                    raise ValidationFailed(f"The export has a malformed row in {name!r}.")

        backup = backup_database(
            self._conn,
            self._backups_dir,
            label="pre-import",
            stamp=to_iso(self._clock.now()),
            keep=PRE_IMPORT_KEEP,
        )
        now = utc_now_iso(self._clock)
        merges: list[TableMerge] = []
        try:
            with transaction(self._conn):
                self._repo.defer_foreign_keys()
                for name in sorted(data.tables):
                    merges.append(self._merge_table(shapes[name], data.tables[name], now))
                missing = self._repo.foreign_key_violations()
                if missing:
                    raise ValidationFailed(
                        f"The export has {missing} row(s) that point at rows it does not contain."
                    )
        except sqlite3.IntegrityError as exc:
            raise ValidationFailed(f"The export holds a value this PlanBox rejects: {exc}") from exc
        self._search.rebuild()
        return ImportReport(backup=backup.name, tables=merges)

    def _merge_table(self, shape: TableShape, dump: TableDump, now: str) -> TableMerge:
        order = [dump.columns.index(c) for c in shape.columns]
        incoming = [tuple(row[i] for i in order) for row in dump.rows]
        id_at = shape.columns.index("id")
        updated_at = shape.columns.index("updated_at")
        local = {row[id_at]: row for row in self._repo.rows(shape)}
        merge = TableMerge(shape.name)

        # Updates first: a row deleted on the other PC must leave its unique
        # slot before a row that is new here may take it.
        news: list[tuple[Value, ...]] = []
        for row in incoming:
            mine = local.get(row[id_at])
            if mine is None:
                news.append(row)
            elif (str(row[updated_at]), _canonical(row)) > (
                str(mine[updated_at]),
                _canonical(mine),
            ):
                # Equal timestamps are broken by content, so both PCs pick the same row.
                self._write(shape, row, merge, now, exists=True)
                merge.updated += 1
            else:
                merge.unchanged += 1
        for row in news:
            self._write(shape, row, merge, now, exists=False)
            merge.inserted += 1
        return merge

    def _write(
        self,
        shape: TableShape,
        row: tuple[Value, ...],
        merge: TableMerge,
        now: str,
        *,
        exists: bool,
    ) -> None:
        write = self._repo.replace if exists else self._repo.insert
        try:
            write(shape, row)
        except sqlite3.IntegrityError as exc:
            deleted_at = shape.columns.index("deleted_at")
            if not str(exc).startswith("UNIQUE") or row[deleted_at] is not None:
                raise
            # Both PCs made the same thing (a tag name, a day's check-in).
            # Keep the one here and store the other as deleted. The stamp is
            # newer than the other PC's version even if its clock runs ahead,
            # so the next export carries the decision back.
            stamp = max(now, _later(str(row[shape.columns.index("updated_at")])))
            stamped = {"deleted_at": stamp, "updated_at": stamp}
            write(shape, tuple(stamped.get(c, v) for c, v in zip(shape.columns, row, strict=True)))
            merge.conflicts += 1
