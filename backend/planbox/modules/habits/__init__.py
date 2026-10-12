"""Habits module: habits on a schedule, daily check-ins and streaks."""

import sqlite3
from collections.abc import Sequence
from pathlib import Path

from planbox.core.entities import (
    ActivityEvent,
    ActivityWindow,
    EntitySummary,
    EntityType,
    SearchDocument,
    lifecycle_events,
)
from planbox.core.module import Module
from planbox.modules.habits.repository import (
    checkin_instants,
    habit_activity_rows,
    habit_search_rows,
    summarize_habits,
)
from planbox.modules.habits.router import router
from planbox.modules.habits.service import ENTITY_TYPE


def _summarize(conn: sqlite3.Connection, ids: Sequence[str]) -> dict[str, EntitySummary]:
    return {
        habit_id: EntitySummary(title=name, deleted=deleted, hint=hint)
        for habit_id, (name, deleted, hint) in summarize_habits(conn, ids).items()
    }


def _documents(conn: sqlite3.Connection, since: str | None) -> list[SearchDocument]:
    return [SearchDocument(*row) for row in habit_search_rows(conn, since)]


def _activity(conn: sqlite3.Connection, window: ActivityWindow) -> list[ActivityEvent]:
    """Habits created and deleted, and every check-in as a completion."""
    events = lifecycle_events(habit_activity_rows(conn, window.since))
    events.extend(ActivityEvent("completed", at) for at in checkin_instants(conn, window.since))
    return events


module = Module(
    id="habits",
    router=router,
    migrations_dir=Path(__file__).parent / "migrations",
    entity_types=(EntityType(ENTITY_TYPE, _summarize, _documents, _activity),),
)
