"""SQL for the knowledge module. Repositories never commit; services own transactions."""

import dataclasses
import sqlite3
from collections.abc import Mapping, Sequence
from typing import cast

from planbox.core.placement import Positions
from planbox.modules.knowledge.models import Collection, Entry, EntryKind

_COLLECTION = "id, name, position, created_at, updated_at, deleted_at"
_ENTRY = "id, collection_id, kind, title, body, url, language, created_at, updated_at, deleted_at"
_ENTRY_EDITABLE = frozenset({"collection_id", "title", "body", "url", "language"})


def _entry(row: sqlite3.Row) -> Entry:
    return Entry(
        id=str(row["id"]),
        collection_id=row["collection_id"],
        kind=cast("EntryKind", row["kind"]),
        title=str(row["title"]),
        body=str(row["body"]),
        url=row["url"],
        language=row["language"],
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
        deleted_at=row["deleted_at"],
    )


class CollectionRepository:
    """``knowledge_collections``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, collection_id: str) -> Collection | None:
        """A collection by id, live or deleted."""
        row = self._conn.execute(
            f"SELECT {_COLLECTION} FROM knowledge_collections WHERE id = ?",  # noqa: S608
            (collection_id,),
        ).fetchone()
        return None if row is None else Collection(**dict(row))

    def list_live(self) -> list[Collection]:
        """Live collections in order."""
        rows = self._conn.execute(
            f"SELECT {_COLLECTION} FROM knowledge_collections "  # noqa: S608
            "WHERE deleted_at IS NULL ORDER BY position, id"
        ).fetchall()
        return [Collection(**dict(r)) for r in rows]

    def positions(self, exclude_id: str | None = None) -> Positions:
        """Positions of live collections."""
        rows = self._conn.execute(
            "SELECT id, position FROM knowledge_collections "
            "WHERE deleted_at IS NULL AND id IS NOT ? ORDER BY position, id",
            (exclude_id,),
        ).fetchall()
        return [(str(r["id"]), str(r["position"])) for r in rows]

    def insert(self, collection: Collection) -> None:
        """Inserts a collection."""
        self._conn.execute(
            f"INSERT INTO knowledge_collections ({_COLLECTION}) "  # noqa: S608
            "VALUES (:id, :name, :position, :created_at, :updated_at, :deleted_at)",
            dataclasses.asdict(collection),
        )

    def update(self, collection_id: str, fields: Mapping[str, object], now: str) -> None:
        """Updates name and/or position."""
        _update(
            self._conn,
            "knowledge_collections",
            collection_id,
            fields,
            allowed={"name", "position"},
            now=now,
        )

    def set_deleted(self, collection_id: str, deleted_at: str | None, now: str) -> None:
        """Soft-deletes (or, with ``None``, restores) one collection."""
        self._conn.execute(
            "UPDATE knowledge_collections SET deleted_at = ?, updated_at = ? WHERE id = ?",
            (deleted_at, now, collection_id),
        )


class EntryRepository:
    """``knowledge_entries``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, entry_id: str) -> Entry | None:
        """An entry by id, live or deleted."""
        row = self._conn.execute(
            f"SELECT {_ENTRY} FROM knowledge_entries WHERE id = ?",  # noqa: S608
            (entry_id,),
        ).fetchone()
        return None if row is None else _entry(row)

    def list_live(self) -> list[Entry]:
        """Live entries, most recently changed first."""
        rows = self._conn.execute(
            f"SELECT {_ENTRY} FROM knowledge_entries "  # noqa: S608
            "WHERE deleted_at IS NULL ORDER BY updated_at DESC, id DESC"
        ).fetchall()
        return [_entry(r) for r in rows]

    def live_ids_in(self, collection_id: str) -> list[str]:
        """Ids of live entries in a collection."""
        rows = self._conn.execute(
            "SELECT id FROM knowledge_entries WHERE deleted_at IS NULL AND collection_id = ?",
            (collection_id,),
        ).fetchall()
        return [str(r["id"]) for r in rows]

    def ids_deleted_with(self, collection_id: str, deleted_at: str) -> list[str]:
        """Ids of entries deleted together with a collection."""
        rows = self._conn.execute(
            "SELECT id FROM knowledge_entries WHERE collection_id = ? AND deleted_at = ?",
            (collection_id, deleted_at),
        ).fetchall()
        return [str(r["id"]) for r in rows]

    def insert(self, entry: Entry) -> None:
        """Inserts an entry."""
        self._conn.execute(
            f"INSERT INTO knowledge_entries ({_ENTRY}) VALUES "  # noqa: S608
            "(:id, :collection_id, :kind, :title, :body, :url, :language, "
            ":created_at, :updated_at, :deleted_at)",
            dataclasses.asdict(entry),
        )

    def update(self, entry_id: str, fields: Mapping[str, object], now: str) -> None:
        """Updates editable fields."""
        _update(self._conn, "knowledge_entries", entry_id, fields, allowed=_ENTRY_EDITABLE, now=now)

    def touch(self, entry_id: str, now: str) -> None:
        """Marks an entry as changed (e.g. its tags changed)."""
        self._conn.execute(
            "UPDATE knowledge_entries SET updated_at = ? WHERE id = ?", (now, entry_id)
        )

    def set_deleted(self, entry_ids: Sequence[str], deleted_at: str | None, now: str) -> int:
        """Soft-deletes (or restores) entries; returns how many rows changed."""
        changed = 0
        for start in range(0, len(entry_ids), 500):
            chunk = list(entry_ids[start : start + 500])
            marks = ",".join("?" * len(chunk))
            cursor = self._conn.execute(
                "UPDATE knowledge_entries SET deleted_at = ?, updated_at = ? "  # noqa: S608
                f"WHERE id IN ({marks})",
                [deleted_at, now, *chunk],
            )
            changed += cursor.rowcount
        return changed


def _update(
    conn: sqlite3.Connection,
    table: str,
    row_id: str,
    fields: Mapping[str, object],
    *,
    allowed: frozenset[str] | set[str],
    now: str,
) -> None:
    unknown = set(fields) - set(allowed)
    if unknown:
        raise ValueError(f"cannot update {sorted(unknown)} on {table}")
    if not fields:
        return
    assignments = ", ".join(f"{name} = :{name}" for name in fields)
    conn.execute(
        f"UPDATE {table} SET {assignments}, updated_at = :updated_at WHERE id = :id",  # noqa: S608
        {**fields, "updated_at": now, "id": row_id},
    )


def summarize_entries(conn: sqlite3.Connection, ids: Sequence[str]) -> dict[str, tuple[str, bool]]:
    """Title and deleted flag per entry id (for core tags/links/search)."""
    result: dict[str, tuple[str, bool]] = {}
    for start in range(0, len(ids), 500):
        chunk = list(ids[start : start + 500])
        rows = conn.execute(
            "SELECT id, title, deleted_at FROM knowledge_entries "  # noqa: S608
            f"WHERE id IN ({','.join('?' * len(chunk))})",
            chunk,
        ).fetchall()
        for r in rows:
            result[str(r["id"])] = (str(r["title"]), r["deleted_at"] is not None)
    return result
