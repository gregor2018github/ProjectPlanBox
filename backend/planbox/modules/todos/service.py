"""Todos use cases: areas, lists, sections, todos and subtasks.

Rules (ARCHITECTURE §7) live here: placement invariants, one-level subtasks,
completion cascading to subtasks, and deletes cascading down the hierarchy
with one shared ``deleted_at`` so a single restore undoes them exactly.

Repeating todos: completing one inserts its next occurrence as a new todo
(with fresh copies of its subtasks); reopening it takes that one away again.
"""

import dataclasses
import re
import sqlite3
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from planbox.core import recurrence
from planbox.core.clock import Clock, utc_now_iso
from planbox.core.db import transaction
from planbox.core.entities import EntityRef
from planbox.core.errors import Conflict, NotFound, ValidationFailed
from planbox.core.ids import is_valid_id, new_id
from planbox.core.placement import free_position, place
from planbox.core.recurrence import RecurrenceError
from planbox.core.tags.service import TagService
from planbox.modules.todos.models import (
    Area,
    Deletion,
    Placement,
    Section,
    Todo,
    TodoList,
    TodoRecord,
)
from planbox.modules.todos.repository import (
    AreaRepository,
    ListRepository,
    SectionRepository,
    TodoRepository,
)

ENTITY_TYPE = "todos.todo"
MAX_NAME = 200
MAX_TITLE = 500
MAX_NOTES = 20_000
_WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True, slots=True)
class Repositories:
    """The module's repositories on one connection."""

    areas: AreaRepository
    lists: ListRepository
    sections: SectionRepository
    todos: TodoRepository

    @classmethod
    def on(cls, conn: sqlite3.Connection) -> "Repositories":
        """Builds all repositories on ``conn``."""
        return cls(
            AreaRepository(conn),
            ListRepository(conn),
            SectionRepository(conn),
            TodoRepository(conn),
        )


# ------------------------------------------------------------------ helpers


def clean_name(name: str, what: str) -> str:
    """Trims a name and checks its length."""
    cleaned = _WHITESPACE.sub(" ", name).strip()
    if not cleaned:
        raise ValidationFailed(f"A {what} needs a name.")
    if len(cleaned) > MAX_NAME:
        raise ValidationFailed(f"{what.capitalize()} names are at most {MAX_NAME} characters.")
    return cleaned


def clean_title(title: str) -> str:
    """Trims a todo title to one line and checks its length."""
    cleaned = _WHITESPACE.sub(" ", title).strip()
    if not cleaned:
        raise ValidationFailed("A todo needs a title.")
    if len(cleaned) > MAX_TITLE:
        raise ValidationFailed(f"Titles are at most {MAX_TITLE} characters.")
    return cleaned


def clean_notes(notes: str) -> str:
    """Checks the notes length (notes keep their line breaks)."""
    if len(notes) > MAX_NOTES:
        raise ValidationFailed(f"Notes are at most {MAX_NOTES} characters.")
    return notes


def clean_priority(priority: int) -> int:
    """Checks 0 (none) .. 3 (high)."""
    if not 0 <= priority <= 3:  # noqa: PLR2004 - the documented range
        raise ValidationFailed("Priority is 0 (none) to 3 (high).")
    return priority


def check_client_id(entity_id: str | None) -> None:
    """Rejects client ids that are not UUIDv7."""
    if entity_id is not None and not is_valid_id(entity_id):
        raise ValidationFailed("Ids must be lowercase UUIDv7.")


def _live[T: (Area, TodoList, Section, Todo)](row: T | None, what: str) -> T:
    if row is None or row.deleted_at is not None:
        raise NotFound(f"No {what} with this id.")
    return row


def _deleted[T: (Area, TodoList, Section, Todo)](row: T | None, what: str) -> tuple[T, str]:
    """Returns a deleted row and its deletion stamp."""
    if row is None or row.deleted_at is None:
        raise NotFound(f"No deleted {what} with this id.")
    return row, row.deleted_at


# -------------------------------------------------------------------- areas


class AreaService:
    """Areas group lists."""

    def __init__(self, conn: sqlite3.Connection, repos: Repositories, clock: Clock) -> None:
        self._conn = conn
        self._repos = repos
        self._clock = clock

    def list_live(self) -> list[Area]:
        """Live areas in order."""
        return self._repos.areas.list_live()

    def create(self, name: str, area_id: str | None) -> tuple[Area, bool]:
        """Creates an area at the end; idempotent per client id."""
        check_client_id(area_id)
        cleaned = clean_name(name, "area")
        with transaction(self._conn):
            if area_id is not None and (existing := self._repos.areas.get(area_id)) is not None:
                return existing, False
            now = utc_now_iso(self._clock)
            area = Area(
                id=area_id or new_id(),
                name=cleaned,
                position=place(self._repos.areas.positions(), None, None),
                created_at=now,
                updated_at=now,
                deleted_at=None,
            )
            self._repos.areas.insert(area)
            return area, True

    def rename(self, area_id: str, name: str) -> Area:
        """Renames an area."""
        cleaned = clean_name(name, "area")
        with transaction(self._conn):
            _live(self._repos.areas.get(area_id), "area")
            self._repos.areas.update(area_id, {"name": cleaned}, utc_now_iso(self._clock))
            return _live(self._repos.areas.get(area_id), "area")

    def move(self, area_id: str, before_id: str | None, after_id: str | None) -> Area:
        """Reorders an area."""
        with transaction(self._conn):
            _live(self._repos.areas.get(area_id), "area")
            position = place(self._repos.areas.positions(exclude_id=area_id), before_id, after_id)
            self._repos.areas.update(area_id, {"position": position}, utc_now_iso(self._clock))
            return _live(self._repos.areas.get(area_id), "area")

    def delete(self, area_id: str) -> Deletion:
        """Deletes an area with its lists, their sections and todos."""
        with transaction(self._conn):
            _live(self._repos.areas.get(area_id), "area")
            now = utc_now_iso(self._clock)
            list_ids = self._repos.lists.live_ids_in_area(area_id)
            section_ids = self._repos.sections.live_ids_in_lists(list_ids)
            todo_ids = self._repos.todos.live_ids_in("list_id", list_ids)
            todos = self._repos.todos.set_deleted(todo_ids, now, now)
            sections = self._repos.sections.set_deleted(section_ids, now, now)
            lists = self._repos.lists.set_deleted(list_ids, now, now)
            self._repos.areas.set_deleted(area_id, now, now)
            return Deletion(now, areas=1, lists=lists, sections=sections, todos=todos)

    def restore(self, area_id: str) -> Deletion:
        """Undoes a delete, bringing back exactly what was deleted with it."""
        with transaction(self._conn):
            area, stamp = _deleted(self._repos.areas.get(area_id), "area")
            now = utc_now_iso(self._clock)
            list_ids = self._repos.lists.ids_deleted_with(area_id, stamp)
            section_ids = self._repos.sections.ids_deleted_with(list_ids, stamp)
            todo_ids = self._repos.todos.ids_deleted_with("list_id", list_ids, stamp)
            position = free_position(self._repos.areas.positions(), area.position)
            self._repos.areas.set_deleted(area_id, None, now)
            self._repos.areas.update(area_id, {"position": position}, now)
            lists = self._repos.lists.set_deleted(list_ids, None, now)
            sections = self._repos.sections.set_deleted(section_ids, None, now)
            todos = self._repos.todos.set_deleted(todo_ids, None, now)
            return Deletion(stamp, areas=1, lists=lists, sections=sections, todos=todos)


# -------------------------------------------------------------------- lists


class ListService:
    """Lists hold todos, optionally inside an area."""

    def __init__(self, conn: sqlite3.Connection, repos: Repositories, clock: Clock) -> None:
        self._conn = conn
        self._repos = repos
        self._clock = clock

    def list_live(self) -> list[TodoList]:
        """Live lists."""
        return self._repos.lists.list_live()

    def create(self, name: str, area_id: str | None, list_id: str | None) -> tuple[TodoList, bool]:
        """Creates a list at the end of its area; idempotent per client id."""
        check_client_id(list_id)
        cleaned = clean_name(name, "list")
        with transaction(self._conn):
            if list_id is not None and (existing := self._repos.lists.get(list_id)) is not None:
                return existing, False
            self._check_area(area_id)
            now = utc_now_iso(self._clock)
            todo_list = TodoList(
                id=list_id or new_id(),
                area_id=area_id,
                name=cleaned,
                position=place(self._repos.lists.positions(area_id), None, None),
                created_at=now,
                updated_at=now,
                deleted_at=None,
            )
            self._repos.lists.insert(todo_list)
            return todo_list, True

    def rename(self, list_id: str, name: str) -> TodoList:
        """Renames a list."""
        cleaned = clean_name(name, "list")
        with transaction(self._conn):
            _live(self._repos.lists.get(list_id), "list")
            self._repos.lists.update(list_id, {"name": cleaned}, utc_now_iso(self._clock))
            return _live(self._repos.lists.get(list_id), "list")

    def move(
        self, list_id: str, area_id: str | None, before_id: str | None, after_id: str | None
    ) -> TodoList:
        """Reorders a list and/or moves it to another area (or out of any area)."""
        with transaction(self._conn):
            _live(self._repos.lists.get(list_id), "list")
            self._check_area(area_id)
            siblings = self._repos.lists.positions(area_id, exclude_id=list_id)
            position = place(siblings, before_id, after_id)
            self._repos.lists.update(
                list_id, {"area_id": area_id, "position": position}, utc_now_iso(self._clock)
            )
            return _live(self._repos.lists.get(list_id), "list")

    def delete(self, list_id: str) -> Deletion:
        """Deletes a list with its sections and todos."""
        with transaction(self._conn):
            _live(self._repos.lists.get(list_id), "list")
            now = utc_now_iso(self._clock)
            section_ids = self._repos.sections.live_ids_in_lists([list_id])
            todo_ids = self._repos.todos.live_ids_in("list_id", [list_id])
            todos = self._repos.todos.set_deleted(todo_ids, now, now)
            sections = self._repos.sections.set_deleted(section_ids, now, now)
            self._repos.lists.set_deleted([list_id], now, now)
            return Deletion(now, lists=1, sections=sections, todos=todos)

    def restore(self, list_id: str) -> Deletion:
        """Undoes a delete.

        Raises:
            Conflict: If the list's area is deleted (restore the area instead).
        """
        with transaction(self._conn):
            todo_list, stamp = _deleted(self._repos.lists.get(list_id), "list")
            if todo_list.area_id is not None:
                area = self._repos.areas.get(todo_list.area_id)
                if area is None or area.deleted_at is not None:
                    raise Conflict("This list's area is deleted. Restore the area first.")
            now = utc_now_iso(self._clock)
            section_ids = self._repos.sections.ids_deleted_with([list_id], stamp)
            todo_ids = self._repos.todos.ids_deleted_with("list_id", [list_id], stamp)
            position = free_position(
                self._repos.lists.positions(todo_list.area_id), todo_list.position
            )
            self._repos.lists.set_deleted([list_id], None, now)
            self._repos.lists.update(list_id, {"position": position}, now)
            sections = self._repos.sections.set_deleted(section_ids, None, now)
            todos = self._repos.todos.set_deleted(todo_ids, None, now)
            return Deletion(stamp, lists=1, sections=sections, todos=todos)

    def _check_area(self, area_id: str | None) -> None:
        if area_id is not None:
            area = self._repos.areas.get(area_id)
            if area is None or area.deleted_at is not None:
                raise ValidationFailed("Unknown area.")


# ----------------------------------------------------------------- sections


class SectionService:
    """Sections are headings inside a list."""

    def __init__(self, conn: sqlite3.Connection, repos: Repositories, clock: Clock) -> None:
        self._conn = conn
        self._repos = repos
        self._clock = clock

    def list_live(self) -> list[Section]:
        """Live sections."""
        return self._repos.sections.list_live()

    def create(
        self,
        list_id: str,
        name: str,
        section_id: str | None,
        before_id: str | None = None,
        after_id: str | None = None,
    ) -> tuple[Section, bool]:
        """Creates a section in a list; idempotent per client id."""
        check_client_id(section_id)
        cleaned = clean_name(name, "section")
        with transaction(self._conn):
            if section_id is not None and (existing := self._repos.sections.get(section_id)):
                return existing, False
            self._check_list(list_id)
            now = utc_now_iso(self._clock)
            section = Section(
                id=section_id or new_id(),
                list_id=list_id,
                name=cleaned,
                position=place(self._repos.sections.positions(list_id), before_id, after_id),
                created_at=now,
                updated_at=now,
                deleted_at=None,
            )
            self._repos.sections.insert(section)
            return section, True

    def rename(self, section_id: str, name: str) -> Section:
        """Renames a section."""
        cleaned = clean_name(name, "section")
        with transaction(self._conn):
            _live(self._repos.sections.get(section_id), "section")
            self._repos.sections.update(section_id, {"name": cleaned}, utc_now_iso(self._clock))
            return _live(self._repos.sections.get(section_id), "section")

    def move(
        self, section_id: str, list_id: str, before_id: str | None, after_id: str | None
    ) -> Section:
        """Reorders a section; moving it to another list takes its todos along."""
        with transaction(self._conn):
            section = _live(self._repos.sections.get(section_id), "section")
            self._check_list(list_id)
            siblings = self._repos.sections.positions(list_id, exclude_id=section_id)
            position = place(siblings, before_id, after_id)
            now = utc_now_iso(self._clock)
            self._repos.sections.update(section_id, {"list_id": list_id, "position": position}, now)
            if section.list_id != list_id:
                self._repos.todos.set_list_of_section(section_id, list_id, now)
            return _live(self._repos.sections.get(section_id), "section")

    def delete(self, section_id: str) -> Deletion:
        """Deletes a section with its todos."""
        with transaction(self._conn):
            _live(self._repos.sections.get(section_id), "section")
            now = utc_now_iso(self._clock)
            todo_ids = self._repos.todos.live_ids_in("section_id", [section_id])
            todos = self._repos.todos.set_deleted(todo_ids, now, now)
            self._repos.sections.set_deleted([section_id], now, now)
            return Deletion(now, sections=1, todos=todos)

    def restore(self, section_id: str) -> Deletion:
        """Undoes a delete.

        Raises:
            Conflict: If the section's list is deleted.
        """
        with transaction(self._conn):
            section, stamp = _deleted(self._repos.sections.get(section_id), "section")
            owner = self._repos.lists.get(section.list_id)
            if owner is None or owner.deleted_at is not None:
                raise Conflict("This section's list is deleted. Restore the list first.")
            now = utc_now_iso(self._clock)
            todo_ids = self._repos.todos.ids_deleted_with("section_id", [section_id], stamp)
            position = free_position(
                self._repos.sections.positions(section.list_id), section.position
            )
            self._repos.sections.set_deleted([section_id], None, now)
            self._repos.sections.update(section_id, {"position": position}, now)
            todos = self._repos.todos.set_deleted(todo_ids, None, now)
            return Deletion(stamp, sections=1, todos=todos)

    def _check_list(self, list_id: str) -> None:
        todo_list = self._repos.lists.get(list_id)
        if todo_list is None or todo_list.deleted_at is not None:
            raise ValidationFailed("Unknown list.")


# -------------------------------------------------------------------- todos


@dataclass(frozen=True, slots=True)
class NewTodo:
    """Input for creating a todo."""

    title: str
    placement: Placement
    id: str | None = None
    notes: str = ""
    priority: int = 0
    due_date: date | None = None
    tag_ids: Sequence[str] = ()
    before_id: str | None = None
    after_id: str | None = None
    rrule: str | None = None


@dataclass(frozen=True, slots=True)
class LogbookPage:
    """One page of completed todos, newest first."""

    records: list[TodoRecord]
    next_cursor: str | None


class TodoService:
    """Todos and subtasks."""

    def __init__(
        self,
        conn: sqlite3.Connection,
        repos: Repositories,
        tags: TagService,
        clock: Clock,
        zone: ZoneInfo,
    ) -> None:
        self._conn = conn
        self._repos = repos
        self._tags = tags
        self._clock = clock
        self._zone = zone

    # ---- reads

    def current(self, completed_since: str) -> list[TodoRecord]:
        """All open todos plus those completed at/after ``completed_since``."""
        return self._records(self._repos.todos.list_current(completed_since))

    def logbook(self, cursor: str | None, limit: int) -> LogbookPage:
        """Completed todos, newest first, paginated by an opaque cursor."""
        before = _parse_cursor(cursor)
        rows = self._repos.todos.list_completed(before, limit + 1)
        page, more = rows[:limit], len(rows) > limit
        next_cursor = None
        if more and page:
            last = page[-1]
            next_cursor = f"{last.completed_at}|{last.id}"
        return LogbookPage(self._records(page), next_cursor)

    # ---- writes

    def create(self, new: NewTodo) -> tuple[TodoRecord, bool]:
        """Creates a todo or subtask; idempotent per client id."""
        check_client_id(new.id)
        title = clean_title(new.title)
        notes = clean_notes(new.notes)
        priority = clean_priority(new.priority)
        with transaction(self._conn):
            if new.id is not None and (existing := self._repos.todos.get(new.id)) is not None:
                return self._record(existing), False
            self._check_placement(new.placement, moving=None)
            p = new.placement
            due_date, rule, anchor = new.due_date, None, None
            if new.rrule is not None:
                if p.parent_id is not None:
                    raise ValidationFailed("Subtasks cannot repeat; let their parent repeat.")
                anchor = due_date = due_date or self._today()
                rule = self._normalize_rule(new.rrule, anchor)
            now = utc_now_iso(self._clock)
            siblings = self._repos.todos.positions(p.list_id, p.section_id, p.parent_id)
            todo = Todo(
                id=new.id or new_id(),
                list_id=p.list_id,
                section_id=p.section_id,
                parent_id=p.parent_id,
                title=title,
                notes=notes,
                priority=priority,
                due_date=None if due_date is None else due_date.isoformat(),
                position=place(siblings, new.before_id, new.after_id),
                completed_at=None,
                created_at=now,
                updated_at=now,
                deleted_at=None,
                rrule=rule,
                recurrence_anchor=None if anchor is None else anchor.isoformat(),
            )
            self._repos.todos.insert(todo)
            if new.tag_ids:
                self._tags.set_tags(EntityRef(ENTITY_TYPE, todo.id), new.tag_ids)
            return self._record(todo), True

    def update(self, todo_id: str, changes: Mapping[str, object]) -> TodoRecord:
        """Changes title, notes, priority, due date, repeat rule and/or tags.

        Only keys present in ``changes`` are touched; ``None`` clears a due
        date or repeat rule. A new rule is anchored on the due date (today if
        there is none). Moving the due date of a repeating todo moves only
        this occurrence; clearing it stops the repeat.
        """
        fields: dict[str, object] = {}
        for key, value in changes.items():
            match key:
                case "title" if isinstance(value, str):
                    fields["title"] = clean_title(value)
                case "notes" if isinstance(value, str):
                    fields["notes"] = clean_notes(value)
                case "priority" if isinstance(value, int):
                    fields["priority"] = clean_priority(value)
                case "due_date" if value is None or isinstance(value, date):
                    fields["due_date"] = None if value is None else value.isoformat()
                case "rrule" if value is None or isinstance(value, str):
                    pass
                case "tag_ids":
                    pass
                case _:
                    raise ValidationFailed(f"Cannot change {key!r} like that.")
        with transaction(self._conn):
            todo = _live(self._repos.todos.get(todo_id), "todo")
            fields |= self._repeat_fields(todo, changes)
            if fields:
                self._repos.todos.update(todo_id, fields, utc_now_iso(self._clock))
            tag_ids = changes.get("tag_ids")
            if tag_ids is not None:
                if not isinstance(tag_ids, list):
                    raise ValidationFailed("tag_ids must be a list.")
                self._tags.set_tags(
                    EntityRef(ENTITY_TYPE, todo.id),
                    [str(t) for t in tag_ids],  # pyright: ignore[reportUnknownVariableType, reportUnknownArgumentType]
                )
            return self._record(_live(self._repos.todos.get(todo_id), "todo"))

    def complete(self, todo_id: str) -> list[TodoRecord]:
        """Completes a todo and its open subtasks with one shared timestamp.

        A repeating todo also gets its next occurrence: the first date of its
        series after both its due date and today (missed dates are skipped).
        The returned records then include the new todo and its subtasks.
        """
        with transaction(self._conn):
            todo = _live(self._repos.todos.get(todo_id), "todo")
            if todo.completed_at is not None:
                return [self._record(todo)]
            children = self._repos.todos.live_children(todo_id)
            open_children = [c.id for c in children if c.completed_at is None]
            now = utc_now_iso(self._clock)
            changed = [todo_id, *open_children]
            self._repos.todos.set_completed(changed, now, now)
            changed += self._insert_next(todo, children, now)
            return self._records(self._repos.todos.get_many(changed))

    def reopen(self, todo_id: str) -> list[TodoRecord]:
        """Reopens a todo.

        A parent brings back the subtasks completed together with it; a subtask
        also reopens its parent, so no open subtask hides under a done todo.
        """
        with transaction(self._conn):
            todo = _live(self._repos.todos.get(todo_id), "todo")
            if todo.completed_at is None:
                return [self._record(todo)]
            now = utc_now_iso(self._clock)
            changed = [todo_id]
            self._withdraw_next(todo, now)
            if todo.parent_id is None:
                changed += [
                    c.id
                    for c in self._repos.todos.live_children(todo_id)
                    if c.completed_at == todo.completed_at
                ]
            else:
                parent = self._repos.todos.get(todo.parent_id)
                if parent is not None and parent.completed_at is not None:
                    changed.append(parent.id)
                    self._withdraw_next(parent, now)
            self._repos.todos.set_completed(changed, None, now)
            return self._records(self._repos.todos.get_many(changed))

    def move(
        self,
        todo_id: str,
        placement: Placement,
        before_id: str | None,
        after_id: str | None,
    ) -> list[TodoRecord]:
        """Reorders, re-homes, indents or outdents a todo; subtasks follow their parent."""
        with transaction(self._conn):
            todo = _live(self._repos.todos.get(todo_id), "todo")
            if todo.rrule is not None and placement.parent_id is not None:
                raise ValidationFailed("A repeating todo cannot become a subtask.")
            self._check_placement(placement, moving=todo)
            p = placement
            siblings = self._repos.todos.positions(
                p.list_id, p.section_id, p.parent_id, exclude_id=todo_id
            )
            position = place(siblings, before_id, after_id)
            now = utc_now_iso(self._clock)
            self._repos.todos.update(
                todo_id,
                {
                    "list_id": p.list_id,
                    "section_id": p.section_id,
                    "parent_id": p.parent_id,
                    "position": position,
                },
                now,
            )
            children = self._repos.todos.live_children(todo_id)
            if children:
                self._repos.todos.set_placement_of_children(todo_id, p.list_id, p.section_id, now)
            return self._records(self._repos.todos.get_many([todo_id, *(c.id for c in children)]))

    def delete(self, todo_id: str) -> Deletion:
        """Deletes a todo with its subtasks."""
        with transaction(self._conn):
            _live(self._repos.todos.get(todo_id), "todo")
            now = utc_now_iso(self._clock)
            children = self._repos.todos.live_ids_in("parent_id", [todo_id])
            count = self._repos.todos.set_deleted([todo_id, *children], now, now)
            return Deletion(now, todos=count)

    def restore(self, todo_id: str) -> list[TodoRecord]:
        """Undoes a delete (with the subtasks deleted together with it).

        Raises:
            Conflict: If its list, section or parent is deleted.
        """
        with transaction(self._conn):
            todo, stamp = _deleted(self._repos.todos.get(todo_id), "todo")
            self._check_restorable(todo)
            children = self._repos.todos.ids_deleted_with("parent_id", [todo_id], stamp)
            siblings = self._repos.todos.positions(todo.list_id, todo.section_id, todo.parent_id)
            now = utc_now_iso(self._clock)
            self._repos.todos.set_deleted([todo_id, *children], None, now)
            self._repos.todos.update(
                todo_id, {"position": free_position(siblings, todo.position)}, now
            )
            return self._records(self._repos.todos.get_many([todo_id, *children]))

    # ---- internals

    def _check_placement(self, p: Placement, moving: Todo | None) -> None:
        repos = self._repos
        if p.list_id is not None:
            todo_list = repos.lists.get(p.list_id)
            if todo_list is None or todo_list.deleted_at is not None:
                raise ValidationFailed("Unknown list.")
        if p.section_id is not None:
            if p.list_id is None:
                raise ValidationFailed("The Inbox has no sections.")
            section = repos.sections.get(p.section_id)
            if section is None or section.deleted_at is not None or section.list_id != p.list_id:
                raise ValidationFailed("That section is not in this list.")
        if p.parent_id is None:
            return
        parent = repos.todos.get(p.parent_id)
        if parent is None or parent.deleted_at is not None:
            raise ValidationFailed("Unknown parent todo.")
        if moving is not None and parent.id == moving.id:
            raise ValidationFailed("A todo cannot be its own subtask.")
        if parent.parent_id is not None:
            raise ValidationFailed("Subtasks cannot have subtasks.")
        if parent.completed_at is not None:
            raise ValidationFailed("Reopen the parent todo first.")
        if (parent.list_id, parent.section_id) != (p.list_id, p.section_id):
            raise ValidationFailed("A subtask must be in its parent's list and section.")
        if moving is not None and repos.todos.live_children(moving.id):
            raise ValidationFailed("A todo with subtasks cannot become a subtask.")

    def _check_restorable(self, todo: Todo) -> None:
        repos = self._repos
        if todo.list_id is not None:
            todo_list = repos.lists.get(todo.list_id)
            if todo_list is None or todo_list.deleted_at is not None:
                raise Conflict("This todo's list is deleted. Restore the list first.")
        if todo.section_id is not None:
            section = repos.sections.get(todo.section_id)
            if section is None or section.deleted_at is not None:
                raise Conflict("This todo's section is deleted. Restore the section first.")
        if todo.parent_id is not None:
            parent = repos.todos.get(todo.parent_id)
            if parent is None or parent.deleted_at is not None:
                raise Conflict("This subtask's parent is deleted. Restore the parent first.")

    def _today(self) -> date:
        return self._clock.now().astimezone(self._zone).date()

    def _normalize_rule(self, rule: str, anchor: date) -> str:
        try:
            return recurrence.normalize(rule, recurrence.all_day_anchor(anchor, anchor), self._zone)
        except RecurrenceError as exc:
            raise ValidationFailed(str(exc)) from exc

    def _repeat_fields(self, todo: Todo, changes: Mapping[str, object]) -> dict[str, object]:
        """The rrule/anchor columns an update implies.

        A new rule is anchored on the (new) due date, or today, which then
        becomes the due date. Clearing the due date stops the repeat.
        """
        if "due_date" in changes and changes["due_date"] is None:
            return {"rrule": None, "recurrence_anchor": None}
        if "rrule" not in changes:
            return {}
        rule = changes["rrule"]
        if rule is None:
            return {"rrule": None, "recurrence_anchor": None}
        if todo.parent_id is not None:
            raise ValidationFailed("Subtasks cannot repeat; let their parent repeat.")
        due = changes.get("due_date")
        if isinstance(due, date):
            anchor = due
        elif todo.due_date is not None:
            anchor = date.fromisoformat(todo.due_date)
        else:
            anchor = self._today()
        return {
            "rrule": self._normalize_rule(str(rule), anchor),
            "recurrence_anchor": anchor.isoformat(),
            "due_date": anchor.isoformat(),
        }

    def _insert_next(self, todo: Todo, children: Sequence[Todo], now: str) -> list[str]:
        """Inserts the next occurrence of a repeating todo; returns the new ids."""
        if todo.rrule is None or todo.due_date is None or todo.recurrence_anchor is None:
            return []
        due = date.fromisoformat(todo.due_date)
        next_due = recurrence.date_after(
            todo.rrule, date.fromisoformat(todo.recurrence_anchor), max(due, self._today())
        )
        if next_due is None:
            return []
        siblings = self._repos.todos.positions(todo.list_id, todo.section_id, None)
        successor = dataclasses.replace(
            todo,
            id=new_id(),
            due_date=next_due.isoformat(),
            position=place(siblings, None, todo.id),
            completed_at=None,
            created_at=now,
            updated_at=now,
            recurs_from_id=todo.id,
        )
        self._repos.todos.insert(successor)
        self._copy_tags(todo.id, successor.id)
        shift = next_due - due
        ids = [successor.id]
        for child in children:
            copy = dataclasses.replace(
                child,
                id=new_id(),
                parent_id=successor.id,
                due_date=_shifted(child.due_date, shift),
                completed_at=None,
                created_at=now,
                updated_at=now,
            )
            self._repos.todos.insert(copy)
            self._copy_tags(child.id, copy.id)
            ids.append(copy.id)
        return ids

    def _withdraw_next(self, todo: Todo, now: str) -> None:
        """Undoes :meth:`_insert_next` when a repeating todo is reopened.

        An open next occurrence is deleted with its subtasks. If it is already
        done, the series has moved on and this todo stops repeating.
        """
        for successor in self._repos.todos.live_successors(todo.id):
            if successor.completed_at is None:
                children = self._repos.todos.live_ids_in("parent_id", [successor.id])
                self._repos.todos.set_deleted([successor.id, *children], now, now)
            elif todo.rrule is not None:
                self._repos.todos.update(todo.id, {"rrule": None, "recurrence_anchor": None}, now)

    def _copy_tags(self, from_id: str, to_id: str) -> None:
        tag_ids = self._tags.tags_for(ENTITY_TYPE, [from_id]).get(from_id, [])
        if tag_ids:
            self._tags.set_tags(EntityRef(ENTITY_TYPE, to_id), tag_ids)

    def _record(self, todo: Todo) -> TodoRecord:
        return self._records([todo])[0]

    def _records(self, todos: Sequence[Todo]) -> list[TodoRecord]:
        tags = self._tags.tags_for(ENTITY_TYPE, [t.id for t in todos])
        return [TodoRecord(t, tags.get(t.id, [])) for t in todos]


def _shifted(day: str | None, shift: timedelta) -> str | None:
    return None if day is None else (date.fromisoformat(day) + shift).isoformat()


def _parse_cursor(cursor: str | None) -> tuple[str, str] | None:
    if cursor is None:
        return None
    completed_at, sep, todo_id = cursor.partition("|")
    if not sep or not completed_at or not todo_id:
        raise ValidationFailed("Invalid logbook cursor.")
    return completed_at, todo_id
