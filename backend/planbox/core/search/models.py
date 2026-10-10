"""Search rows."""

from dataclasses import dataclass

from planbox.core.entities import EntityRef


@dataclass(frozen=True, slots=True)
class SyncState:
    """How far the index has copied one entity type."""

    id: str
    entity_type: str
    synced_through: str


@dataclass(frozen=True, slots=True)
class IndexMatch:
    """A raw match from the index.

    ``title`` and ``snippet`` mark matched terms with ``MATCH_START`` and
    ``MATCH_END``.
    """

    ref: EntityRef
    title: str
    snippet: str


@dataclass(frozen=True, slots=True)
class SearchHit:
    """A match with its live summary, ready to show."""

    ref: EntityRef
    title: str
    snippet: str
    hint: str
