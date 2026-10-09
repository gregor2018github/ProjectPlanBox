"""Rows of the calendar module."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Event:
    """A timed or all-day event; with ``rrule`` it is a recurring series.

    Timed events use ``start_at``/``end_at`` (UTC instants); all-day events
    use ``start_date``/``end_date`` (floating dates, end inclusive).
    """

    id: str
    title: str
    notes: str
    location: str
    all_day: bool
    start_at: str | None
    end_at: str | None
    start_date: str | None
    end_date: str | None
    rrule: str | None
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class EventException:
    """A skipped occurrence of a series, keyed by its local start date."""

    id: str
    event_id: str
    occurrence_date: str
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class Occurrence:
    """One concrete appearance of an event in the calendar.

    A single event has exactly one occurrence. Times follow the event's kind:
    instants for timed events, floating dates (end inclusive) for all-day.
    """

    event_id: str
    occurrence_date: str
    start_at: str | None
    end_at: str | None
    start_date: str | None
    end_date: str | None


@dataclass(frozen=True, slots=True)
class CalendarRange:
    """The events that appear in a date range and their occurrences there."""

    events: list[Event]
    occurrences: list[Occurrence]
