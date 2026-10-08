"""HTTP shapes for the todos module.

Creates accept a client-generated ``id`` (UUIDv7) so optimistic rows are the
real rows and retries are idempotent. Moves name the neighbours
(``after_id`` / ``before_id``); see ``service.place`` for the exact rule.
"""

from datetime import date

from pydantic import BaseModel, Field


class AreaOut(BaseModel):
    """An area."""

    id: str
    name: str
    position: str
    created_at: str
    updated_at: str


class AreaCreate(BaseModel):
    """Create an area at the end."""

    id: str | None = None
    name: str


class Rename(BaseModel):
    """Rename an area, list or section."""

    name: str


class AreaMove(BaseModel):
    """Reorder an area."""

    before_id: str | None = None
    after_id: str | None = None


class ListOut(BaseModel):
    """A list; ``area_id`` is null for lists outside any area."""

    id: str
    area_id: str | None
    name: str
    position: str
    created_at: str
    updated_at: str


class ListCreate(BaseModel):
    """Create a list at the end of its area."""

    id: str | None = None
    name: str
    area_id: str | None = None


class ListMove(BaseModel):
    """Reorder a list and/or move it to another area (``area_id`` is required, may be null)."""

    area_id: str | None
    before_id: str | None = None
    after_id: str | None = None


class SectionOut(BaseModel):
    """A section (heading) inside a list."""

    id: str
    list_id: str
    name: str
    position: str
    created_at: str
    updated_at: str


class SectionCreate(BaseModel):
    """Create a section in a list (at the end unless neighbours are given)."""

    id: str | None = None
    list_id: str
    name: str
    before_id: str | None = None
    after_id: str | None = None


class SectionMove(BaseModel):
    """Reorder a section; another ``list_id`` takes its todos along."""

    list_id: str
    before_id: str | None = None
    after_id: str | None = None


class TodoOut(BaseModel):
    """A todo; ``parent_id`` set means it is a subtask; ``list_id`` null means Inbox."""

    id: str
    list_id: str | None
    section_id: str | None
    parent_id: str | None
    title: str
    notes: str
    priority: int = Field(ge=0, le=3)
    due_date: date | None
    position: str
    completed_at: str | None
    created_at: str
    updated_at: str
    tag_ids: list[str]


class TodoCreate(BaseModel):
    """Create a todo or subtask (at the end of its container unless neighbours are given)."""

    id: str | None = None
    title: str
    notes: str = ""
    priority: int = Field(default=0, ge=0, le=3)
    due_date: date | None = None
    list_id: str | None = None
    section_id: str | None = None
    parent_id: str | None = None
    tag_ids: list[str] = Field(default_factory=list[str])
    before_id: str | None = None
    after_id: str | None = None


class TodoPatch(BaseModel):
    """Change fields of a todo. Absent fields stay; ``due_date: null`` clears the date."""

    title: str | None = None
    notes: str | None = None
    priority: int | None = Field(default=None, ge=0, le=3)
    due_date: date | None = None
    tag_ids: list[str] | None = None


class TodoMove(BaseModel):
    """Place a todo: the three container fields are required (each may be null)."""

    list_id: str | None
    section_id: str | None
    parent_id: str | None
    before_id: str | None = None
    after_id: str | None = None


class TodosOut(BaseModel):
    """Every todo a request changed (e.g. a parent and its subtasks)."""

    todos: list[TodoOut]


class LogbookOut(BaseModel):
    """A page of completed todos, newest first; pass ``next_cursor`` for the next page."""

    todos: list[TodoOut]
    next_cursor: str | None


class DeletedOut(BaseModel):
    """What a (cascading) soft delete or its restore touched."""

    deleted_at: str
    areas: int
    lists: int
    sections: int
    todos: int
