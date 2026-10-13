"""SQL for export and import, generic over every synced table.

Table and column names are only ever taken from this database's own schema,
never from an export file, before they are put into SQL.
"""

import sqlite3
from collections.abc import Sequence

from planbox.core.data.models import MigrationStamp, TableShape, Value

DERIVED_TABLES = frozenset({"schema_migrations", "core_search_sync"})
"""Tables rebuilt from the others (the search watermarks) or bookkeeping."""

SYNC_COLUMNS = frozenset({"id", "updated_at", "deleted_at"})


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


class DataRepository:
    """Reads and writes rows of any synced table."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def tables(self) -> list[TableShape]:
        """The synced tables in name order.

        A table is synced when it has ``id``, ``updated_at`` and ``deleted_at``
        (every table does, by convention) and is not derived. The full-text
        index and its shadow tables have none of these, so they drop out.
        """
        names = [
            str(row["name"])
            for row in self._conn.execute(
                "SELECT name FROM sqlite_schema WHERE type = 'table' "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        shapes: list[TableShape] = []
        for name in names:
            if name in DERIVED_TABLES:
                continue
            info = self._conn.execute(f"PRAGMA table_info({_quote(name)})").fetchall()
            columns = tuple(str(row["name"]) for row in info)
            types = tuple(str(row["type"]).upper() for row in info)
            if set(columns) >= SYNC_COLUMNS:
                shapes.append(TableShape(name, columns, types))
        return shapes

    def migrations(self) -> list[MigrationStamp]:
        """The applied migrations, by owner and version."""
        rows = self._conn.execute(
            "SELECT owner, version, checksum FROM schema_migrations ORDER BY owner, version"
        ).fetchall()
        return [
            MigrationStamp(str(r["owner"]), int(r["version"]), str(r["checksum"])) for r in rows
        ]

    def rows(self, table: TableShape) -> list[tuple[Value, ...]]:
        """Every row of ``table`` (tombstones included), in id order."""
        columns = ", ".join(_quote(c) for c in table.columns)
        cursor = self._conn.execute(
            f"SELECT {columns} FROM {_quote(table.name)} ORDER BY id"  # noqa: S608
        )
        return [tuple(row) for row in cursor]

    def insert(self, table: TableShape, values: Sequence[Value]) -> None:
        """Inserts one row (values in the table's column order).

        Raises:
            sqlite3.IntegrityError: If it breaks a constraint. Only this
                statement is undone; the transaction stays usable.
        """
        columns = ", ".join(_quote(c) for c in table.columns)
        marks = ", ".join("?" for _ in table.columns)
        self._conn.execute(
            f"INSERT INTO {_quote(table.name)} ({columns}) VALUES ({marks})",  # noqa: S608
            tuple(values),
        )

    def replace(self, table: TableShape, values: Sequence[Value]) -> None:
        """Overwrites every column of the row with the same id.

        Raises:
            sqlite3.IntegrityError: As for ``insert``.
        """
        pairs = [(c, v) for c, v in zip(table.columns, values, strict=True) if c != "id"]
        assignments = ", ".join(f"{_quote(c)} = ?" for c, _ in pairs)
        row_id = values[table.columns.index("id")]
        self._conn.execute(
            f"UPDATE {_quote(table.name)} SET {assignments} WHERE id = ?",  # noqa: S608
            (*(v for _, v in pairs), row_id),
        )

    def defer_foreign_keys(self) -> None:
        """Checks foreign keys at commit, so rows can arrive in any order.

        Resets by itself when the transaction ends.
        """
        self._conn.execute("PRAGMA defer_foreign_keys = ON")

    def foreign_key_violations(self) -> int:
        """Rows that point at a row that does not exist."""
        return len(self._conn.execute("PRAGMA foreign_key_check").fetchall())
