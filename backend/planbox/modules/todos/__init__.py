"""Todos module: areas, lists, sections, todos and subtasks."""

import sqlite3
from collections.abc import Sequence
from pathlib import Path

from planbox.core.entities import EntitySummary, EntityType
from planbox.core.module import Module
from planbox.modules.todos.repository import summarize_todos
from planbox.modules.todos.router import router
from planbox.modules.todos.service import ENTITY_TYPE


def _summarize(conn: sqlite3.Connection, ids: Sequence[str]) -> dict[str, EntitySummary]:
    return {
        todo_id: EntitySummary(title=title, deleted=deleted)
        for todo_id, (title, deleted) in summarize_todos(conn, ids).items()
    }


module = Module(
    id="todos",
    router=router,
    migrations_dir=Path(__file__).parent / "migrations",
    entity_types=(EntityType(ENTITY_TYPE, _summarize),),
)
