"""HTTP shapes for the knowledge module."""

from typing import Literal

from pydantic import BaseModel, Field, JsonValue


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


class PageBox(BaseModel):
    """A box on a page: where it sits and the rich text it holds."""

    id: str = Field(min_length=1, max_length=64, description="Unique within the page.")
    x: int = Field(ge=0, le=100_000, description="Pixels from the page's left edge.")
    y: int = Field(ge=0, le=100_000, description="Pixels from the page's top edge.")
    width: int = Field(ge=40, le=10_000)
    doc: dict[str, JsonValue] = Field(
        description="Tiptap (ProseMirror) JSON with a `doc` node at the top."
    )


class PageContent(BaseModel):
    """What a page holds: freely placed boxes, in stacking order."""

    boxes: list[PageBox] = Field(max_length=500)


class EntryOut(BaseModel):
    """A page. ``collection_id`` null means Unsorted."""

    id: str
    collection_id: str | None
    title: str
    content: PageContent
    body: str = Field(description="The page's plain text, derived from its content.")
    created_at: str
    updated_at: str
    tag_ids: list[str]


class EntryCreate(BaseModel):
    """Create a page; send a client-generated ``id`` for idempotent, optimistic creates."""

    id: str | None = None
    collection_id: str | None = None
    title: str
    content: PageContent = Field(default_factory=lambda: PageContent(boxes=[]))
    tag_ids: list[str] = Field(default_factory=list[str])


class EntryPatch(BaseModel):
    """Partial update: absent fields stay unchanged, ``null`` clears the collection."""

    title: str | None = None
    content: PageContent | None = None
    collection_id: str | None = None
    tag_ids: list[str] | None = None


class ImageUpload(BaseModel):
    """An image to put on a page, as base64 (a JSON body, ARCHITECTURE §9)."""

    data: str = Field(description="The file's bytes, base64-encoded.")
    type: Literal["image/png", "image/jpeg", "image/gif", "image/webp"]


class ImageOut(BaseModel):
    """A saved image."""

    url: str = Field(description="Where the image is served; use it as the image node's src.")


class KnowledgeDeletedOut(BaseModel):
    """What a delete (or its restore) touched; restore by id to undo."""

    deleted_at: str
    collections: int
    entries: int
