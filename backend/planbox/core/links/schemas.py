"""HTTP shapes for links."""

from pydantic import BaseModel, Field


class LinkEndOut(BaseModel):
    """One end of a link."""

    ref: str = Field(description="Entity reference, e.g. 'todos.todo:<id>'.")
    title: str
    deleted: bool = Field(description="True when the entity is deleted (or no longer known).")


class LinkOut(BaseModel):
    """A link with both ends summarised."""

    id: str
    source: LinkEndOut
    target: LinkEndOut
    created_at: str


class LinkCreate(BaseModel):
    """Link two entities; send a client-generated ``id`` for idempotent, optimistic creates."""

    id: str | None = None
    source: str = Field(description="Entity reference of the linking item.")
    target: str = Field(description="Entity reference of the linked item.")


class LinkDeletedOut(BaseModel):
    """Result of a soft delete; restore by id to undo."""

    id: str
    deleted_at: str
