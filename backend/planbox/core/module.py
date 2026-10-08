"""The manifest every feature module exports."""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import APIRouter

from planbox.core.entities import EntityType

MODULE_ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")
RESERVED_IDS = frozenset({"core", "api", "assets", "health", "meta", "tags", "links", "search"})


@dataclass(frozen=True, slots=True)
class Module:
    """A feature module as seen by the composition root.

    Attributes:
        id: Short lowercase name. It is the table prefix, the URL prefix
            (``/api/{id}``) and the prefix of its entity type names.
        router: The module's HTTP routes.
        migrations_dir: Folder with the module's numbered ``.sql`` migrations.
        entity_types: What the module exposes to tags, links and search.
    """

    id: str
    router: APIRouter
    migrations_dir: Path
    entity_types: Sequence[EntityType] = field(default_factory=tuple[EntityType, ...])

    def __post_init__(self) -> None:
        if MODULE_ID_RE.fullmatch(self.id) is None:
            raise ValueError(f"module id must match {MODULE_ID_RE.pattern}, got {self.id!r}")
        if self.id in RESERVED_IDS:
            raise ValueError(f"module id {self.id!r} is reserved")
        for entity_type in self.entity_types:
            if not entity_type.name.startswith(f"{self.id}."):
                raise ValueError(f"entity type {entity_type.name!r} must start with '{self.id}.'")
