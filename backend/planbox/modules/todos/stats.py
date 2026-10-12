"""Statistics over every todo, for the Insights page. Pure: no SQL, no clock.

Two kinds of numbers come out of here:

- **Flows over time** (added, completed and deleted per week, the recent
  windows) count every row, deleted ones included, because the thing
  happened even if the todo is gone now.
- **Snapshots** (open counts, buckets, priorities, lead times, the punch
  card) count live rows only.

"Added" never counts the next occurrence a repeating todo created itself, and
lead times leave repeating todos out, since their wait is the schedule's.
All days are local days in the configured zone; weeks start on Monday.
"""

import math
import statistics
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from planbox.modules.todos.models import Area, Todo, TodoList

WEEKS = 26
"""How many weeks the weekly flow covers (the current week included)."""

OLDEST_COUNT = 5

AGE_BUCKETS: tuple[tuple[str, float], ...] = (
    ("Under a day", 1),
    ("1\u20132 days", 3),
    ("3\u20137 days", 8),
    ("1\u20132 weeks", 15),
    ("2\u20134 weeks", 29),
    ("1\u20133 months", 91),
    ("3+ months", math.inf),
)
"""Labels and exclusive upper bounds in days, for lead times and open ages."""

PRIORITIES = (3, 2, 1, 0)
"""High first; 0 is no priority."""


@dataclass(frozen=True, slots=True)
class Totals:
    """Where things stand right now."""

    open: int
    overdue: int
    due_today: int
    due_next_7: int
    no_due_date: int
    inbox: int
    repeating: int
    subtasks_open: int
    completed: int
    subtasks_completed: int
    added: int
    deleted: int


@dataclass(frozen=True, slots=True)
class Recent:
    """Rolling windows of whole local days ending today."""

    added_7: int
    completed_7: int
    added_prev_7: int
    completed_prev_7: int
    added_30: int
    completed_30: int
    subtasks_completed_7: int


@dataclass(frozen=True, slots=True)
class WeekFlow:
    """What happened in one Monday-based week."""

    start: date
    added: int
    completed: int
    deleted: int


@dataclass(frozen=True, slots=True)
class Bucket:
    """A labelled count, e.g. lead times between one and two weeks."""

    label: str
    count: int


@dataclass(frozen=True, slots=True)
class PriorityLead:
    """Typical lead time for one priority."""

    priority: int
    count: int
    median_days: float | None


@dataclass(frozen=True, slots=True)
class LeadTime:
    """From added to completed, for one-off todos completed and still live."""

    count: int
    mean_days: float | None
    median_days: float | None
    p90_days: float | None
    buckets: list[Bucket]
    by_priority: list[PriorityLead]


@dataclass(frozen=True, slots=True)
class OpenAge:
    """How long the open todos have been waiting."""

    median_days: float | None
    buckets: list[Bucket]


@dataclass(frozen=True, slots=True)
class OldTodo:
    """One of the longest-waiting open todos."""

    id: str
    title: str
    created_at: str
    age_days: int
    place: str


@dataclass(frozen=True, slots=True)
class PriorityCount:
    """Open, completed and overdue todos with one priority."""

    priority: int
    open: int
    completed: int
    overdue: int


@dataclass(frozen=True, slots=True)
class ListCount:
    """One list (``id`` None = the Inbox) as a bucket of work."""

    id: str | None
    name: str
    area_name: str | None
    open: int
    overdue: int
    completed: int
    completed_30: int


@dataclass(frozen=True, slots=True)
class AreaCount:
    """One area (``id`` None = lists outside any area, and the Inbox)."""

    id: str | None
    name: str
    open: int
    completed: int


@dataclass(frozen=True, slots=True)
class TagCount:
    """Open and completed todos carrying one tag."""

    tag_id: str
    open: int
    completed: int


@dataclass(frozen=True, slots=True)
class DueKeeping:
    """How completed todos with a due date met it."""

    with_due_date: int
    on_time: int
    late: int
    mean_days_late: float | None


@dataclass(frozen=True, slots=True)
class BestDay:
    """The day with the most completions."""

    date: date
    count: int


@dataclass(frozen=True, slots=True)
class Streaks:
    """Days with at least one completion."""

    current: int
    longest: int
    active_days: int
    best_day: BestDay | None


@dataclass(frozen=True, slots=True)
class TodoStats:
    """Everything the Insights page shows about todos."""

    today: date
    totals: Totals
    recent: Recent
    weeks: list[WeekFlow]
    lead_time: LeadTime
    open_age: OpenAge
    oldest_open: list[OldTodo]
    priorities: list[PriorityCount]
    lists: list[ListCount]
    areas: list[AreaCount]
    tags: list[TagCount]
    punchcard: list[list[int]]
    """Completions per local weekday (Monday first) and hour: 7 rows of 24."""
    due: DueKeeping
    streaks: Streaks


def compute_stats(
    todos: Sequence[Todo],
    *,
    lists: Sequence[TodoList],
    areas: Sequence[Area],
    tag_ids: Mapping[str, Sequence[str]],
    now: datetime,
    zone: ZoneInfo,
) -> TodoStats:
    """Computes every todo statistic.

    Args:
        todos: Every todo row, deleted ones included.
        lists: Live lists.
        areas: Live areas.
        tag_ids: Live tag ids per live todo id.
        now: The current instant (aware).
        zone: The configured zone that defines local days.

    Returns:
        The statistics.
    """
    s = _Snapshot(todos, now, zone)
    places = _Places(lists, areas)
    return TodoStats(
        today=s.today,
        totals=_totals(s),
        recent=_recent(s),
        weeks=_weeks(s),
        lead_time=_lead_time(s),
        open_age=OpenAge(
            median_days=statistics.median(s.ages) if s.ages else None, buckets=_buckets(s.ages)
        ),
        oldest_open=[
            OldTodo(t.id, t.title, t.created_at, int(s.age(t)), places.list_name(t))
            for t in sorted(s.open, key=lambda t: (t.created_at, t.id))[:OLDEST_COUNT]
        ],
        priorities=[
            PriorityCount(
                p,
                open=sum(t.priority == p for t in s.open),
                completed=sum(t.priority == p for t in s.done),
                overdue=sum(t.priority == p for t in s.open if t.id in s.overdue_ids),
            )
            for p in PRIORITIES
        ],
        lists=_lists(s, places),
        areas=_areas(s, places),
        tags=_tags(s, tag_ids),
        punchcard=_punchcard(s),
        due=_due(s),
        streaks=_streaks([s.day(str(t.completed_at)) for t in s.done], s.today),
    )


class _Snapshot:
    """The rows sorted into the groups every statistic needs, plus local-day helpers."""

    def __init__(self, todos: Sequence[Todo], now: datetime, zone: ZoneInfo) -> None:
        self.now = now
        self.zone = zone
        self.today = now.astimezone(zone).date()
        self.live = [t for t in todos if t.deleted_at is None]
        self.open = [t for t in self.live if t.completed_at is None]
        self.done = [t for t in self.live if t.completed_at is not None]
        today_iso = self.today.isoformat()
        self.overdue_ids = {
            t.id for t in self.open if t.due_date is not None and t.due_date < today_iso
        }
        self.added_days = [self.day(t.created_at) for t in todos if t.recurs_from_id is None]
        self.completed_days = [self.day(t.completed_at) for t in todos if t.completed_at]
        self.subtask_completed_days = [
            self.day(t.completed_at) for t in todos if t.completed_at and t.parent_id is not None
        ]
        self.deleted_days = [self.day(t.deleted_at) for t in todos if t.deleted_at]
        self.ages = sorted(self.age(t) for t in self.open)

    def moment(self, instant: str) -> datetime:
        """A stored instant in the configured zone."""
        return datetime.fromisoformat(instant).astimezone(self.zone)

    def day(self, instant: str) -> date:
        """The local day of a stored instant."""
        return self.moment(instant).date()

    def age(self, todo: Todo) -> float:
        """Days since the todo was added."""
        return max(0.0, _days(todo.created_at, self.now))


class _Places:
    """Looks up list and area names."""

    def __init__(self, lists: Sequence[TodoList], areas: Sequence[Area]) -> None:
        self.lists = {lst.id: lst for lst in lists}
        self.areas = {a.id: a for a in areas}

    def list_of(self, todo: Todo) -> TodoList | None:
        """The todo's live list (None for the Inbox)."""
        return None if todo.list_id is None else self.lists.get(todo.list_id)

    def list_name(self, todo: Todo) -> str:
        """The todo's list name, or "Inbox"."""
        found = self.list_of(todo)
        return "Inbox" if found is None else found.name

    def area_id(self, todo: Todo) -> str | None:
        """The area of the todo's list, if any."""
        found = self.list_of(todo)
        return None if found is None else found.area_id


def _days(start: str, end: datetime) -> float:
    """Days (fractional) from a stored instant to ``end``."""
    return (end - datetime.fromisoformat(start)).total_seconds() / 86_400


def _totals(s: _Snapshot) -> Totals:
    week_ahead = s.today + timedelta(days=7)
    return Totals(
        open=len(s.open),
        overdue=len(s.overdue_ids),
        due_today=sum(t.due_date == s.today.isoformat() for t in s.open),
        due_next_7=sum(
            t.due_date is not None and s.today < date.fromisoformat(t.due_date) <= week_ahead
            for t in s.open
        ),
        no_due_date=sum(t.due_date is None for t in s.open),
        inbox=sum(t.list_id is None for t in s.open),
        repeating=sum(t.rrule is not None for t in s.open),
        subtasks_open=sum(t.parent_id is not None for t in s.open),
        completed=len(s.done),
        subtasks_completed=sum(t.parent_id is not None for t in s.done),
        added=len(s.added_days),
        deleted=len(s.deleted_days),
    )


def _recent(s: _Snapshot) -> Recent:
    def within(days: Iterable[date], first: int, last: int) -> int:
        """Counts days from ``first`` to ``last`` days ago (inclusive)."""
        lo, hi = s.today - timedelta(days=last), s.today - timedelta(days=first)
        return sum(lo <= d <= hi for d in days)

    return Recent(
        added_7=within(s.added_days, 0, 6),
        completed_7=within(s.completed_days, 0, 6),
        added_prev_7=within(s.added_days, 7, 13),
        completed_prev_7=within(s.completed_days, 7, 13),
        added_30=within(s.added_days, 0, 29),
        completed_30=within(s.completed_days, 0, 29),
        subtasks_completed_7=within(s.subtask_completed_days, 0, 6),
    )


def _weeks(s: _Snapshot) -> list[WeekFlow]:
    first_monday = s.today - timedelta(days=s.today.weekday(), weeks=WEEKS - 1)

    def per_week(days: Iterable[date]) -> Counter[date]:
        return Counter(d - timedelta(days=d.weekday()) for d in days if d >= first_monday)

    added = per_week(s.added_days)
    completed = per_week(s.completed_days)
    deleted = per_week(s.deleted_days)
    starts = [first_monday + timedelta(weeks=i) for i in range(WEEKS)]
    return [WeekFlow(w, added[w], completed[w], deleted[w]) for w in starts]


def _lead_time(s: _Snapshot) -> LeadTime:
    one_off = [t for t in s.done if t.rrule is None and t.recurs_from_id is None]
    lead = {
        t.id: max(0.0, _days(t.created_at, datetime.fromisoformat(str(t.completed_at))))
        for t in one_off
    }
    values = sorted(lead.values())
    by_priority: list[PriorityLead] = []
    for p in PRIORITIES:
        mine = [lead[t.id] for t in one_off if t.priority == p]
        by_priority.append(PriorityLead(p, len(mine), statistics.median(mine) if mine else None))
    return LeadTime(
        count=len(values),
        mean_days=statistics.fmean(values) if values else None,
        median_days=statistics.median(values) if values else None,
        p90_days=_percentile(values, 0.9),
        buckets=_buckets(values),
        by_priority=by_priority,
    )


def _lists(s: _Snapshot, places: _Places) -> list[ListCount]:
    since_30 = s.today - timedelta(days=29)
    rows: list[ListCount] = []
    for list_id in [None, *places.lists]:
        members = [t for t in s.live if t.list_id == list_id]
        if list_id is not None and not members:
            continue
        found = None if list_id is None else places.lists[list_id]
        area = None if found is None or found.area_id is None else places.areas.get(found.area_id)
        rows.append(
            ListCount(
                id=list_id,
                name="Inbox" if found is None else found.name,
                area_name=None if area is None else area.name,
                open=sum(t.completed_at is None for t in members),
                overdue=sum(t.id in s.overdue_ids for t in members),
                completed=sum(t.completed_at is not None for t in members),
                completed_30=sum(
                    t.completed_at is not None and s.day(t.completed_at) >= since_30
                    for t in members
                ),
            )
        )
    return sorted(rows, key=lambda r: (-r.open, -r.completed, r.name.lower()))


def _areas(s: _Snapshot, places: _Places) -> list[AreaCount]:
    rows = [
        AreaCount(
            id=area_id,
            name="No area" if area_id is None else places.areas[area_id].name,
            open=sum(places.area_id(t) == area_id for t in s.open),
            completed=sum(places.area_id(t) == area_id for t in s.done),
        )
        for area_id in [None, *places.areas]
    ]
    return sorted(
        (r for r in rows if r.open or r.completed),
        key=lambda r: (-r.open, -r.completed, r.name.lower()),
    )


def _tags(s: _Snapshot, tag_ids: Mapping[str, Sequence[str]]) -> list[TagCount]:
    still_open: Counter[str] = Counter()
    done: Counter[str] = Counter()
    for t in s.live:
        (still_open if t.completed_at is None else done).update(tag_ids.get(t.id, ()))
    return sorted(
        (TagCount(tag, still_open[tag], done[tag]) for tag in still_open.keys() | done.keys()),
        key=lambda r: (-(r.open + r.completed), r.tag_id),
    )


def _punchcard(s: _Snapshot) -> list[list[int]]:
    grid = [[0] * 24 for _ in range(7)]
    for t in s.done:
        m = s.moment(str(t.completed_at))
        grid[m.weekday()][m.hour] += 1
    return grid


def _due(s: _Snapshot) -> DueKeeping:
    with_due = [t for t in s.done if t.due_date is not None]
    lateness = [
        (s.day(str(t.completed_at)) - date.fromisoformat(str(t.due_date))).days for t in with_due
    ]
    late = [d for d in lateness if d > 0]
    return DueKeeping(
        with_due_date=len(with_due),
        on_time=len(lateness) - len(late),
        late=len(late),
        mean_days_late=statistics.fmean(late) if late else None,
    )


def _percentile(sorted_values: Sequence[float], share: float) -> float | None:
    """The nearest-rank percentile of already sorted values."""
    if not sorted_values:
        return None
    return sorted_values[max(0, math.ceil(share * len(sorted_values)) - 1)]


def _buckets(values: Iterable[float]) -> list[Bucket]:
    """Counts values (in days) into ``AGE_BUCKETS``."""
    counts = Counter(next(label for label, bound in AGE_BUCKETS if v < bound) for v in values)
    return [Bucket(label, counts[label]) for label, _ in AGE_BUCKETS]


def _streaks(days: Sequence[date], today: date) -> Streaks:
    """Runs of consecutive days with a completion; today does not break the current run."""
    per_day = Counter(days)
    if not per_day:
        return Streaks(current=0, longest=0, active_days=0, best_day=None)
    current = 0
    cursor = today if today in per_day else today - timedelta(days=1)
    while cursor in per_day:
        current += 1
        cursor -= timedelta(days=1)
    longest = run = 0
    previous: date | None = None
    for d in sorted(per_day):
        run = run + 1 if previous is not None and (d - previous).days == 1 else 1
        longest = max(longest, run)
        previous = d
    best_date, best_count = max(per_day.items(), key=lambda item: (item[1], item[0]))
    return Streaks(current, longest, len(per_day), BestDay(best_date, best_count))
