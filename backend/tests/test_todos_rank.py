"""Todos: "My order" in All todos (``rank_position``) and Today (``today_rank_position``)."""

from fastapi.testclient import TestClient
from todos_helpers import by_id, current, ok, todo, todo_list

TODAY = "2026-10-08"


def rank(client: TestClient, *ids: str, unranked: tuple[str, ...] = ()) -> list[dict[str, object]]:
    """Stores "My order" (and unranks); returns the changed todos."""
    body = {"ids": list(ids), "unranked": list(unranked)}
    return ok(client.post("/api/todos/rank-order", json=body))["todos"]


def keys(client: TestClient, *ids: str) -> list[object]:
    """The rank keys of these todos, in the given order."""
    rows = by_id(current(client))
    return [rows[i]["rank_position"] for i in ids]


def test_new_todos_start_unsorted(client: TestClient) -> None:
    """A new todo has no rank key, so it waits in "Unsorted"."""
    created = todo(client, "Call")

    assert created["rank_position"] is None


def test_order_spans_lists_and_subtasks(client: TestClient) -> None:
    """Todos and subtasks from different lists get keys in the given order."""
    work = todo_list(client, "Work")
    a = todo(client, "A")
    b = todo(client, "B", list_id=work["id"])
    sub = todo(client, "B.1", list_id=work["id"], parent_id=b["id"])

    changed = rank(client, sub["id"], a["id"], b["id"])

    assert {t["id"] for t in changed} == {a["id"], b["id"], sub["id"]}
    ranked = keys(client, sub["id"], a["id"], b["id"])
    assert all(isinstance(k, str) for k in ranked)
    assert ranked == sorted(ranked)  # pyright: ignore[reportArgumentType]


def test_reorder_only_touches_rows_whose_key_changes(client: TestClient) -> None:
    """Moving the last todo up rewrites the rows after its new spot, not the ones above."""
    a, b, c = (todo(client, t) for t in "ABC")
    rank(client, a["id"], b["id"], c["id"])

    changed = rank(client, a["id"], c["id"], b["id"])

    assert {t["id"] for t in changed} == {b["id"], c["id"]}
    assert rank(client, a["id"], c["id"], b["id"]) == []


def test_unranking_sends_a_todo_back_to_unsorted(client: TestClient) -> None:
    """``unranked`` clears the key; ranked todos not listed keep theirs."""
    a, b = (todo(client, t) for t in "AB")
    rank(client, a["id"], b["id"])

    changed = rank(client, unranked=(a["id"],))

    assert [t["id"] for t in changed] == [a["id"]]
    assert keys(client, a["id"])[0] is None
    assert keys(client, b["id"])[0] is not None


def test_edits_moves_and_completion_keep_the_key(client: TestClient) -> None:
    """The ranking is about the todo, not its date or place, and survives a reopen."""
    work = todo_list(client, "Work")
    a = todo(client, "A", due_date=TODAY)
    rank(client, a["id"])
    before = keys(client, a["id"])[0]

    ok(client.patch(f"/api/todos/items/{a['id']}", json={"title": "A2", "due_date": "2026-10-09"}))
    ok(
        client.post(
            f"/api/todos/items/{a['id']}/move",
            json={"list_id": work["id"], "section_id": None, "parent_id": None},
        )
    )
    ok(client.post(f"/api/todos/items/{a['id']}/complete"))
    reopened = ok(client.post(f"/api/todos/items/{a['id']}/reopen"))["todos"]

    assert next(t for t in reopened if t["id"] == a["id"])["rank_position"] == before


def test_next_occurrence_keeps_the_place(client: TestClient) -> None:
    """A repeating todo stays where it was ranked rather than falling back to unsorted."""
    daily = todo(client, "Water plants", due_date=TODAY, rrule="FREQ=DAILY")
    rank(client, daily["id"])

    changed = ok(client.post(f"/api/todos/items/{daily['id']}/complete"))["todos"]

    nxt = next(t for t in changed if t["id"] != daily["id"])
    assert nxt["rank_position"] == keys(client, daily["id"])[0]


def test_rejects_duplicates_and_unknown_or_deleted_todos(client: TestClient) -> None:
    """Each id once (across both lists), and only live todos; nothing is written then."""
    a = todo(client, "A")
    gone = todo(client, "Gone")
    ok(client.delete(f"/api/todos/items/{gone['id']}"))

    twice = client.post("/api/todos/rank-order", json={"ids": [a["id"], a["id"]]})
    both = client.post("/api/todos/rank-order", json={"ids": [a["id"]], "unranked": [a["id"]]})
    deleted = client.post("/api/todos/rank-order", json={"ids": [a["id"], gone["id"]]})

    assert twice.status_code == 422
    assert both.status_code == 422
    assert deleted.status_code == 404
    assert keys(client, a["id"])[0] is None


def rank_today(
    client: TestClient, *ids: str, unranked: tuple[str, ...] = ()
) -> list[dict[str, object]]:
    """Stores Today's "My order" (and unranks); returns the changed todos."""
    body = {"ids": list(ids), "unranked": list(unranked), "scope": "today"}
    return ok(client.post("/api/todos/rank-order", json=body))["todos"]


def today_keys(client: TestClient, *ids: str) -> list[object]:
    """Today's rank keys of these todos, in the given order."""
    rows = by_id(current(client))
    return [rows[i]["today_rank_position"] for i in ids]


def test_today_order_is_separate_from_all_todos(client: TestClient) -> None:
    """Today's ranking mixes overdue and due today and leaves All todos' alone."""
    late = todo(client, "Late", due_date="2026-10-01")
    now = todo(client, "Now", due_date=TODAY)
    assert now["today_rank_position"] is None

    changed = rank_today(client, now["id"], late["id"])

    assert {t["id"] for t in changed} == {now["id"], late["id"]}
    ranked = today_keys(client, now["id"], late["id"])
    assert ranked == sorted(ranked)  # pyright: ignore[reportArgumentType]
    assert keys(client, now["id"], late["id"]) == [None, None]
    assert rank_today(client, unranked=(late["id"],))[0]["today_rank_position"] is None


def test_today_key_stays_while_the_todo_stays_in_today(client: TestClient) -> None:
    """Moving an overdue todo to today keeps its place; moving it later or undating drops it."""
    a = todo(client, "A", due_date="2026-10-01")
    b = todo(client, "B", due_date=TODAY)
    rank_today(client, a["id"], b["id"])

    ok(client.patch(f"/api/todos/items/{a['id']}", json={"due_date": TODAY}))
    ok(client.patch(f"/api/todos/items/{b['id']}", json={"due_date": "2026-10-09"}))

    assert today_keys(client, a["id"])[0] is not None
    assert today_keys(client, b["id"])[0] is None
    ok(client.patch(f"/api/todos/items/{a['id']}", json={"due_date": None}))
    assert today_keys(client, a["id"])[0] is None


def test_next_occurrence_keeps_its_place_in_today(client: TestClient) -> None:
    """A daily routine comes back to the same spot in Today's order."""
    daily = todo(client, "Water plants", due_date=TODAY, rrule="FREQ=DAILY")
    rank_today(client, daily["id"])

    changed = ok(client.post(f"/api/todos/items/{daily['id']}/complete"))["todos"]

    nxt = next(t for t in changed if t["id"] != daily["id"])
    assert nxt["today_rank_position"] == today_keys(client, daily["id"])[0]
