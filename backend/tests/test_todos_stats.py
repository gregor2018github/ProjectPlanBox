"""Todo statistics: flows, lead times, buckets, priorities, punch card and streaks."""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from todos_helpers import Json, ok, todo, todo_list

from planbox.core.clock import FixedClock, to_iso
from planbox.modules.todos.models import Area, Todo, TodoList
from planbox.modules.todos.stats import BestDay, TodoStats, compute_stats

ZONE = ZoneInfo("Europe/Amsterdam")
NOW = datetime(2026, 10, 8, 12, 0, tzinfo=UTC)  # Thu 8 Oct, 14:00 in Amsterdam


def stats(client: TestClient) -> Json:
    """GET /api/todos/stats."""
    return ok(client.get("/api/todos/stats"))


def row(todo_id: str, created: datetime, **fields: object) -> Todo:
    """A todo row for the pure function; instants are given as datetimes."""
    values: dict[str, object] = {
        "id": todo_id,
        "list_id": None,
        "section_id": None,
        "parent_id": None,
        "title": todo_id,
        "notes": "",
        "priority": 0,
        "due_date": None,
        "position": "a0",
        "completed_at": None,
        "created_at": to_iso(created),
        "updated_at": to_iso(created),
        "deleted_at": None,
    }
    for key, value in fields.items():
        values[key] = to_iso(value) if isinstance(value, datetime) else value
    return Todo(**values)  # type: ignore[arg-type]


def compute(todos: list[Todo], lists: list[TodoList] | None = None) -> TodoStats:
    """Runs the pure computation at NOW."""
    return compute_stats(
        todos,
        lists=lists or [],
        areas=[Area("a1", "Work", 264, "a0", "", "", None)],
        tag_ids={},
        now=NOW,
        zone=ZONE,
    )


def test_stats_of_an_empty_database(client: TestClient) -> None:
    """Everything is zero or empty, and the weeks still cover 26 Mondays."""
    body = stats(client)

    assert body["today"] == "2026-10-08"
    assert body["totals"]["open"] == 0
    assert body["lead_time"]["median_days"] is None
    assert body["streaks"] == {"current": 0, "longest": 0, "active_days": 0, "best_day": None}
    assert len(body["weeks"]) == 26
    assert body["weeks"][-1]["start"] == "2026-10-05"
    assert body["lists"] == [
        {
            "id": None,
            "name": "Inbox",
            "area_name": None,
            "open": 0,
            "overdue": 0,
            "completed": 0,
            "completed_30": 0,
        }
    ]


def test_totals_buckets_and_priorities(client: TestClient) -> None:
    """Open, overdue and due counts, the list buckets and the priority split."""
    project = todo_list(client, "Project")
    todo(client, "Late", due_date="2026-10-01", priority=3, list_id=project["id"])
    todo(client, "Now", due_date="2026-10-08", priority=3, list_id=project["id"])
    todo(client, "Soon", due_date="2026-10-12")
    done = todo(client, "Done", priority=2, list_id=project["id"])
    ok(client.post(f"/api/todos/items/{done['id']}/complete"))

    body = stats(client)
    totals = body["totals"]
    by_priority = {p["priority"]: p for p in body["priorities"]}

    assert (totals["open"], totals["overdue"], totals["due_today"]) == (3, 1, 1)
    assert (totals["due_next_7"], totals["no_due_date"], totals["inbox"]) == (1, 0, 1)
    assert (totals["completed"], totals["added"]) == (1, 4)
    assert [(r["name"], r["open"], r["overdue"], r["completed"]) for r in body["lists"]] == [
        ("Project", 2, 1, 1),
        ("Inbox", 1, 0, 0),
    ]
    assert (by_priority[3]["open"], by_priority[3]["overdue"]) == (2, 1)
    assert by_priority[2]["completed"] == 1


def test_lead_time_and_flows(client: TestClient, clock: FixedClock) -> None:
    """Lead time runs from added to completed; flows count per week and window."""
    first = todo(client, "Two days")
    clock.advance(timedelta(days=2))
    ok(client.post(f"/api/todos/items/{first['id']}/complete"))
    quick = todo(client, "Quick")
    clock.advance(timedelta(hours=1))
    ok(client.post(f"/api/todos/items/{quick['id']}/complete"))

    body = stats(client)
    lead = body["lead_time"]

    assert lead["count"] == 2
    assert lead["median_days"] == (2 + 1 / 24) / 2
    assert [b["count"] for b in lead["buckets"][:3]] == [1, 1, 0]
    assert body["recent"]["completed_7"] == 2
    assert body["weeks"][-1] == {"start": "2026-10-05", "added": 2, "completed": 2, "deleted": 0}


def test_repeating_todos_are_left_out_of_lead_times() -> None:
    """A repeat's wait is its schedule, and its next occurrence is not "added"."""
    day = timedelta(days=1)
    todos = [
        row("one-off", NOW - 3 * day, completed_at=NOW - day),
        row("repeat", NOW - 9 * day, completed_at=NOW - day, rrule="FREQ=WEEKLY"),
        row("next", NOW - day, recurs_from_id="repeat", rrule="FREQ=WEEKLY", due_date="2026-10-14"),
    ]

    result = compute(todos)

    assert result.lead_time.count == 1
    assert result.lead_time.median_days == 2
    assert result.totals.added == 2


def test_punchcard_and_due_keeping_use_local_time() -> None:
    """Completions land in the local weekday and hour; lateness is in local days."""
    created = NOW - timedelta(days=10)
    todos = [
        # 22:30 UTC on Wed 7 Oct is 00:30 on Thu 8 Oct in Amsterdam.
        row(
            "a",
            created,
            completed_at=datetime(2026, 10, 7, 22, 30, tzinfo=UTC),
            due_date="2026-10-07",
        ),
        row(
            "b",
            created,
            completed_at=datetime(2026, 10, 6, 8, 0, tzinfo=UTC),
            due_date="2026-10-06",
        ),
    ]

    result = compute(todos)

    assert result.punchcard[3][0] == 1  # Thursday, 00:00-01:00
    assert result.punchcard[1][10] == 1  # Tuesday, 10:00-11:00
    assert result.due.on_time == 1
    assert result.due.late == 1
    assert result.due.mean_days_late == 1


def test_streaks_count_days_with_a_completion() -> None:
    """Today does not break the current run; the best day is the busiest one."""
    created = NOW - timedelta(days=30)

    def done_on(todo_id: str, day: int) -> Todo:
        return row(todo_id, created, completed_at=datetime(2026, 10, day, 9, tzinfo=UTC))

    todos = [
        done_on("a", 1),
        done_on("b", 2),
        done_on("c", 3),
        done_on("d", 3),
        done_on("e", 6),
        done_on("f", 7),
    ]

    result = compute(todos)

    assert result.streaks.current == 2
    assert result.streaks.longest == 3
    assert result.streaks.active_days == 5
    assert result.streaks.best_day == BestDay(date(2026, 10, 3), 2)


def test_tags_and_oldest_open(client: TestClient, clock: FixedClock) -> None:
    """Tag counts come from the core taggings; the oldest open todos come first."""
    tag = ok(client.post("/api/tags", json={"name": "deep"}), 201)
    old = todo(client, "Ancient", tag_ids=[tag["id"]])
    clock.advance(timedelta(days=40))
    todo(client, "Fresh")

    body = stats(client)

    assert body["tags"] == [{"tag_id": tag["id"], "open": 1, "completed": 0}]
    assert body["oldest_open"][0]["id"] == old["id"]
    assert body["oldest_open"][0]["age_days"] == 40
    assert body["open_age"]["buckets"][-2]["count"] == 1  # 1-3 months


def test_subtask_completions_count_and_show_on_their_own(client: TestClient) -> None:
    """Ticking a subtask counts as a completion and is reported as a subtask too."""
    parent = todo(client, "Trip")
    first = todo(client, "Book hotel", parent_id=parent["id"])
    todo(client, "Pack", parent_id=parent["id"])
    ok(client.post(f"/api/todos/items/{first['id']}/complete"))

    body = stats(client)

    assert body["totals"]["completed"] == 1
    assert body["totals"]["subtasks_completed"] == 1
    assert body["totals"]["subtasks_open"] == 1
    assert body["recent"]["completed_7"] == 1
    assert body["recent"]["subtasks_completed_7"] == 1
    assert body["weeks"][-1]["completed"] == 1
    assert body["streaks"]["current"] == 1
