"""Link rows."""

from dataclasses import dataclass

from planbox.core.entities import EntityRef


@dataclass(frozen=True, slots=True)
class Link:
    """A live or deleted link from one entity to another."""

    id: str
    source: EntityRef
    target: EntityRef
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class LinkEnd:
    """One end of a link, summarised for display."""

    ref: EntityRef
    title: str
    deleted: bool


@dataclass(frozen=True, slots=True)
class LinkView:
    """A link with both ends summarised through the entity registry."""

    id: str
    source: LinkEnd
    target: LinkEnd
    created_at: str
