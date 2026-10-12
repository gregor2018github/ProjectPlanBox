"""Todos module: areas, lists, sections, todos and subtasks."""

import sqlite3
from collections.abc import Sequence
from pathlib import Path

from planbox.core.entities import (
    ActivityEvent,
    ActivityWindow,
    EntitySummary,
    EntityType,
    SearchDocument,
)
from planbox.core.module import Module
from planbox.modules.todos.repository import (
    summarize_todos,
    todo_activity_rows,
    todo_search_rows,
)
from planbox.modules.todos.router import router
from planbox.modules.todos.service import ENTITY_TYPE


def _summarize(conn: sqlite3.Connection, ids: Sequence[str]) -> dict[str, EntitySummary]:
    return {
        todo_id: EntitySummary(title=title, deleted=deleted, hint=hint)
        for todo_id, (title, deleted, hint) in summarize_todos(conn, ids).items()
    }


def _documents(conn: sqlite3.Connection, since: str | None) -> list[SearchDocument]:
    return [SearchDocument(*row) for row in todo_search_rows(conn, since)]


def _activity(conn: sqlite3.Connection, window: ActivityWindow) -> list[ActivityEvent]:
    """Todos added, completed and deleted.

    The next occurrence a repeating todo creates itself is not counted as
    added: nobody added it.
    """
    events: list[ActivityEvent] = []
    for created_at, completed_at, deleted_at, spawned in todo_activity_rows(conn, window.since):
        if not spawned:
            events.append(ActivityEvent("created", created_at))
        if completed_at is not None:
            events.append(ActivityEvent("completed", completed_at))
        if deleted_at is not None:
            events.append(ActivityEvent("deleted", deleted_at))
    return events


module = Module(
    id="todos",
    router=router,
    migrations_dir=Path(__file__).parent / "migrations",
    entity_types=(EntityType(ENTITY_TYPE, _summarize, _documents, _activity),),
)
