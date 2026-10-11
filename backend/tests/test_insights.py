"""Insights: app opens and the cross-module activity overview."""

from datetime import timedelta

from fastapi.testclient import TestClient
from todos_helpers import Json, ok, todo

from planbox.core.clock import FixedClock
from planbox.core.ids import new_id


def activity(client: TestClient, start: str = "2026-10-01", end: str = "2026-10-31") -> Json:
    """The activity overview for a range (default: October 2026)."""
    return ok(client.get("/api/insights/activity", params={"start": start, "end": end}))


def day_of(body: Json, date: str) -> Json:
    """The activity row of one day (all zeros when that day had none)."""
    empty = {"date": date, "created": 0, "completed": 0, "deleted": 0, "opens": 0}
    return next((d for d in body["days"] if d["date"] == date), empty)


def test_app_open_is_recorded_once_per_id(client: TestClient) -> None:
    """Retrying an app open with the same id counts once; bad ids are refused."""
    open_id = new_id()
    first = client.post("/api/insights/opens", json={"id": open_id})
    again = client.post("/api/insights/opens", json={"id": open_id})
    bad = client.post("/api/insights/opens", json={"id": "nope"})
    anonymous = client.post("/api/insights/opens", json={})

    assert (first.status_code, again.status_code, bad.status_code) == (201, 200, 422)
    assert anonymous.status_code == 201
    opens = activity(client)["opens"]
    assert (opens["in_range"], opens["all_time"]) == (2, 2)
    assert opens["first_at"] == "2026-10-08T12:00:00.000Z"


def test_app_open_needs_a_json_body(client: TestClient) -> None:
    """A form post (what a foreign website could send) is rejected."""
    response = client.post("/api/insights/opens", content=b"id=x")

    assert response.status_code == 422


def test_opens_are_bucketed_by_local_hour_and_weekday(
    client: TestClient, clock: FixedClock
) -> None:
    """12:00 UTC on Thu 8 Oct is 14:00 in Amsterdam (summer time)."""
    client.post("/api/insights/opens", json={})
    clock.advance(timedelta(hours=11))  # 01:00 Friday in Amsterdam
    client.post("/api/insights/opens", json={})

    body = activity(client)

    assert body["opens"]["by_hour"][14] == 1
    assert body["opens"]["by_hour"][1] == 1
    assert body["opens"]["by_weekday"][3:5] == [1, 1]
    assert day_of(body, "2026-10-08")["opens"] == 1
    assert day_of(body, "2026-10-09")["opens"] == 1


def test_activity_counts_every_module(client: TestClient, clock: FixedClock) -> None:
    """Todos, knowledge, calendar and habits all feed the overview."""
    done = todo(client, "Ship it")
    gone = todo(client, "Never mind")
    ok(client.post(f"/api/todos/items/{done['id']}/complete"))
    ok(client.delete(f"/api/todos/items/{gone['id']}"))
    ok(client.post("/api/knowledge/entries", json={"kind": "note", "title": "Idea"}), 201)
    ok(
        client.post(
            "/api/calendar/events",
            json={
                "title": "Dentist",
                "all_day": True,
                "start_date": "2026-10-09",
                "end_date": "2026-10-09",
            },
        ),
        201,
    )
    habit = ok(client.post("/api/habits/habits", json={"name": "Read"}), 201)
    ok(client.put(f"/api/habits/habits/{habit['id']}/checkins/2026-10-08"))

    body = activity(client)
    today = day_of(body, "2026-10-08")
    types = {t["entity_type"]: t for t in body["types"]}

    assert today == {
        "date": "2026-10-08",
        "created": 5,
        "completed": 2,
        "deleted": 1,
        "opens": 0,
    }
    assert (types["todos.todo"]["created"], types["todos.todo"]["completed"]) == (2, 1)
    assert types["todos.todo"]["deleted"] == 1
    assert types["habits.habit"]["completed"] == 1
    assert types["knowledge.entry"]["created"] == 1
    assert types["calendar.event"]["created"] == 1


def test_activity_skips_the_next_occurrence_of_a_repeat(client: TestClient) -> None:
    """Completing a repeating todo adds its next occurrence, but nobody added it."""
    daily = todo(client, "Water plants", due_date="2026-10-08", rrule="FREQ=DAILY")
    ok(client.post(f"/api/todos/items/{daily['id']}/complete"))

    today = day_of(activity(client), "2026-10-08")

    assert (today["created"], today["completed"]) == (1, 1)


def test_activity_range_is_limited(client: TestClient) -> None:
    """Reversed ranges and ranges over 400 days are refused; outside events are left out."""
    todo(client)

    reversed_range = client.get(
        "/api/insights/activity", params={"start": "2026-10-09", "end": "2026-10-01"}
    )
    too_long = client.get(
        "/api/insights/activity", params={"start": "2025-01-01", "end": "2026-10-31"}
    )
    before = activity(client, "2026-09-01", "2026-09-30")

    assert (reversed_range.status_code, too_long.status_code) == (422, 422)
    assert before["days"] == []
