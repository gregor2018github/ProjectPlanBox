"""Rows of the habits module."""

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class Habit:
    """Something to do on a schedule; ``rrule`` is anchored on ``start_date``."""

    id: str
    name: str
    notes: str
    rrule: str
    start_date: str
    position: str
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class Checkin:
    """A habit done on one (floating) day."""

    id: str
    habit_id: str
    day: str
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class DayOff:
    """A day on which a habit is not due, whatever its schedule says."""

    id: str
    habit_id: str
    day: str
    created_at: str
    updated_at: str
    deleted_at: str | None


@dataclass(frozen=True, slots=True)
class HabitView:
    """A habit with its days in a requested range and its streaks.

    Attributes:
        checkins: Checked days in the range, ascending.
        scheduled: Days the schedule asks for in the range, ascending,
            without the days off.
        days_off: Days off in the range, ascending.
        days_off_ahead: Every day off from today on, ascending (whatever
            the range), so upcoming holidays can be listed.
        current_streak: Scheduled days kept in a row, up to today (today
            counts once checked, and does not break the streak before then).
        best_streak: The longest such run ever.
        total_checkins: Every check-in, scheduled day or not.
    """

    habit: Habit
    checkins: list[str] = field(default_factory=list[str])
    scheduled: list[str] = field(default_factory=list[str])
    days_off: list[str] = field(default_factory=list[str])
    days_off_ahead: list[str] = field(default_factory=list[str])
    current_streak: int = 0
    best_streak: int = 0
    total_checkins: int = 0
