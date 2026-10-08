"""Todos: create, read, patch, complete/reopen, ordering, logbook."""

from datetime import timedelta

from fastapi.testclient import TestClient
from todos_helpers import by_id, current, move, ok, section, titles_in_order, todo, todo_list

from planbox.core.clock import FixedClock
from planbox.core.ids import new_id


def test_create_defaults_to_inbox_end(client: TestClient) -> None:
    """New todos land at the end of the Inbox with sensible defaults."""
    first = todo(client, "First")
    second = todo(client, "Second")

    assert first["list_id"] is None
    assert (first["priority"], first["notes"], first["due_date"]) == (0, "", None)
    assert first["position"] < second["position"]
    assert first["created_at"] == "2026-10-08T12:00:00.000Z"


def test_create_cleans_the_title(client: TestClient) -> None:
    """Titles are single-line and trimmed; empty titles are rejected."""
    created = todo(client, "  Buy\n  milk  ")
    empty = client.post("/api/todos/items", json={"title": "   "})

    assert created["title"] == "Buy milk"
    assert empty.status_code == 422


def test_create_is_idempotent_and_validates_ids(client: TestClient) -> None:
    """Same client id twice gives the same todo; non-UUIDv7 ids are rejected."""
    todo_id = new_id()
    first = client.post("/api/todos/items", json={"id": todo_id, "title": "Once"})
    again = client.post("/api/todos/items", json={"id": todo_id, "title": "Once"})
    bad = client.post("/api/todos/items", json={"id": "not-a-uuid", "title": "x"})

    assert (first.status_code, again.status_code, bad.status_code) == (201, 200, 422)
    assert len(current(client)) == 1


def test_create_with_neighbours(client: TestClient) -> None:
    """after_id / before_id insert at that spot."""
    a = todo(client, "A")
    c = todo(client, "C")
    todo(client, "B", after_id=a["id"], before_id=c["id"])
    todo(client, "Start", before_id=a["id"])

    assert titles_in_order(client, list_id=None, parent_id=None) == ["Start", "A", "B", "C"]


def test_patch_changes_only_given_fields(client: TestClient) -> None:
    """Absent fields stay; null clears the due date."""
    created = todo(client, "Report", due_date="2026-10-09", priority=2, notes="draft")

    renamed = ok(client.patch(f"/api/todos/items/{created['id']}", json={"title": "Final"}))
    cleared = ok(client.patch(f"/api/todos/items/{created['id']}", json={"due_date": None}))

    assert (renamed["title"], renamed["due_date"], renamed["priority"]) == (
        "Final",
        "2026-10-09",
        2,
    )
    assert (cleared["due_date"], cleared["notes"]) == (None, "draft")


def test_patch_rejects_bad_values(client: TestClient) -> None:
    """Null titles, out-of-range priorities and bad dates are refused."""
    created = todo(client)
    url = f"/api/todos/items/{created['id']}"

    assert client.patch(url, json={"title": None}).status_code == 422
    assert client.patch(url, json={"priority": 4}).status_code == 422
    assert client.patch(url, json={"due_date": "tomorrow"}).status_code == 422


def test_patch_sets_tags(client: TestClient) -> None:
    """tag_ids replaces the todo's tags; unknown tags are refused."""
    created = todo(client)
    tag = ok(client.post("/api/tags", json={"name": "home"}), 201)
    url = f"/api/todos/items/{created['id']}"

    tagged = ok(client.patch(url, json={"tag_ids": [tag["id"]]}))
    unknown = client.patch(url, json={"tag_ids": [new_id()]})
    untagged = ok(client.patch(url, json={"tag_ids": []}))

    assert tagged["tag_ids"] == [tag["id"]]
    assert unknown.status_code == 422
    assert untagged["tag_ids"] == []


def test_complete_and_reopen(client: TestClient, clock: FixedClock) -> None:
    """Completion is stamped by the server and is idempotent."""
    created = todo(client)
    url = f"/api/todos/items/{created['id']}"

    done = ok(client.post(f"{url}/complete"))["todos"][0]
    clock.advance(timedelta(minutes=5))
    again = ok(client.post(f"{url}/complete"))["todos"][0]
    reopened = ok(client.post(f"{url}/reopen"))["todos"][0]

    assert done["completed_at"] == "2026-10-08T12:00:00.000Z"
    assert again["completed_at"] == done["completed_at"]
    assert reopened["completed_at"] is None


def test_current_hides_old_completions(client: TestClient, clock: FixedClock) -> None:
    """Yesterday's completed todos leave the current set; today's stay."""
    clock.advance(timedelta(days=-1))
    old = todo(client, "Old")
    client.post(f"/api/todos/items/{old['id']}/complete")
    clock.advance(timedelta(days=1))
    fresh = todo(client, "Fresh")
    client.post(f"/api/todos/items/{fresh['id']}/complete")
    still_open = todo(client, "Open")

    ids = set(by_id(current(client)))

    assert ids == {fresh["id"], still_open["id"]}


def test_current_requires_an_aware_instant(client: TestClient) -> None:
    """A naive completed_since is ambiguous and rejected."""
    response = client.get("/api/todos/items?completed_since=2026-10-08T00:00:00")

    assert response.status_code == 422


def test_logbook_pages_newest_first(client: TestClient, clock: FixedClock) -> None:
    """The cursor walks back through completed todos without gaps or repeats."""
    for i in range(5):
        created = todo(client, f"T{i}")
        client.post(f"/api/todos/items/{created['id']}/complete")
        clock.advance(timedelta(minutes=1))

    first = ok(client.get("/api/todos/items/completed?limit=2"))
    second = ok(client.get(f"/api/todos/items/completed?limit=2&cursor={first['next_cursor']}"))
    third = ok(client.get(f"/api/todos/items/completed?limit=2&cursor={second['next_cursor']}"))

    seen = [t["title"] for page in (first, second, third) for t in page["todos"]]
    assert seen == ["T4", "T3", "T2", "T1", "T0"]
    assert third["next_cursor"] is None


def test_reorder_within_the_inbox(client: TestClient) -> None:
    """Moving between neighbours reorders with a single key change."""
    a, b, c = (todo(client, n) for n in "ABC")

    ok(move(client, c["id"], after_id=a["id"], before_id=b["id"]))
    ok(move(client, a["id"]))  # no neighbours: to the end

    assert titles_in_order(client, list_id=None, parent_id=None) == ["C", "B", "A"]


def test_move_rejects_foreign_neighbours(client: TestClient) -> None:
    """Neighbours must be siblings in the target container."""
    inbox_todo = todo(client)
    project = todo_list(client)
    elsewhere = todo(client, list_id=project["id"])

    response = move(client, inbox_todo["id"], after_id=elsewhere["id"])

    assert response.status_code == 422


def test_move_between_lists_and_sections(client: TestClient) -> None:
    """A todo can move from the Inbox into a list section and back."""
    project = todo_list(client)
    next_up = section(client, project["id"])
    created = todo(client)

    moved = ok(move(client, created["id"], list_id=project["id"], section_id=next_up["id"]))
    back = ok(move(client, created["id"]))

    assert (moved["todos"][0]["list_id"], moved["todos"][0]["section_id"]) == (
        project["id"],
        next_up["id"],
    )
    assert back["todos"][0]["list_id"] is None


def test_unknown_todo_is_not_found(client: TestClient) -> None:
    """Every item route 404s on an unknown id."""
    missing = new_id()

    assert client.patch(f"/api/todos/items/{missing}", json={"title": "x"}).status_code == 404
    assert client.post(f"/api/todos/items/{missing}/complete").status_code == 404
    assert client.delete(f"/api/todos/items/{missing}").status_code == 404
