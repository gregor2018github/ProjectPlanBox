"""HTTP routes for the todos module, mounted at ``/api/todos``."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from planbox.core.clock import to_iso
from planbox.core.db.deps import ClockDep, ConnectionDep
from planbox.core.errors import ValidationFailed
from planbox.core.tags.deps import TagServiceDep
from planbox.modules.todos.models import Area, Deletion, Placement, Section, TodoList, TodoRecord
from planbox.modules.todos.schemas import (
    AreaCreate,
    AreaMove,
    AreaOut,
    DeletedOut,
    ListCreate,
    ListMove,
    ListOut,
    LogbookOut,
    Rename,
    SectionCreate,
    SectionMove,
    SectionOut,
    TodoCreate,
    TodoMove,
    TodoOut,
    TodoPatch,
    TodosOut,
)
from planbox.modules.todos.service import (
    AreaService,
    ListService,
    NewTodo,
    Repositories,
    SectionService,
    TodoService,
)

router = APIRouter()


# ------------------------------------------------------------- dependencies


def _areas(conn: ConnectionDep, clock: ClockDep) -> AreaService:
    return AreaService(conn, Repositories.on(conn), clock)


def _lists(conn: ConnectionDep, clock: ClockDep) -> ListService:
    return ListService(conn, Repositories.on(conn), clock)


def _sections(conn: ConnectionDep, clock: ClockDep) -> SectionService:
    return SectionService(conn, Repositories.on(conn), clock)


def _todos(conn: ConnectionDep, clock: ClockDep, tags: TagServiceDep) -> TodoService:
    return TodoService(conn, Repositories.on(conn), tags, clock)


Areas = Annotated[AreaService, Depends(_areas)]
Lists = Annotated[ListService, Depends(_lists)]
Sections = Annotated[SectionService, Depends(_sections)]
Todos = Annotated[TodoService, Depends(_todos)]


# ---------------------------------------------------------------- mappers


def _area(area: Area) -> AreaOut:
    return AreaOut.model_validate(area, from_attributes=True)


def _list(todo_list: TodoList) -> ListOut:
    return ListOut.model_validate(todo_list, from_attributes=True)


def _section(section: Section) -> SectionOut:
    return SectionOut.model_validate(section, from_attributes=True)


def _todo(record: TodoRecord) -> TodoOut:
    t = record.todo
    return TodoOut(
        id=t.id,
        list_id=t.list_id,
        section_id=t.section_id,
        parent_id=t.parent_id,
        title=t.title,
        notes=t.notes,
        priority=t.priority,
        due_date=None if t.due_date is None else datetime.fromisoformat(t.due_date).date(),
        position=t.position,
        completed_at=t.completed_at,
        created_at=t.created_at,
        updated_at=t.updated_at,
        tag_ids=record.tag_ids,
    )


def _todos_out(records: list[TodoRecord]) -> TodosOut:
    return TodosOut(todos=[_todo(r) for r in records])


def _deleted(deletion: Deletion) -> DeletedOut:
    return DeletedOut.model_validate(deletion, from_attributes=True)


def _created(response: Response, created: bool) -> None:
    if not created:
        response.status_code = status.HTTP_200_OK


# -------------------------------------------------------------------- areas


@router.get("/areas")
def list_areas(service: Areas) -> list[AreaOut]:
    """All live areas in order."""
    return [_area(a) for a in service.list()]


@router.post("/areas", status_code=status.HTTP_201_CREATED)
def create_area(body: AreaCreate, service: Areas, response: Response) -> AreaOut:
    """Creates an area at the end (idempotent per client id)."""
    area, created = service.create(body.name, body.id)
    _created(response, created)
    return _area(area)


@router.patch("/areas/{area_id}")
def rename_area(area_id: str, body: Rename, service: Areas) -> AreaOut:
    """Renames an area."""
    return _area(service.rename(area_id, body.name))


@router.post("/areas/{area_id}/move")
def move_area(area_id: str, body: AreaMove, service: Areas) -> AreaOut:
    """Reorders an area."""
    return _area(service.move(area_id, body.before_id, body.after_id))


@router.delete("/areas/{area_id}")
def delete_area(area_id: str, service: Areas) -> DeletedOut:
    """Deletes an area with its lists, sections and todos (undo with restore)."""
    return _deleted(service.delete(area_id))


@router.post("/areas/{area_id}/restore")
def restore_area(area_id: str, service: Areas) -> DeletedOut:
    """Undoes an area delete."""
    return _deleted(service.restore(area_id))


# -------------------------------------------------------------------- lists


@router.get("/lists")
def list_lists(service: Lists) -> list[ListOut]:
    """All live lists."""
    return [_list(item) for item in service.list()]


@router.post("/lists", status_code=status.HTTP_201_CREATED)
def create_list(body: ListCreate, service: Lists, response: Response) -> ListOut:
    """Creates a list at the end of its area (idempotent per client id)."""
    todo_list, created = service.create(body.name, body.area_id, body.id)
    _created(response, created)
    return _list(todo_list)


@router.patch("/lists/{list_id}")
def rename_list(list_id: str, body: Rename, service: Lists) -> ListOut:
    """Renames a list."""
    return _list(service.rename(list_id, body.name))


@router.post("/lists/{list_id}/move")
def move_list(list_id: str, body: ListMove, service: Lists) -> ListOut:
    """Reorders a list and/or moves it between areas."""
    return _list(service.move(list_id, body.area_id, body.before_id, body.after_id))


@router.delete("/lists/{list_id}")
def delete_list(list_id: str, service: Lists) -> DeletedOut:
    """Deletes a list with its sections and todos (undo with restore)."""
    return _deleted(service.delete(list_id))


@router.post("/lists/{list_id}/restore")
def restore_list(list_id: str, service: Lists) -> DeletedOut:
    """Undoes a list delete."""
    return _deleted(service.restore(list_id))


# ----------------------------------------------------------------- sections


@router.get("/sections")
def list_sections(service: Sections) -> list[SectionOut]:
    """All live sections."""
    return [_section(s) for s in service.list()]


@router.post("/sections", status_code=status.HTTP_201_CREATED)
def create_section(body: SectionCreate, service: Sections, response: Response) -> SectionOut:
    """Creates a section in a list (idempotent per client id)."""
    section, created = service.create(
        body.list_id, body.name, body.id, body.before_id, body.after_id
    )
    _created(response, created)
    return _section(section)


@router.patch("/sections/{section_id}")
def rename_section(section_id: str, body: Rename, service: Sections) -> SectionOut:
    """Renames a section."""
    return _section(service.rename(section_id, body.name))


@router.post("/sections/{section_id}/move")
def move_section(section_id: str, body: SectionMove, service: Sections) -> SectionOut:
    """Reorders a section or moves it (with its todos) to another list."""
    return _section(service.move(section_id, body.list_id, body.before_id, body.after_id))


@router.delete("/sections/{section_id}")
def delete_section(section_id: str, service: Sections) -> DeletedOut:
    """Deletes a section with its todos (undo with restore)."""
    return _deleted(service.delete(section_id))


@router.post("/sections/{section_id}/restore")
def restore_section(section_id: str, service: Sections) -> DeletedOut:
    """Undoes a section delete."""
    return _deleted(service.restore(section_id))


# -------------------------------------------------------------------- items


@router.get("/items")
def list_items(
    service: Todos,
    completed_since: Annotated[
        datetime, Query(description="Include todos completed at or after this UTC instant.")
    ],
) -> list[TodoOut]:
    """All open todos and subtasks, plus those completed since ``completed_since``."""
    if completed_since.tzinfo is None:
        raise ValidationFailed("completed_since needs a timezone (use UTC, e.g. ...Z).")
    return [_todo(r) for r in service.current(to_iso(completed_since))]


@router.get("/items/completed")
def list_completed_items(
    service: Todos,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> LogbookOut:
    """The logbook: completed todos, newest first."""
    page = service.logbook(cursor, limit)
    return LogbookOut(todos=[_todo(r) for r in page.records], next_cursor=page.next_cursor)


@router.post("/items", status_code=status.HTTP_201_CREATED)
def create_item(body: TodoCreate, service: Todos, response: Response) -> TodoOut:
    """Creates a todo or subtask (idempotent per client id)."""
    record, created = service.create(
        NewTodo(
            id=body.id,
            title=body.title,
            notes=body.notes,
            priority=body.priority,
            due_date=body.due_date,
            placement=Placement(body.list_id, body.section_id, body.parent_id),
            tag_ids=body.tag_ids,
            before_id=body.before_id,
            after_id=body.after_id,
        )
    )
    _created(response, created)
    return _todo(record)


@router.patch("/items/{todo_id}")
def update_item(todo_id: str, body: TodoPatch, service: Todos) -> TodoOut:
    """Changes the fields present in the body."""
    changes = {name: getattr(body, name) for name in body.model_fields_set}
    return _todo(service.update(todo_id, changes))


@router.post("/items/{todo_id}/complete")
def complete_item(todo_id: str, service: Todos) -> TodosOut:
    """Completes a todo and its open subtasks."""
    return _todos_out(service.complete(todo_id))


@router.post("/items/{todo_id}/reopen")
def reopen_item(todo_id: str, service: Todos) -> TodosOut:
    """Reopens a todo (and what was completed with it, or its parent)."""
    return _todos_out(service.reopen(todo_id))


@router.post("/items/{todo_id}/move")
def move_item(todo_id: str, body: TodoMove, service: Todos) -> TodosOut:
    """Reorders, re-homes, indents or outdents a todo."""
    placement = Placement(body.list_id, body.section_id, body.parent_id)
    return _todos_out(service.move(todo_id, placement, body.before_id, body.after_id))


@router.delete("/items/{todo_id}")
def delete_item(todo_id: str, service: Todos) -> DeletedOut:
    """Deletes a todo with its subtasks (undo with restore)."""
    return _deleted(service.delete(todo_id))


@router.post("/items/{todo_id}/restore")
def restore_item(todo_id: str, service: Todos) -> TodosOut:
    """Undoes a delete."""
    return _todos_out(service.restore(todo_id))
