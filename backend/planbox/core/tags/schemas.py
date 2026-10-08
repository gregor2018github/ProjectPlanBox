"""HTTP shapes for tags."""

from pydantic import BaseModel


class TagOut(BaseModel):
    """A tag."""

    id: str
    name: str
    created_at: str
    updated_at: str


class TagCreate(BaseModel):
    """Create a tag; send a client-generated ``id`` for idempotent, optimistic creates."""

    id: str | None = None
    name: str


class TagPatch(BaseModel):
    """Rename a tag."""

    name: str


class TagDeletedOut(BaseModel):
    """Result of a soft delete; restore by id to undo."""

    id: str
    deleted_at: str
