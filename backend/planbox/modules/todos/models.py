"""Rows of the todos module."""

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True, slots=True)
class Area:
    """A group of lists (e.g. "Work")."""

    id: str
    name: str
    position: str
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class TodoList:
    """A list of todos, optionally inside an area."""

    id: str
    area_id: str | None
    name: str
    position: str
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class Section:
    """A heading inside a list."""

    id: str
    list_id: str
    name: str
    position: str
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class Todo:
    """A todo or (with ``parent_id``) a subtask.

    A repeating todo has an ``rrule`` anchored on ``recurrence_anchor``;
    ``recurs_from_id`` names the occurrence whose completion created it.
    ``repeat_from`` is ``"due"`` (the next date follows the schedule) or
    ``"completion"`` (it is counted from the day this one was done).
    ``today_position`` orders it inside Today once Today was reordered.
    """

    id: str
    list_id: str | None
    section_id: str | None
    parent_id: str | None
    title: str
    notes: str
    priority: int
    due_date: str | None
    position: str
    completed_at: str | None
    created_at: str
    updated_at: str
    deleted_at: str | None
    rrule: str | None = None
    recurrence_anchor: str | None = None
    recurs_from_id: str | None = None
    today_position: str | None = None
    repeat_from: str = "due"


@dataclass(frozen=True, slots=True)
class TodoRecord:
    """A todo with its tag ids, as services hand it to routers."""

    todo: Todo
    tag_ids: list[str]


@dataclass(frozen=True, slots=True)
class ForecastDate:
    """A later date of an open repeating todo (shown ahead on the calendar)."""

    todo_id: str
    date: date


@dataclass(frozen=True, slots=True)
class Placement:
    """Where a todo lives: list (None = Inbox), section and parent."""

    list_id: str | None
    section_id: str | None
    parent_id: str | None


@dataclass(frozen=True, slots=True)
class Deletion:
    """What a cascading soft delete touched (for the undo toast)."""

    deleted_at: str
    areas: int = 0
    lists: int = 0
    sections: int = 0
    todos: int = 0
