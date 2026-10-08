"""SQL for tags and taggings."""

import sqlite3
from collections.abc import Mapping, Sequence

from planbox.core.tags.models import Tag

_TAG_COLUMNS = "id, name, created_at, updated_at, deleted_at"


class TagRepository:
    """Reads and writes ``core_tags`` and ``core_taggings``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def list_live(self) -> list[Tag]:
        """All live tags, alphabetically (case-insensitive)."""
        rows = self._conn.execute(
            f"SELECT {_TAG_COLUMNS} FROM core_tags WHERE deleted_at IS NULL "  # noqa: S608
            "ORDER BY name COLLATE NOCASE, id"
        ).fetchall()
        return [Tag(**dict(row)) for row in rows]

    def get(self, tag_id: str) -> Tag | None:
        """A tag by id, live or deleted."""
        row = self._conn.execute(
            f"SELECT {_TAG_COLUMNS} FROM core_tags WHERE id = :id",  # noqa: S608
            {"id": tag_id},
        ).fetchone()
        return None if row is None else Tag(**dict(row))

    def find_live_by_name(self, name: str) -> Tag | None:
        """The live tag with this name, ignoring case."""
        row = self._conn.execute(
            f"SELECT {_TAG_COLUMNS} FROM core_tags "  # noqa: S608
            "WHERE deleted_at IS NULL AND lower(name) = lower(:name)",
            {"name": name},
        ).fetchone()
        return None if row is None else Tag(**dict(row))

    def live_ids(self, tag_ids: Sequence[str]) -> set[str]:
        """The subset of ``tag_ids`` that are live tags."""
        if not tag_ids:
            return set()
        placeholders = ",".join("?" * len(tag_ids))
        rows = self._conn.execute(
            f"SELECT id FROM core_tags WHERE deleted_at IS NULL AND id IN ({placeholders})",  # noqa: S608
            list(tag_ids),
        ).fetchall()
        return {str(row["id"]) for row in rows}

    def insert(self, tag: Tag) -> None:
        """Inserts a new tag."""
        self._conn.execute(
            "INSERT INTO core_tags (id, name, created_at, updated_at, deleted_at) "
            "VALUES (:id, :name, :created_at, :updated_at, :deleted_at)",
            {
                "id": tag.id,
                "name": tag.name,
                "created_at": tag.created_at,
                "updated_at": tag.updated_at,
                "deleted_at": tag.deleted_at,
            },
        )

    def rename(self, tag_id: str, name: str, now: str) -> None:
        """Changes a tag's name."""
        self._conn.execute(
            "UPDATE core_tags SET name = :name, updated_at = :now WHERE id = :id",
            {"id": tag_id, "name": name, "now": now},
        )

    def soft_delete(self, tag_id: str, now: str) -> None:
        """Deletes a tag and its live taggings with one shared timestamp."""
        params = {"id": tag_id, "now": now}
        self._conn.execute(
            "UPDATE core_tags SET deleted_at = :now, updated_at = :now WHERE id = :id", params
        )
        self._conn.execute(
            "UPDATE core_taggings SET deleted_at = :now, updated_at = :now "
            "WHERE tag_id = :id AND deleted_at IS NULL",
            params,
        )

    def restore(self, tag_id: str, deleted_at: str, now: str) -> None:
        """Undeletes a tag and the taggings deleted together with it."""
        params = {"id": tag_id, "deleted_at": deleted_at, "now": now}
        self._conn.execute(
            "UPDATE core_tags SET deleted_at = NULL, updated_at = :now WHERE id = :id", params
        )
        self._conn.execute(
            "UPDATE core_taggings SET deleted_at = NULL, updated_at = :now "
            "WHERE tag_id = :id AND deleted_at = :deleted_at",
            params,
        )

    def tag_ids_for(self, entity_type: str, entity_ids: Sequence[str]) -> dict[str, list[str]]:
        """Live tag ids per entity (entities without tags are omitted)."""
        result: dict[str, list[str]] = {}
        # SQLite limits bound parameters; chunk large batches.
        for start in range(0, len(entity_ids), 500):
            chunk = list(entity_ids[start : start + 500])
            placeholders = ",".join("?" * len(chunk))
            rows = self._conn.execute(
                "SELECT tg.entity_id, tg.tag_id FROM core_taggings tg "  # noqa: S608
                "JOIN core_tags t ON t.id = tg.tag_id AND t.deleted_at IS NULL "
                f"WHERE tg.deleted_at IS NULL AND tg.entity_type = ? "
                f"AND tg.entity_id IN ({placeholders}) "
                "ORDER BY t.name COLLATE NOCASE",
                [entity_type, *chunk],
            ).fetchall()
            for row in rows:
                result.setdefault(str(row["entity_id"]), []).append(str(row["tag_id"]))
        return result

    def live_taggings(self, entity_type: str, entity_id: str) -> Mapping[str, str]:
        """Live taggings of one entity as {tag_id: tagging_id}."""
        rows = self._conn.execute(
            "SELECT id, tag_id FROM core_taggings "
            "WHERE deleted_at IS NULL AND entity_type = :type AND entity_id = :id",
            {"type": entity_type, "id": entity_id},
        ).fetchall()
        return {str(row["tag_id"]): str(row["id"]) for row in rows}

    def insert_tagging(
        self, tagging_id: str, tag_id: str, entity_type: str, entity_id: str, now: str
    ) -> None:
        """Attaches a tag to an entity."""
        self._conn.execute(
            "INSERT INTO core_taggings "
            "(id, tag_id, entity_type, entity_id, created_at, updated_at, deleted_at) "
            "VALUES (:id, :tag_id, :type, :entity_id, :now, :now, NULL)",
            {
                "id": tagging_id,
                "tag_id": tag_id,
                "type": entity_type,
                "entity_id": entity_id,
                "now": now,
            },
        )

    def delete_tagging(self, tagging_id: str, now: str) -> None:
        """Detaches a tag (soft delete)."""
        self._conn.execute(
            "UPDATE core_taggings SET deleted_at = :now, updated_at = :now WHERE id = :id",
            {"id": tagging_id, "now": now},
        )
