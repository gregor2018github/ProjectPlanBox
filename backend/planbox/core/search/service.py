"""Search use cases: keep the index in step with the modules, then query it.

Modules do not push changes. Each entity type offers its documents changed
since an instant, and every search first copies what changed since the last
sync (see ARCHITECTURE §6.3). The index therefore cannot miss a write path,
and rebuilding it is just forgetting the watermarks.
"""

import hashlib
import re
import sqlite3
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta

from planbox.core.clock import Clock, to_iso, utc_now_iso
from planbox.core.db import transaction
from planbox.core.entities import EntityRef, EntityRegistry, EntitySummary, EntityType
from planbox.core.ids import new_id
from planbox.core.search.models import IndexMatch, SearchHit, SyncState
from planbox.core.search.repository import SearchRepository

MAX_TERMS = 8
"""Words beyond this are ignored (each one only narrows the result further)."""

SYNC_OVERLAP = timedelta(seconds=60)
"""Re-reads this much before the watermark, so a write that committed late
with an earlier timestamp is still picked up. Re-indexing is idempotent."""

_TERM_RE = re.compile(r"\w+")


def match_expression(query: str) -> str | None:
    """Turns what the user typed into an FTS5 expression.

    Every word must match as a prefix (``rep out`` finds "Report outline").
    Operators and quotes in the input have no special meaning.

    Returns:
        The expression, or ``None`` when the query has no words.
    """
    terms = _TERM_RE.findall(query.lower())[:MAX_TERMS]
    if not terms:
        return None
    return " ".join(f'"{term}"*' for term in terms)


def index_rowid(ref: EntityRef) -> int:
    """A stable 63-bit row id per entity, so a document is replaced in place."""
    digest = hashlib.blake2b(str(ref).encode(), digest_size=8).digest()
    return int.from_bytes(digest) >> 1


class SearchService:
    """Keeps the full-text index current and answers queries."""

    def __init__(
        self,
        conn: sqlite3.Connection,
        repository: SearchRepository,
        registry: EntityRegistry,
        clock: Clock,
    ) -> None:
        self._conn = conn
        self._repo = repository
        self._registry = registry
        self._clock = clock

    def search(self, query: str, limit: int) -> list[SearchHit]:
        """Live entities matching every word of ``query``, best first."""
        expression = match_expression(query)
        if expression is None:
            return []
        self.sync()
        # A few extra, in case some matches belong to types that are no longer registered.
        matches = self._repo.match(expression, limit + 10)
        summaries = self._summaries(matches)
        hits: list[SearchHit] = []
        for match in matches:
            summary = summaries.get(match.ref)
            if summary is None or summary.deleted:
                continue
            hits.append(SearchHit(match.ref, match.title, match.snippet, summary.hint))
        return hits[:limit]

    def sync(self) -> None:
        """Copies every change since the last sync into the index."""
        with transaction(self._conn):
            for name in self._registry.names():
                entity_type = self._registry.get(name)
                if entity_type is not None:
                    self._sync_type(entity_type)

    def rebuild(self) -> None:
        """Empties the index; the next search fills it again from scratch."""
        with transaction(self._conn):
            self._repo.clear()
            self._repo.forget_sync_states(utc_now_iso(self._clock))

    def _sync_type(self, entity_type: EntityType) -> None:
        if entity_type.documents is None:
            return
        state = self._repo.sync_state(entity_type.name)
        since = None if state is None else _earlier(state.synced_through, SYNC_OVERLAP)
        documents = list(entity_type.documents(self._conn, since))
        if state is None:
            self._repo.clear(entity_type.name)
        for doc in documents:
            ref = EntityRef(entity_type.name, doc.id)
            rowid = index_rowid(ref)
            self._repo.remove(rowid)
            if not doc.deleted:
                self._repo.insert(rowid, ref, doc.title, doc.body)

        now = utc_now_iso(self._clock)
        newest = max((d.updated_at for d in documents), default=None)
        if state is None:
            self._repo.insert_sync_state(SyncState(new_id(), entity_type.name, newest or now), now)
        elif newest is not None and newest > state.synced_through:
            self._repo.update_sync_state(state.id, newest, now)

    def _summaries(self, matches: Sequence[IndexMatch]) -> Mapping[EntityRef, EntitySummary]:
        ids_by_type: dict[str, list[str]] = {}
        for match in matches:
            ids_by_type.setdefault(match.ref.entity_type, []).append(match.ref.entity_id)
        result: dict[EntityRef, EntitySummary] = {}
        for name, ids in ids_by_type.items():
            entity_type = self._registry.get(name)
            if entity_type is None:
                continue
            for entity_id, summary in entity_type.summarize(self._conn, ids).items():
                result[EntityRef(name, entity_id)] = summary
        return result


def _earlier(instant: str, delta: timedelta) -> str:
    return to_iso(datetime.fromisoformat(instant) - delta)
