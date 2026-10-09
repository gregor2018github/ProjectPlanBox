"""HTTP routes for the calendar module, mounted at ``/api/calendar``."""

from datetime import date
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Response, status

from planbox.core.db.deps import ClockDep, ConnectionDep, SettingsDep
from planbox.modules.calendar.models import Event
from planbox.modules.calendar.schemas import (
    CalendarRangeOut,
    EventCreate,
    EventOut,
    EventPatch,
    EventsOut,
    OccurrenceOut,
)
from planbox.modules.calendar.service import (
    EventService,
    NewEvent,
    Repositories,
    Timing,
    instant,
)

router = APIRouter()

_PATCH_CONTROLS = frozenset({"scope", "occurrence_date", "split_id"})


def _events(conn: ConnectionDep, clock: ClockDep, settings: SettingsDep) -> EventService:
    return EventService(conn, Repositories.on(conn), clock, ZoneInfo(settings.timezone))


Events = Annotated[EventService, Depends(_events)]
ScopeParam = Annotated[Literal["all", "this", "following"], Query()]


def _event(event: Event) -> EventOut:
    return EventOut.model_validate(event, from_attributes=True)


def _events_out(events: list[Event]) -> EventsOut:
    return EventsOut(events=[_event(e) for e in events])


@router.get("/events")
def list_events(
    service: Events,
    start: Annotated[date, Query(description="First local date of the range.")],
    end: Annotated[date, Query(description="Local date after the range (exclusive).")],
) -> CalendarRangeOut:
    """Events and their occurrences in ``[start, end)``, recurring series expanded."""
    found = service.in_range(start, end)
    return CalendarRangeOut(
        events=[_event(e) for e in found.events],
        occurrences=[
            OccurrenceOut.model_validate(o, from_attributes=True) for o in found.occurrences
        ],
    )


@router.get("/events/{event_id}")
def get_event(event_id: str, service: Events) -> EventOut:
    """One live event or series."""
    return _event(service.get(event_id))


@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(body: EventCreate, service: Events, response: Response) -> EventOut:
    """Creates an event or a recurring series (idempotent per client id)."""
    timing = Timing(
        all_day=body.all_day,
        start_at=None if body.start_at is None else instant(body.start_at),
        end_at=None if body.end_at is None else instant(body.end_at),
        start_date=None if body.start_date is None else body.start_date.isoformat(),
        end_date=None if body.end_date is None else body.end_date.isoformat(),
    )
    event, created = service.create(
        NewEvent(
            id=body.id,
            title=body.title,
            notes=body.notes,
            location=body.location,
            timing=timing,
            rrule=body.rrule,
        )
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    return _event(event)


@router.patch("/events/{event_id}")
def update_event(event_id: str, body: EventPatch, service: Events) -> EventsOut:
    """Changes an event, or this / following / all occurrences of a series."""
    changes = {
        name: getattr(body, name) for name in body.model_fields_set if name not in _PATCH_CONTROLS
    }
    return _events_out(
        service.update(event_id, changes, body.scope, body.occurrence_date, body.split_id)
    )


@router.delete("/events/{event_id}")
def delete_event(
    event_id: str,
    service: Events,
    scope: ScopeParam = "all",
    occurrence_date: Annotated[date | None, Query()] = None,
) -> EventsOut:
    """Deletes an event, or this / following / all occurrences of a series."""
    return _events_out(service.delete(event_id, scope, occurrence_date))


@router.post("/events/{event_id}/restore")
def restore_event(event_id: str, service: Events) -> EventOut:
    """Undoes deleting a whole event or series."""
    return _event(service.restore(event_id))


@router.post("/events/{event_id}/occurrences/{occurrence_date}/restore")
def restore_occurrence(event_id: str, occurrence_date: date, service: Events) -> EventOut:
    """Brings back one deleted occurrence of a series."""
    return _event(service.restore_occurrence(event_id, occurrence_date))
