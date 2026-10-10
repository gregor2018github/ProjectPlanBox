"""Habits API: schedules, check-ins, streaks, delete/restore, search and links."""

from datetime import date, timedelta
from typing import Any

from fastapi.testclient import TestClient

from planbox.core.clock import FixedClock
from planbox.core.ids import new_id
from planbox.modules.habits.streaks import streaks

type Json = dict[str, Any]

TODAY = "2026-10-08"  # the fixed clock's date in Europe/Amsterdam (a Thursday)


def ok(response: Any, status: int = 200) -> Any:  # noqa: ANN401 - JSON is untyped
    """Asserts the status and returns the JSON body."""
    assert response.status_code == status, response.text
    return response.json()


def habit(client: TestClient, name: str = "Stretch", **fields: Any) -> Json:  # noqa: ANN401
    """Creates a habit."""
    return ok(client.post("/api/habits/habits", json={"name": name, **fields}), 201)


def overview(client: TestClient, start: str = "2026-10-05", end: str = "2026-10-11") -> list[Json]:
    """Habits with their days in a range (default: this week, Mon-Sun)."""
    return ok(client.get("/api/habits/habits", params={"start": start, "end": end}))


def check(client: TestClient, habit_id: str, day: str) -> Any:  # noqa: ANN401
    """Checks a day."""
    return client.put(f"/api/habits/habits/{habit_id}/checkins/{day}")


def uncheck(client: TestClient, habit_id: str, day: str) -> Any:  # noqa: ANN401
    """Unchecks a day."""
    return client.delete(f"/api/habits/habits/{habit_id}/checkins/{day}")


def days_before(n: int) -> str:
    """The date ``n`` days before TODAY."""
    return (date.fromisoformat(TODAY) - timedelta(days=n)).isoformat()


def test_new_habit_is_daily_from_today(client: TestClient) -> None:
    """Defaults: daily, starting today; scheduled days start there."""
    h = habit(client)

    assert h["rrule"] == "FREQ=DAILY"
    assert h["start_date"] == TODAY
    [view] = overview(client)
    assert view["scheduled"] == ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]
    assert view["checkins"] == []
    assert view["current_streak"] == view["best_streak"] == 0


def test_weekday_schedule_and_create_is_idempotent(client: TestClient) -> None:
    """A weekly rule on chosen days; repeating a create with its id returns it."""
    body = {
        "id": new_id(),
        "name": "Gym",
        "rrule": "FREQ=WEEKLY;BYDAY=MO,WE,FR",
        "start_date": "2026-10-01",
    }
    first = ok(client.post("/api/habits/habits", json=body), 201)
    again = ok(client.post("/api/habits/habits", json=body), 200)

    assert again["id"] == first["id"]
    [view] = overview(client)
    assert view["scheduled"] == ["2026-10-05", "2026-10-07", "2026-10-09"]


def test_check_and_uncheck_are_idempotent(client: TestClient) -> None:
    """Checking twice keeps one check-in; unchecking twice is harmless."""
    h = habit(client)
    assert ok(check(client, h["id"], TODAY)) == {"habit_id": h["id"], "day": TODAY, "checked": True}
    ok(check(client, h["id"], TODAY))
    assert overview(client)[0]["checkins"] == [TODAY]
    assert overview(client)[0]["total_checkins"] == 1

    ok(uncheck(client, h["id"], TODAY))
    ok(uncheck(client, h["id"], TODAY))
    assert overview(client)[0]["checkins"] == []

    ok(check(client, h["id"], TODAY))  # a new row after the soft delete
    assert overview(client)[0]["checkins"] == [TODAY]


def test_future_days_cannot_be_checked(client: TestClient) -> None:
    """Tomorrow is refused; earlier days are fine (catching up)."""
    h = habit(client, start_date="2026-09-01")

    assert check(client, h["id"], "2026-10-09").status_code == 422
    ok(check(client, h["id"], "2026-09-15"))


def test_streaks_follow_the_schedule(client: TestClient) -> None:
    """Missed days break streaks; an open today does not; best keeps the record."""
    h = habit(client, start_date=days_before(10))
    for n in (10, 9, 8, 7):  # a run of four
        ok(check(client, h["id"], days_before(n)))
    # day 6 missed
    for n in (5, 4, 3, 2, 1):  # five in a row up to yesterday; today still open
        ok(check(client, h["id"], days_before(n)))

    view = overview(client)[0]
    assert (view["current_streak"], view["best_streak"]) == (5, 5)

    ok(check(client, h["id"], TODAY))
    view = overview(client)[0]
    assert (view["current_streak"], view["best_streak"]) == (6, 6)


def test_catching_up_before_the_start_date_counts(client: TestClient) -> None:
    """A habit added today, ticked for the three days before: the start moves back."""
    h = habit(client)
    for n in (3, 2, 1):
        ok(check(client, h["id"], days_before(n)))

    view = overview(client)[0]
    assert view["start_date"] == days_before(3)
    assert view["scheduled"][:3] == [days_before(3), days_before(2), days_before(1)]
    assert (view["current_streak"], view["best_streak"]) == (3, 3)


def test_unscheduled_check_ins_neither_count_nor_break(client: TestClient) -> None:
    """On a Mon/Wed/Fri habit, a Tuesday check-in is shown but not counted."""
    h = habit(client, rrule="FREQ=WEEKLY;BYDAY=MO,WE,FR", start_date="2026-09-28")
    for day in ("2026-09-28", "2026-09-30", "2026-10-02", "2026-10-05", "2026-10-06"):
        ok(check(client, h["id"], day))
    # Wed 7 Oct missed -> broken; Fri 9 Oct is in the future.

    view = overview(client)[0]
    assert view["checkins"] == ["2026-10-05", "2026-10-06"]
    assert (view["current_streak"], view["best_streak"]) == (0, 4)
    assert view["total_checkins"] == 5


def test_streak_counts_in_the_configured_zone(client: TestClient, clock: FixedClock) -> None:
    """At 23:30 UTC it is already the next day in Amsterdam."""
    h = habit(client)
    clock.advance(timedelta(hours=11, minutes=30))  # 2026-10-08 23:30 UTC = 9 Oct 01:30 local

    ok(check(client, h["id"], "2026-10-09"))


def test_update_schedule_and_fields(client: TestClient) -> None:
    """Name, notes and schedule change; an invalid rule is refused."""
    h = habit(client)
    url = f"/api/habits/habits/{h['id']}"

    changed = ok(
        client.patch(
            url,
            json={
                "name": "  Stretch   daily ",
                "notes": "10 min",
                "rrule": "FREQ=DAILY;INTERVAL=2",
            },
        )
    )

    assert changed["name"] == "Stretch daily"
    assert changed["notes"] == "10 min"
    assert changed["rrule"] == "FREQ=DAILY;INTERVAL=2"
    assert overview(client)[0]["scheduled"] == ["2026-10-08", "2026-10-10"]
    assert client.patch(url, json={"rrule": "FREQ=HOURLY"}).status_code == 422
    assert client.patch(url, json={"name": " "}).status_code == 422
    assert client.patch(url, json={"name": None}).status_code == 422


def test_delete_and_restore_keep_the_history(client: TestClient) -> None:
    """A deleted habit disappears; restoring brings back its check-ins."""
    h = habit(client)
    ok(check(client, h["id"], TODAY))

    ok(client.delete(f"/api/habits/habits/{h['id']}"))
    assert overview(client) == []
    assert check(client, h["id"], TODAY).status_code == 404

    ok(client.post(f"/api/habits/habits/{h['id']}/restore"))
    assert overview(client)[0]["checkins"] == [TODAY]


def test_ranges_are_checked(client: TestClient) -> None:
    """A reversed or very long range is refused."""
    habit(client)
    reversed_range = {"start": "2026-10-10", "end": "2026-10-01"}
    assert client.get("/api/habits/habits", params=reversed_range).status_code == 422
    long_range = {"start": "2025-01-01", "end": "2026-10-01"}
    assert client.get("/api/habits/habits", params=long_range).status_code == 422


def test_habits_are_ordered_by_creation(client: TestClient) -> None:
    """New habits go to the end."""
    for name in ("A", "B", "C"):
        habit(client, name)

    assert [h["name"] for h in overview(client)] == ["A", "B", "C"]


def test_habits_are_searchable_and_linkable(client: TestClient) -> None:
    """Search finds habits by name and notes; a todo can link to one."""
    h = habit(client, "Meditate", notes="Morning, before coffee")
    todo = ok(client.post("/api/todos/items", json={"title": "Buy cushion"}), 201)

    hits = ok(client.get("/api/search", params={"q": "coffee"}))
    assert [(x["ref"], x["hint"]) for x in hits] == [(f"habits.habit:{h['id']}", "Habit")]
    created = client.post(
        "/api/links",
        json={"source": f"todos.todo:{todo['id']}", "target": f"habits.habit:{h['id']}"},
    )
    assert ok(created, 201)["target"]["title"] == "Meditate"


def test_streak_function_edge_cases() -> None:
    """No schedule, all kept, and a gap right before today."""
    d = date(2026, 10, 1)
    days = [d + timedelta(days=i) for i in range(5)]  # 1..5 Oct, today = 5 Oct
    today = days[-1]

    assert streaks([], set(), today) == (0, 0)
    assert streaks(days, set(days), today) == (5, 5)
    assert streaks(days, set(days[:3]), today) == (0, 3)  # 4 Oct missed
    assert streaks(days, set(days[:4]), today) == (4, 4)  # today still open
