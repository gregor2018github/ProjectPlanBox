"""HTTP shapes for the knowledge module."""

from typing import Literal

from pydantic import BaseModel, Field

type Kind = Literal["note", "link", "snippet"]


class CollectionOut(BaseModel):
    """A collection of entries."""

    id: str
    name: str
    position: str
    created_at: str
    updated_at: str


class CollectionCreate(BaseModel):
    """Create a collection at the end; send a client ``id`` for idempotent, optimistic creates."""

    id: str | None = None
    name: str


class CollectionRename(BaseModel):
    """Rename a collection."""

    name: str


class CollectionMove(BaseModel):
    """Reorder a collection between two neighbours (either may be omitted)."""

    before_id: str | None = None
    after_id: str | None = None


class EntryOut(BaseModel):
    """A note, link or snippet. ``collection_id`` null means Unsorted."""

    id: str
    collection_id: str | None
    kind: Kind
    title: str
    body: str = Field(description="Note text, link description or snippet code.")
    url: str | None = Field(description="Links only: an http(s) address.")
    language: str | None = Field(description="Snippets only, e.g. python.")
    created_at: str
    updated_at: str
    tag_ids: list[str]


class EntryCreate(BaseModel):
    """Create an entry; send a client-generated ``id`` for idempotent, optimistic creates."""

    id: str | None = None
    collection_id: str | None = None
    kind: Kind
    title: str
    body: str = ""
    url: str | None = None
    language: str | None = None
    tag_ids: list[str] = Field(default_factory=list[str])


class EntryPatch(BaseModel):
    """Partial update: absent fields stay unchanged, ``null`` clears (language, collection)."""

    title: str | None = None
    body: str | None = None
    url: str | None = None
    language: str | None = None
    collection_id: str | None = None
    tag_ids: list[str] | None = None


class KnowledgeDeletedOut(BaseModel):
    """What a delete (or its restore) touched; restore by id to undo."""

    deleted_at: str
    collections: int
    entries: int
