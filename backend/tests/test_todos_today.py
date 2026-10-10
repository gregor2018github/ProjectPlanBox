"""Todos: the manual order inside Today (``today_position``)."""

from fastapi.testclient import TestClient
from todos_helpers import by_id, current, ok, todo, todo_list

TODAY = "2026-10-08"


def today_order(client: TestClient, *ids: str) -> list[dict[str, object]]:
    """Stores a Today order; returns the changed todos."""
    return ok(client.post("/api/todos/today-order", json={"ids": list(ids)}))["todos"]


def test_new_todos_have_no_today_position(client: TestClient) -> None:
    """Until Today is reordered, it stays auto-sorted (no key)."""
    created = todo(client, "Call", due_date=TODAY)

    assert created["today_position"] is None


def test_order_spans_lists_and_writes_keys_in_order(client: TestClient) -> None:
    """Todos from different lists get keys in the given order."""
    work = todo_list(client, "Work")
    a = todo(client, "A", due_date=TODAY)
    b = todo(client, "B", due_date=TODAY, list_id=work["id"])
    c = todo(client, "C", due_date=TODAY)

    changed = today_order(client, c["id"], a["id"], b["id"])

    assert {t["id"] for t in changed} == {a["id"], b["id"], c["id"]}
    rows = by_id(current(client))
    keys = [rows[i]["today_position"] for i in (c["id"], a["id"], b["id"])]
    assert all(isinstance(k, str) for k in keys)
    assert keys == sorted(keys)  # pyright: ignore[reportArgumentType]


def test_reorder_only_touches_rows_whose_key_changes(client: TestClient) -> None:
    """Moving the last todo up rewrites the rows after its new spot, not the ones above."""
    a, b, c = (todo(client, t, due_date=TODAY) for t in "ABC")
    today_order(client, a["id"], b["id"], c["id"])

    changed = today_order(client, a["id"], c["id"], b["id"])

    assert {t["id"] for t in changed} == {b["id"], c["id"]}
    assert today_order(client, a["id"], c["id"], b["id"]) == []


def test_changing_the_due_date_drops_the_key(client: TestClient) -> None:
    """A todo that leaves Today and comes back lands at the end again."""
    a = todo(client, "A", due_date=TODAY)
    today_order(client, a["id"])

    renamed = ok(client.patch(f"/api/todos/items/{a['id']}", json={"title": "A2"}))
    moved = ok(client.patch(f"/api/todos/items/{a['id']}", json={"due_date": "2026-10-09"}))

    assert renamed["today_position"] is not None
    assert moved["today_position"] is None


def test_next_occurrence_starts_without_a_key(client: TestClient) -> None:
    """Completing a repeating todo does not copy its place in Today."""
    daily = todo(client, "Water plants", due_date=TODAY, rrule="FREQ=DAILY")
    today_order(client, daily["id"])

    changed = ok(client.post(f"/api/todos/items/{daily['id']}/complete"))["todos"]

    nxt = next(t for t in changed if t["id"] != daily["id"])
    assert nxt["today_position"] is None


def test_rejects_duplicates_and_unknown_or_deleted_todos(client: TestClient) -> None:
    """Each id once, and only live todos."""
    a = todo(client, "A", due_date=TODAY)
    gone = todo(client, "Gone", due_date=TODAY)
    ok(client.delete(f"/api/todos/items/{gone['id']}"))

    twice = client.post("/api/todos/today-order", json={"ids": [a["id"], a["id"]]})
    deleted = client.post("/api/todos/today-order", json={"ids": [a["id"], gone["id"]]})

    assert twice.status_code == 422
    assert deleted.status_code == 404
    assert by_id(current(client))[a["id"]]["today_position"] is None
