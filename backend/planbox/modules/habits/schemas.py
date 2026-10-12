"""HTTP shapes for the habits module."""

from datetime import date

from pydantic import BaseModel, Field


class HabitOut(BaseModel):
    """A habit."""

    id: str
    name: str
    notes: str
    rrule: str = Field(description="RRULE without DTSTART, anchored on start_date.")
    start_date: str = Field(description="First day of the schedule (YYYY-MM-DD).")
    position: str
    created_at: str
    updated_at: str


class HabitOverviewOut(HabitOut):
    """A habit with its days in the requested range and its streaks."""

    checkins: list[str] = Field(description="Checked days in the range, ascending.")
    scheduled: list[str] = Field(
        description="Days the schedule asks for in the range, without the days off."
    )
    days_off: list[str] = Field(description="Days off in the range, ascending.")
    days_off_ahead: list[str] = Field(
        description="Every day off from today on, ascending, whatever the range."
    )
    current_streak: int = Field(
        description="Scheduled days kept in a row up to today (an open today does not break it)."
    )
    best_streak: int
    total_checkins: int


class HabitCreate(BaseModel):
    """Create a habit; send a client-generated ``id`` for idempotent, optimistic creates."""

    id: str | None = None
    name: str
    notes: str = ""
    rrule: str | None = Field(default=None, description="Defaults to FREQ=DAILY.")
    start_date: date | None = Field(default=None, description="Defaults to today.")


class HabitPatch(BaseModel):
    """Change the fields present in the body."""

    name: str | None = None
    notes: str | None = None
    rrule: str | None = None
    start_date: date | None = None


class HabitDeletedOut(BaseModel):
    """Result of a soft delete; restore by id to undo."""

    id: str
    deleted_at: str


class HabitDay(BaseModel):
    """One day of one habit."""

    habit_id: str
    day: date


class DaysOffChange(BaseModel):
    """Take days off (or back) for one or more habits."""

    items: list[HabitDay] = Field(description="The (habit, day) pairs to change.")
    off: bool = Field(description="True takes the days off, false puts them back.")


class DaysOffChanged(BaseModel):
    """The pairs that changed; sending them with ``off`` flipped undoes the change."""

    items: list[HabitDay]


class CheckinOut(BaseModel):
    """Whether a habit is checked on a day."""

    habit_id: str
    day: str
    checked: bool
