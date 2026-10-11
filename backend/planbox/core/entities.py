"""Addressing entities across modules without importing them.

Tags, links and search refer to rows of any module through an ``EntityRef``.
Modules describe their entity types with ``EntityType``; the core resolves
refs through the ``EntityRegistry`` and never imports module code.
"""

import re
import sqlite3
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

_TYPE_RE = re.compile(r"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$")


@dataclass(frozen=True, slots=True)
class EntityRef:
    """A pointer to one row of some module, e.g. ``todos.todo:<uuid>``."""

    entity_type: str
    entity_id: str

    def __str__(self) -> str:
        return f"{self.entity_type}:{self.entity_id}"

    @classmethod
    def parse(cls, text: str) -> "EntityRef":
        """Parses ``<module>.<kind>:<id>``.

        Raises:
            ValueError: If the text is not a well-formed reference.
        """
        entity_type, sep, entity_id = text.partition(":")
        if not sep or not entity_id or _TYPE_RE.fullmatch(entity_type) is None:
            raise ValueError(f"not an entity reference: {text!r}")
        return cls(entity_type, entity_id)


@dataclass(frozen=True, slots=True)
class EntitySummary:
    """What other modules need to display a referenced entity."""

    title: str
    deleted: bool
    hint: str = ""
    """Short context for search hits, e.g. ``Done · Groceries`` (may be empty)."""


@dataclass(frozen=True, slots=True)
class SearchDocument:
    """What the search index stores for one entity (live or deleted)."""

    id: str
    title: str
    body: str
    deleted: bool
    updated_at: str


@dataclass(frozen=True, slots=True)
class ActivityEvent:
    """One thing that happened to an entity, for the Insights activity overview.

    Attributes:
        action: ``created``, ``completed`` (done, checked off) or ``deleted``.
        at: The UTC instant it happened (fixed-width ISO-8601).
    """

    action: Literal["created", "completed", "deleted"]
    at: str


def lifecycle_events(rows: Iterable[tuple[str, str | None]]) -> list[ActivityEvent]:
    """Turns ``(created_at, deleted_at)`` pairs into created and deleted events."""
    events: list[ActivityEvent] = []
    for created_at, deleted_at in rows:
        events.append(ActivityEvent("created", created_at))
        if deleted_at is not None:
            events.append(ActivityEvent("deleted", deleted_at))
    return events


type Summarizer = Callable[[sqlite3.Connection, Sequence[str]], Mapping[str, EntitySummary]]
type DocumentSource = Callable[[sqlite3.Connection, str | None], Iterable[SearchDocument]]
"""Documents whose ``updated_at`` is at or after the given instant (all for ``None``)."""
type ActivitySource = Callable[[sqlite3.Connection, str], Iterable[ActivityEvent]]
"""Activity events at or after the given instant (soft-deleted rows included)."""


@dataclass(frozen=True, slots=True)
class EntityType:
    """An entity kind a module exposes to tags, links and search.

    Attributes:
        name: ``<module_id>.<kind>``, e.g. ``todos.todo``.
        summarize: Looks up summaries for a batch of ids; unknown ids are omitted.
        documents: Feeds the search index. Every write must bump ``updated_at``
            (soft deletes included) so the index picks the change up.
        activity: Feeds the Insights activity overview (what was created,
            completed and deleted when).
    """

    name: str
    summarize: Summarizer
    documents: DocumentSource | None = None
    activity: ActivitySource | None = None

    def __post_init__(self) -> None:
        if _TYPE_RE.fullmatch(self.name) is None:
            raise ValueError(f"entity type names look like 'module.kind', got {self.name!r}")


class EntityRegistry:
    """All entity types of the enabled modules, keyed by name."""

    def __init__(self, entity_types: Iterable[EntityType] = ()) -> None:
        self._types: dict[str, EntityType] = {}
        for entity_type in entity_types:
            self.register(entity_type)

    def register(self, entity_type: EntityType) -> None:
        """Adds a type.

        Raises:
            ValueError: If the name is already registered.
        """
        if entity_type.name in self._types:
            raise ValueError(f"entity type {entity_type.name!r} registered twice")
        self._types[entity_type.name] = entity_type

    def get(self, name: str) -> EntityType | None:
        """Returns the type with this name, if any."""
        return self._types.get(name)

    def all_types(self) -> list[EntityType]:
        """Returns all registered types, sorted by name."""
        return [self._types[name] for name in sorted(self._types)]

    def names(self) -> list[str]:
        """Returns all registered type names, sorted."""
        return sorted(self._types)
