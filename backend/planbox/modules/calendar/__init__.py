"""Calendar module: timed and all-day events, recurring series and their occurrences."""

import sqlite3
from collections.abc import Sequence
from pathlib import Path

from planbox.core.entities import EntitySummary, EntityType
from planbox.core.module import Module
from planbox.modules.calendar.repository import summarize_events
from planbox.modules.calendar.router import router
from planbox.modules.calendar.service import ENTITY_TYPE


def _summarize(conn: sqlite3.Connection, ids: Sequence[str]) -> dict[str, EntitySummary]:
    return {
        event_id: EntitySummary(title=title, deleted=deleted)
        for event_id, (title, deleted) in summarize_events(conn, ids).items()
    }


module = Module(
    id="calendar",
    router=router,
    migrations_dir=Path(__file__).parent / "migrations",
    entity_types=(EntityType(ENTITY_TYPE, _summarize),),
)
