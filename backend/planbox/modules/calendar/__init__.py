"""Calendar module: timed and all-day events, recurring series and their occurrences."""

import sqlite3
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path

from planbox.core.clock import FixedClock
from planbox.core.entities import (
    ActivityEvent,
    ActivityWindow,
    EntitySummary,
    EntityType,
    lifecycle_events,
)
from planbox.core.module import Module
from planbox.modules.calendar.repository import event_activity_rows, summarize_events
from planbox.modules.calendar.router import router
from planbox.modules.calendar.service import ENTITY_TYPE, EventService, Repositories


def _summarize(conn: sqlite3.Connection, ids: Sequence[str]) -> dict[str, EntitySummary]:
    return {
        event_id: EntitySummary(title=title, deleted=deleted)
        for event_id, (title, deleted) in summarize_events(conn, ids).items()
    }


def _activity(conn: sqlite3.Connection, window: ActivityWindow) -> list[ActivityEvent]:
    """Events created and deleted, and occurrences done (ticked, or ended unticked)."""
    events = lifecycle_events(event_activity_rows(conn, window.since))
    clock = FixedClock(datetime.fromisoformat(window.now))
    service = EventService(conn, Repositories.on(conn), clock, window.zone)
    events.extend(
        ActivityEvent("completed", at) for at in service.completions(window.since, window.now)
    )
    return events


module = Module(
    id="calendar",
    router=router,
    migrations_dir=Path(__file__).parent / "migrations",
    entity_types=(EntityType(ENTITY_TYPE, _summarize, activity=_activity),),
)
