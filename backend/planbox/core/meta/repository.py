"""SQL for health and metadata."""

import sqlite3

from planbox.core.db.migrations import applied_versions


class MetaRepository:
    """Reads database facts for the health endpoint."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def ping(self) -> bool:
        """Runs a trivial query to prove the database answers."""
        row = self._conn.execute("SELECT 1 AS ok").fetchone()
        return row is not None and int(row["ok"]) == 1

    def schema_versions(self) -> dict[str, int]:
        """Returns the highest applied migration version per owner."""
        return applied_versions(self._conn)
