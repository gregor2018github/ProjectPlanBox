"""Rows of the knowledge module."""

from dataclasses import dataclass, field
from typing import Literal

type EntryKind = Literal["note", "link", "snippet"]


@dataclass(frozen=True, slots=True)
class Collection:
    """A named group of entries."""

    id: str
    name: str
    position: str
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class Entry:
    """A note, link or snippet; ``collection_id`` None means Unsorted."""

    id: str
    collection_id: str | None
    kind: EntryKind
    title: str
    body: str
    url: str | None
    language: str | None
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class EntryRecord:
    """An entry with its tag ids."""

    entry: Entry
    tag_ids: list[str] = field(default_factory=list[str])


@dataclass(frozen=True, slots=True)
class Deletion:
    """What a delete (or its restore) touched; all rows share ``deleted_at``."""

    deleted_at: str
    collections: int = 0
    entries: int = 0
