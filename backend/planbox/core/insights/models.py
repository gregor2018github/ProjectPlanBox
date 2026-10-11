"""Insights rows and results."""

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True, slots=True)
class AppOpen:
    """One time the app was opened."""

    id: str
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class DayActivity:
    """What happened on one local day (only days with something are reported)."""

    date: date
    created: int
    completed: int
    deleted: int
    opens: int


@dataclass(frozen=True, slots=True)
class TypeActivity:
    """Totals of one entity type over the whole range."""

    entity_type: str
    created: int
    completed: int
    deleted: int


@dataclass(frozen=True, slots=True)
class OpenStats:
    """App opens in the range by local hour and weekday, plus all-time facts.

    Attributes:
        in_range: Opens within the range.
        all_time: Every recorded open.
        first_at: The first recorded open, if any.
        by_hour: 24 counts, local hour 0..23.
        by_weekday: 7 counts, Monday first.
    """

    in_range: int
    all_time: int
    first_at: str | None
    by_hour: list[int]
    by_weekday: list[int]


@dataclass(frozen=True, slots=True)
class Activity:
    """The activity overview for a date range."""

    start: date
    end: date
    days: list[DayActivity]
    types: list[TypeActivity]
    opens: OpenStats
