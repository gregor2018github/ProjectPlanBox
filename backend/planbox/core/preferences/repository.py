"""SQL for preferences."""

import sqlite3


class PreferenceRepository:
    """Reads and writes ``core_preferences``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def all_live(self) -> dict[str, str]:
        """Every live preference, by key."""
        rows = self._conn.execute(
            "SELECT key, value FROM core_preferences WHERE deleted_at IS NULL"
        ).fetchall()
        return {str(r["key"]): str(r["value"]) for r in rows}

    def live_id(self, key: str) -> str | None:
        """The id of the live row for ``key``, if any."""
        row = self._conn.execute(
            "SELECT id FROM core_preferences WHERE deleted_at IS NULL AND key = ?", (key,)
        ).fetchone()
        return None if row is None else str(row["id"])

    def insert(self, row_id: str, key: str, value: str, now: str) -> None:
        """Adds a preference."""
        self._conn.execute(
            "INSERT INTO core_preferences (id, key, value, created_at, updated_at, deleted_at) "
            "VALUES (?, ?, ?, ?, ?, NULL)",
            (row_id, key, value, now, now),
        )

    def update(self, row_id: str, value: str, now: str) -> None:
        """Changes a preference's value."""
        self._conn.execute(
            "UPDATE core_preferences SET value = ?, updated_at = ? WHERE id = ?",
            (value, now, row_id),
        )
