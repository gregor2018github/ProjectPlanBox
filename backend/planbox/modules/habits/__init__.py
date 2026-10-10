"""Habits module: habits on a schedule, daily check-ins and streaks."""

import sqlite3
from collections.abc import Sequence
from pathlib import Path

from planbox.core.entities import EntitySummary, EntityType, SearchDocument
from planbox.core.module import Module
from planbox.modules.habits.repository import habit_search_rows, summarize_habits
from planbox.modules.habits.router import router
from planbox.modules.habits.service import ENTITY_TYPE


def _summarize(conn: sqlite3.Connection, ids: Sequence[str]) -> dict[str, EntitySummary]:
    return {
        habit_id: EntitySummary(title=name, deleted=deleted, hint=hint)
        for habit_id, (name, deleted, hint) in summarize_habits(conn, ids).items()
    }


def _documents(conn: sqlite3.Connection, since: str | None) -> list[SearchDocument]:
    return [SearchDocument(*row) for row in habit_search_rows(conn, since)]


module = Module(
    id="habits",
    router=router,
    migrations_dir=Path(__file__).parent / "migrations",
    entity_types=(EntityType(ENTITY_TYPE, _summarize, _documents),),
)
