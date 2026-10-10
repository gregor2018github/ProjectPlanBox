"""SQL for links."""

import sqlite3

from planbox.core.entities import EntityRef
from planbox.core.links.models import Link

_COLUMNS = "id, source_type, source_id, target_type, target_id, created_at, updated_at, deleted_at"


def _link(row: sqlite3.Row) -> Link:
    return Link(
        id=str(row["id"]),
        source=EntityRef(str(row["source_type"]), str(row["source_id"])),
        target=EntityRef(str(row["target_type"]), str(row["target_id"])),
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
        deleted_at=None if row["deleted_at"] is None else str(row["deleted_at"]),
    )


class LinkRepository:
    """Reads and writes ``core_links``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, link_id: str) -> Link | None:
        """A link by id, live or deleted."""
        row = self._conn.execute(
            f"SELECT {_COLUMNS} FROM core_links WHERE id = :id",  # noqa: S608
            {"id": link_id},
        ).fetchone()
        return None if row is None else _link(row)

    def live_for(self, ref: EntityRef) -> list[Link]:
        """Live links starting or ending at ``ref``, oldest first."""
        rows = self._conn.execute(
            f"SELECT {_COLUMNS} FROM core_links WHERE deleted_at IS NULL AND ("  # noqa: S608
            "(source_type = :type AND source_id = :id) OR (target_type = :type AND target_id = :id)"
            ") ORDER BY created_at, id",
            {"type": ref.entity_type, "id": ref.entity_id},
        ).fetchall()
        return [_link(r) for r in rows]

    def live_between(self, a: EntityRef, b: EntityRef) -> Link | None:
        """The live link between two entities, in either direction."""
        row = self._conn.execute(
            f"SELECT {_COLUMNS} FROM core_links WHERE deleted_at IS NULL AND ("  # noqa: S608
            "(source_type = :at AND source_id = :ai AND target_type = :bt AND target_id = :bi) OR "
            "(source_type = :bt AND source_id = :bi AND target_type = :at AND target_id = :ai))",
            {"at": a.entity_type, "ai": a.entity_id, "bt": b.entity_type, "bi": b.entity_id},
        ).fetchone()
        return None if row is None else _link(row)

    def insert(self, link: Link) -> None:
        """Inserts a link."""
        self._conn.execute(
            f"INSERT INTO core_links ({_COLUMNS}) VALUES "  # noqa: S608
            "(:id, :source_type, :source_id, :target_type, :target_id, "
            ":created_at, :updated_at, :deleted_at)",
            {
                "id": link.id,
                "source_type": link.source.entity_type,
                "source_id": link.source.entity_id,
                "target_type": link.target.entity_type,
                "target_id": link.target.entity_id,
                "created_at": link.created_at,
                "updated_at": link.updated_at,
                "deleted_at": link.deleted_at,
            },
        )

    def set_deleted(self, link_id: str, deleted_at: str | None, now: str) -> None:
        """Soft-deletes (or, with ``None``, restores) a link."""
        self._conn.execute(
            "UPDATE core_links SET deleted_at = :deleted_at, updated_at = :now WHERE id = :id",
            {"id": link_id, "deleted_at": deleted_at, "now": now},
        )
