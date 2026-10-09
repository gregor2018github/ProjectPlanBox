"""HTTP shapes for the calendar module.

Timed events carry ``start_at``/``end_at`` (UTC instants); all-day events
carry ``start_date``/``end_date`` (floating dates, end inclusive). Creates
accept a client-generated ``id`` so optimistic rows are the real rows.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class EventOut(BaseModel):
    """An event; with ``rrule`` it is a recurring series anchored at its start."""

    id: str
    title: str
    notes: str
    location: str
    all_day: bool
    start_at: str | None
    end_at: str | None
    start_date: date | None
    end_date: date | None
    rrule: str | None
    created_at: str
    updated_at: str


class OccurrenceOut(BaseModel):
    """One appearance of an event; ``occurrence_date`` is its local start date (the key)."""

    event_id: str
    occurrence_date: date
    start_at: str | None
    end_at: str | None
    start_date: date | None
    end_date: date | None


class CalendarRangeOut(BaseModel):
    """The events that appear in a range and their occurrences there, in start order."""

    events: list[EventOut]
    occurrences: list[OccurrenceOut]


class EventsOut(BaseModel):
    """Every event a request touched (a series and the event split off it)."""

    events: list[EventOut]


class EventCreate(BaseModel):
    """Create an event. Give ``start_at``/``end_at`` or, with ``all_day``, the dates."""

    id: str | None = None
    title: str
    notes: str = ""
    location: str = ""
    all_day: bool = False
    start_at: datetime | None = None
    end_at: datetime | None = None
    start_date: date | None = None
    end_date: date | None = None
    rrule: str | None = None


class EventPatch(BaseModel):
    """Change an event. Absent fields stay; ``rrule: null`` stops repeating.

    For a recurring event, ``scope`` picks what changes: ``all`` (the series),
    ``this`` or ``following`` (both need ``occurrence_date``; timing fields
    then describe that occurrence). ``split_id`` names the event split off.
    """

    title: str | None = None
    notes: str | None = None
    location: str | None = None
    all_day: bool | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    start_date: date | None = None
    end_date: date | None = None
    rrule: str | None = None
    scope: Literal["all", "this", "following"] = "all"
    occurrence_date: date | None = None
    split_id: str | None = None
