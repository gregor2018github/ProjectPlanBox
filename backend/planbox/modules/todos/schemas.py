"""HTTP shapes for the todos module.

Creates accept a client-generated ``id`` (UUIDv7) so optimistic rows are the
real rows and retries are idempotent. Moves name the neighbours
(``after_id`` / ``before_id``); see ``service.place`` for the exact rule.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class AreaOut(BaseModel):
    """An area."""

    id: str
    name: str
    hue: int
    position: str
    created_at: str
    updated_at: str


class AreaCreate(BaseModel):
    """Create an area at the end; without a ``hue`` it gets the next default one."""

    id: str | None = None
    name: str
    hue: int | None = Field(default=None, ge=0, le=359)


class AreaUpdate(BaseModel):
    """Rename an area and/or change its hue (omitted fields stay)."""

    name: str | None = None
    hue: int | None = Field(default=None, ge=0, le=359)


class Rename(BaseModel):
    """Rename an area, list or section."""

    name: str


class AreaMove(BaseModel):
    """Reorder an area."""

    before_id: str | None = None
    after_id: str | None = None


class ListOut(BaseModel):
    """A list; ``area_id`` is null for lists outside any area."""

    id: str
    area_id: str | None
    name: str
    position: str
    created_at: str
    updated_at: str


class ListCreate(BaseModel):
    """Create a list at the end of its area."""

    id: str | None = None
    name: str
    area_id: str | None = None


class ListMove(BaseModel):
    """Reorder a list and/or move it to another area (``area_id`` is required, may be null)."""

    area_id: str | None
    before_id: str | None = None
    after_id: str | None = None


class SectionOut(BaseModel):
    """A section (heading) inside a list."""

    id: str
    list_id: str
    name: str
    position: str
    created_at: str
    updated_at: str


class SectionCreate(BaseModel):
    """Create a section in a list (at the end unless neighbours are given)."""

    id: str | None = None
    list_id: str
    name: str
    before_id: str | None = None
    after_id: str | None = None


class SectionMove(BaseModel):
    """Reorder a section; another ``list_id`` takes its todos along."""

    list_id: str
    before_id: str | None = None
    after_id: str | None = None


class TodoOut(BaseModel):
    """A todo; ``parent_id`` set means it is a subtask; ``list_id`` null means Inbox.

    A repeating todo has an ``rrule`` (RFC 5545, without ``DTSTART``) whose
    series starts on ``recurrence_anchor``. ``repeat_from`` says whether the
    next date follows that schedule (``due``) or is counted from the day it
    was done (``completion``). ``today_position`` is its place in
    Today's manual order (null until Today is reordered, and after the due
    date changes). ``rank_position`` is its place in "My order" in All todos
    (null while it is unsorted).
    """

    id: str
    list_id: str | None
    section_id: str | None
    parent_id: str | None
    title: str
    notes: str
    priority: int = Field(ge=0, le=3)
    due_date: date | None
    position: str
    completed_at: str | None
    created_at: str
    updated_at: str
    tag_ids: list[str]
    rrule: str | None
    recurrence_anchor: date | None
    repeat_from: Literal["due", "completion"]
    today_position: str | None
    rank_position: str | None


class TodoCreate(BaseModel):
    """Create a todo or subtask (at the end of its container unless neighbours are given)."""

    id: str | None = None
    title: str
    notes: str = ""
    priority: int = Field(default=0, ge=0, le=3)
    due_date: date | None = None
    list_id: str | None = None
    section_id: str | None = None
    parent_id: str | None = None
    tag_ids: list[str] = Field(default_factory=list[str])
    before_id: str | None = None
    after_id: str | None = None
    rrule: str | None = Field(default=None, max_length=500)
    repeat_from: Literal["due", "completion"] = "due"


class TodoPatch(BaseModel):
    """Change fields of a todo. Absent fields stay; ``due_date: null`` clears the date.

    ``rrule`` starts (or changes) a repeat anchored on the due date (its
    first date from today if none); ``rrule: null`` stops it, and so does
    clearing the due date. ``repeat_from: completion`` needs a plain
    "every N days/weeks/months/years" rule.
    """

    title: str | None = None
    notes: str | None = None
    priority: int | None = Field(default=None, ge=0, le=3)
    due_date: date | None = None
    rrule: str | None = Field(default=None, max_length=500)
    repeat_from: Literal["due", "completion"] | None = None
    tag_ids: list[str] | None = None


class TodoMove(BaseModel):
    """Place a todo: the three container fields are required (each may be null)."""

    list_id: str | None
    section_id: str | None
    parent_id: str | None
    before_id: str | None = None
    after_id: str | None = None


class TodayOrder(BaseModel):
    """The todos of one group in Today, top to bottom."""

    ids: list[str] = Field(max_length=2000)


class RankOrder(BaseModel):
    """The "My order" ranking in All todos: ranked todos top to bottom, and todos to unrank."""

    ids: list[str] = Field(max_length=5000)
    unranked: list[str] = Field(default_factory=list[str], max_length=5000)


class ForecastOut(BaseModel):
    """A later date of an open repeating todo, for showing it ahead on the calendar."""

    todo_id: str
    date: date


class TodosOut(BaseModel):
    """Every todo a request changed (e.g. a parent and its subtasks)."""

    todos: list[TodoOut]


class LogbookOut(BaseModel):
    """A page of completed todos, newest first; pass ``next_cursor`` for the next page."""

    todos: list[TodoOut]
    next_cursor: str | None


class DeletedOut(BaseModel):
    """What a (cascading) soft delete or its restore touched."""

    deleted_at: str
    areas: int
    lists: int
    sections: int
    todos: int


# ---------------------------------------------------------------- statistics


class StatsTotalsOut(BaseModel):
    """Where things stand right now (live todos, subtasks included)."""

    open: int
    overdue: int
    due_today: int
    due_next_7: int = Field(description="Due after today, within the next 7 days.")
    no_due_date: int
    inbox: int
    repeating: int
    subtasks_open: int
    completed: int = Field(description="Completed todos that still exist, subtasks included.")
    subtasks_completed: int = Field(description="The completed subtasks among them.")
    added: int = Field(description="Every todo ever added (deleted ones too).")
    deleted: int


class StatsRecentOut(BaseModel):
    """Rolling windows of whole local days ending today."""

    added_7: int
    completed_7: int
    added_prev_7: int
    completed_prev_7: int
    added_30: int
    completed_30: int
    subtasks_completed_7: int = Field(description="Subtasks among the completed_7.")


class StatsWeekOut(BaseModel):
    """One Monday-based week."""

    start: date
    added: int
    completed: int
    deleted: int


class StatsBucketOut(BaseModel):
    """A labelled count."""

    label: str
    count: int


class StatsPriorityLeadOut(BaseModel):
    """Median lead time for one priority (0 none, 1 low, 2 medium, 3 high)."""

    priority: int
    count: int
    median_days: float | None


class StatsLeadTimeOut(BaseModel):
    """Days from added to completed, for one-off todos."""

    count: int
    mean_days: float | None
    median_days: float | None
    p90_days: float | None
    buckets: list[StatsBucketOut]
    by_priority: list[StatsPriorityLeadOut]


class StatsOpenAgeOut(BaseModel):
    """How long open todos have been waiting."""

    median_days: float | None
    buckets: list[StatsBucketOut]


class StatsOldTodoOut(BaseModel):
    """One of the longest-waiting open todos."""

    id: str
    title: str
    created_at: str
    age_days: int
    place: str = Field(description="List name or 'Inbox'.")


class StatsPriorityOut(BaseModel):
    """Todos with one priority."""

    priority: int
    open: int
    completed: int
    overdue: int


class StatsListOut(BaseModel):
    """One list as a bucket of work; ``id`` null is the Inbox."""

    id: str | None
    name: str
    area_name: str | None
    open: int
    overdue: int
    completed: int
    completed_30: int


class StatsAreaOut(BaseModel):
    """One area; ``id`` null groups lists outside any area and the Inbox."""

    id: str | None
    name: str
    open: int
    completed: int


class StatsTagOut(BaseModel):
    """Todos carrying one tag."""

    tag_id: str
    open: int
    completed: int


class StatsDueOut(BaseModel):
    """How completed todos with a due date met it."""

    with_due_date: int
    on_time: int
    late: int
    mean_days_late: float | None


class StatsBestDayOut(BaseModel):
    """The day with the most completions."""

    date: date
    count: int


class StatsStreaksOut(BaseModel):
    """Days in a row with at least one completion."""

    current: int
    longest: int
    active_days: int
    best_day: StatsBestDayOut | None


class TodoStatsOut(BaseModel):
    """Statistics over every todo, for the Insights page."""

    today: date
    totals: StatsTotalsOut
    recent: StatsRecentOut
    weeks: list[StatsWeekOut] = Field(description="The last 26 weeks, oldest first.")
    lead_time: StatsLeadTimeOut
    open_age: StatsOpenAgeOut
    oldest_open: list[StatsOldTodoOut]
    priorities: list[StatsPriorityOut]
    lists: list[StatsListOut] = Field(description="Most open first.")
    areas: list[StatsAreaOut]
    tags: list[StatsTagOut]
    punchcard: list[list[int]] = Field(
        description="Completions per local weekday (Monday first) and hour: 7 rows of 24."
    )
    due: StatsDueOut
    streaks: StatsStreaksOut
