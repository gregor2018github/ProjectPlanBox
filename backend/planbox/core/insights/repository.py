"""SQL for app opens."""

import dataclasses
import sqlite3

from planbox.core.insights.models import AppOpen

_OPEN = "id, created_at, updated_at, deleted_at"


class AppOpenRepository:
    """``core_app_opens``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, open_id: str) -> AppOpen | None:
        """An app open by id."""
        row = self._conn.execute(
            f"SELECT {_OPEN} FROM core_app_opens WHERE id = ?",  # noqa: S608
            (open_id,),
        ).fetchone()
        return None if row is None else AppOpen(**dict(row))

    def insert(self, app_open: AppOpen) -> None:
        """Records an app open."""
        self._conn.execute(
            f"INSERT INTO core_app_opens ({_OPEN}) "  # noqa: S608
            "VALUES (:id, :created_at, :updated_at, :deleted_at)",
            dataclasses.asdict(app_open),
        )

    def instants_between(self, since: str, until: str) -> list[str]:
        """When the app was opened, at/after ``since`` and before ``until``, ascending."""
        rows = self._conn.execute(
            "SELECT created_at FROM core_app_opens WHERE deleted_at IS NULL "
            "AND created_at >= ? AND created_at < ? ORDER BY created_at",
            (since, until),
        ).fetchall()
        return [str(r["created_at"]) for r in rows]

    def totals(self) -> tuple[int, str | None]:
        """All-time count of app opens and the first one's instant."""
        row = self._conn.execute(
            "SELECT count(*) AS n, min(created_at) AS first FROM core_app_opens "
            "WHERE deleted_at IS NULL"
        ).fetchone()
        return int(row["n"]), row["first"]
