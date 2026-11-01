"""Todos: the day plan (``plan_date`` and ``plan_position``)."""

from datetime import timedelta

from fastapi.testclient import TestClient
from todos_helpers import by_id, current, ok, todo

from planbox.core.clock import FixedClock

TODAY = "2026-10-08"


def plan(client: TestClient, *ids: str, removed: tuple[str, ...] = ()) -> list[dict[str, object]]:
    """Stores today's day plan (and takes todos out); returns the changed todos."""
    body = {"ids": list(ids), "removed": list(removed)}
    return ok(client.post("/api/todos/day-plan", json=body))["todos"]


def planned(client: TestClient, *ids: str) -> list[tuple[object, object]]:
    """The plan date and key of these todos, in the given order."""
    rows = by_id(current(client))
    return [(rows[i]["plan_date"], rows[i]["plan_position"]) for i in ids]


def test_new_todos_are_not_planned(client: TestClient) -> None:
    """A plain new todo is not in the day plan."""
    created = todo(client, "Call")

    assert (created["plan_date"], created["plan_position"]) == (None, None)


def test_planning_dates_and_orders_todos(client: TestClient) -> None:
    """Planned todos get today's date and keys in the given order."""
    a, b, c = (todo(client, t) for t in "ABC")

    changed = plan(client, c["id"], a["id"], b["id"])

    assert {t["id"] for t in changed} == {a["id"], b["id"], c["id"]}
    rows = planned(client, c["id"], a["id"], b["id"])
    assert {d for d, _ in rows} == {TODAY}
    order = [k for _, k in rows]
    assert order == sorted(order)  # pyright: ignore[reportArgumentType]
    assert plan(client, c["id"], a["id"], b["id"]) == []


def test_removing_takes_a_todo_out_and_keeps_the_rest(client: TestClient) -> None:
    """``removed`` clears date and key; planned todos not listed keep theirs."""
    a, b = (todo(client, t) for t in "AB")
    plan(client, a["id"], b["id"])

    changed = plan(client, removed=(a["id"],))

    assert [t["id"] for t in changed] == [a["id"]]
    assert planned(client, a["id"])[0] == (None, None)
    assert planned(client, b["id"])[0][0] == TODAY


def test_created_in_plan_goes_last(client: TestClient) -> None:
    """``in_plan`` puts a new todo at the end of today's plan."""
    a = todo(client, "A")
    plan(client, a["id"])

    b = todo(client, "B", in_plan=True)

    assert b["plan_date"] == TODAY
    (_, first), (_, last) = planned(client, a["id"], b["id"])
    assert isinstance(first, str)
    assert isinstance(last, str)
    assert first < last


def test_plan_is_kept_through_completion_but_not_by_the_next_occurrence(
    client: TestClient,
) -> None:
    """A done todo stays in today's plan; a repeat's next occurrence starts unplanned."""
    daily = todo(client, "Water plants", due_date=TODAY, rrule="FREQ=DAILY")
    plan(client, daily["id"])

    done = ok(client.post(f"/api/todos/items/{daily['id']}/complete"))["todos"]

    rows = by_id(done)
    assert rows[daily["id"]]["plan_date"] == TODAY
    nxt = next(t for t in done if t["id"] != daily["id"])
    assert (nxt["plan_date"], nxt["plan_position"]) == (None, None)


def test_a_new_day_starts_an_empty_plan(client: TestClient, clock: FixedClock) -> None:
    """Yesterday's plan date no longer matches, and planning again restamps it."""
    a = todo(client, "A")
    plan(client, a["id"])
    clock.advance(timedelta(days=1))

    assert planned(client, a["id"])[0][0] == TODAY
    b = todo(client, "B", in_plan=True)
    assert b["plan_date"] == "2026-10-09"

    plan(client, a["id"], b["id"])

    assert planned(client, a["id"])[0][0] == "2026-10-09"


def test_duplicates_and_unknown_ids_are_refused(client: TestClient) -> None:
    """Each id once, across both lists; unknown ids are not found."""
    a = todo(client, "A")

    assert client.post("/api/todos/day-plan", json={"ids": [a["id"], a["id"]]}).status_code == 422
    body = {"ids": [a["id"]], "removed": [a["id"]]}
    assert client.post("/api/todos/day-plan", json=body).status_code == 422
    missing = "01890000-0000-7000-8000-000000000000"
    assert client.post("/api/todos/day-plan", json={"ids": [missing]}).status_code == 404
