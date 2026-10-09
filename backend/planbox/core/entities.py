"""Addressing entities across modules without importing them.

Tags, links and search refer to rows of any module through an ``EntityRef``.
Modules describe their entity types with ``EntityType``; the core resolves
refs through the ``EntityRegistry`` and never imports module code.
"""

import re
import sqlite3
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass

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


type Summarizer = Callable[[sqlite3.Connection, Sequence[str]], Mapping[str, EntitySummary]]


@dataclass(frozen=True, slots=True)
class EntityType:
    """An entity kind a module exposes to tags, links and search.

    Attributes:
        name: ``<module_id>.<kind>``, e.g. ``todos.todo``.
        summarize: Looks up summaries for a batch of ids; unknown ids are omitted.
    """

    name: str
    summarize: Summarizer

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

    def names(self) -> list[str]:
        """Returns all registered type names, sorted."""
        return sorted(self._types)
