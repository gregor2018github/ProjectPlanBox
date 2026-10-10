"""SQL for the search index."""

import sqlite3

from planbox.core.entities import EntityRef
from planbox.core.search.models import IndexMatch, SyncState

MATCH_START = ""
"""Marks the start of a matched term in titles and snippets (a private-use character)."""
MATCH_END = ""
"""Marks the end of a matched term."""

_TITLE_WEIGHT = 8.0
_BODY_WEIGHT = 1.0
_SNIPPET_TOKENS = 12


class SearchRepository:
    """Reads and writes ``core_search`` and ``core_search_sync``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def sync_state(self, entity_type: str) -> SyncState | None:
        """The live sync row of an entity type, if it was ever indexed."""
        row = self._conn.execute(
            "SELECT id, entity_type, synced_through FROM core_search_sync "
            "WHERE entity_type = ? AND deleted_at IS NULL",
            (entity_type,),
        ).fetchone()
        if row is None:
            return None
        return SyncState(str(row["id"]), str(row["entity_type"]), str(row["synced_through"]))

    def insert_sync_state(self, state: SyncState, now: str) -> None:
        """Records the first sync of an entity type."""
        self._conn.execute(
            "INSERT INTO core_search_sync "
            "(id, entity_type, synced_through, created_at, updated_at, deleted_at) "
            "VALUES (?, ?, ?, ?, ?, NULL)",
            (state.id, state.entity_type, state.synced_through, now, now),
        )

    def update_sync_state(self, state_id: str, synced_through: str, now: str) -> None:
        """Moves an entity type's watermark."""
        self._conn.execute(
            "UPDATE core_search_sync SET synced_through = ?, updated_at = ? WHERE id = ?",
            (synced_through, now, state_id),
        )

    def forget_sync_states(self, now: str) -> None:
        """Retires every watermark, so the next sync copies everything again."""
        self._conn.execute(
            "UPDATE core_search_sync SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL",
            (now, now),
        )

    def clear(self, entity_type: str | None = None) -> None:
        """Empties the index, or only one entity type's documents."""
        if entity_type is None:
            self._conn.execute("DELETE FROM core_search")
        else:
            self._conn.execute("DELETE FROM core_search WHERE entity_type = ?", (entity_type,))

    def remove(self, rowid: int) -> None:
        """Drops one document by its row id."""
        self._conn.execute("DELETE FROM core_search WHERE rowid = ?", (rowid,))

    def insert(self, rowid: int, ref: EntityRef, title: str, body: str) -> None:
        """Adds one document under a given row id."""
        self._conn.execute(
            "INSERT INTO core_search (rowid, entity_type, entity_id, title, body) "
            "VALUES (?, ?, ?, ?, ?)",
            (rowid, ref.entity_type, ref.entity_id, title, body),
        )

    def match(self, expression: str, limit: int) -> list[IndexMatch]:
        """Documents matching an FTS5 expression, best first (title matches weigh more)."""
        rows = self._conn.execute(
            "SELECT entity_type, entity_id, "
            "highlight(core_search, 2, :start, :end) AS title, "
            "snippet(core_search, 3, :start, :end, '…', :tokens) AS snippet "
            "FROM core_search WHERE core_search MATCH :expression "
            "ORDER BY bm25(core_search, 0.0, 0.0, :title_weight, :body_weight) LIMIT :limit",
            {
                "start": MATCH_START,
                "end": MATCH_END,
                "tokens": _SNIPPET_TOKENS,
                "expression": expression,
                "title_weight": _TITLE_WEIGHT,
                "body_weight": _BODY_WEIGHT,
                "limit": limit,
            },
        ).fetchall()
        return [
            IndexMatch(
                ref=EntityRef(str(r["entity_type"]), str(r["entity_id"])),
                title=str(r["title"]),
                snippet=str(r["snippet"] or ""),
            )
            for r in rows
        ]
