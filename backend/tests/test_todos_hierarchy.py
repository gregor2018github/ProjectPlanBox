"""Areas, lists, sections and subtasks: invariants and cascades."""

from datetime import timedelta

from fastapi.testclient import TestClient
from todos_helpers import area, by_id, current, move, ok, section, todo, todo_list

from planbox.core.clock import FixedClock


def test_containers_are_listed_in_order(client: TestClient) -> None:
    """Areas, lists (per area) and sections come back in position order."""
    work = area(client, "Work")
    home = area(client, "Home")
    ok(client.post(f"/api/todos/areas/{home['id']}/move", json={"before_id": work["id"]}))
    loose = todo_list(client, "Loose")
    project = todo_list(client, "Project", work["id"])
    later = section(client, project["id"], "Later")
    section(client, project["id"], "Now")
    ok(client.post(f"/api/todos/sections/{later['id']}/move", json={"list_id": project["id"]}))

    areas = ok(client.get("/api/todos/areas"))
    lists = ok(client.get("/api/todos/lists"))
    sections = ok(client.get("/api/todos/sections"))

    assert [a["name"] for a in areas] == ["Home", "Work"]
    assert {(item["name"], item["area_id"]) for item in lists} == {
        ("Loose", None),
        ("Project", work["id"]),
    }
    assert loose["area_id"] is None
    assert [s["name"] for s in sections] == ["Now", "Later"]


def test_lists_move_between_areas(client: TestClient) -> None:
    """A list can move into an area and out again."""
    work = area(client)
    project = todo_list(client)

    inside = ok(client.post(f"/api/todos/lists/{project['id']}/move", json={"area_id": work["id"]}))
    outside = ok(client.post(f"/api/todos/lists/{project['id']}/move", json={"area_id": None}))

    assert (inside["area_id"], outside["area_id"]) == (work["id"], None)


def test_inbox_has_no_sections(client: TestClient) -> None:
    """section_id needs a list, and the section must belong to it."""
    project = todo_list(client)
    other = todo_list(client, "Other")
    next_up = section(client, project["id"])

    no_list = client.post("/api/todos/items", json={"title": "x", "section_id": next_up["id"]})
    wrong_list = client.post(
        "/api/todos/items",
        json={"title": "x", "list_id": other["id"], "section_id": next_up["id"]},
    )

    assert (no_list.status_code, wrong_list.status_code) == (422, 422)


def test_subtasks_are_one_level_and_follow_their_parent(client: TestClient) -> None:
    """A subtask shares its parent's container; subtasks of subtasks are refused."""
    project = todo_list(client)
    parent = todo(client, "Parent", list_id=project["id"])
    child = todo(client, "Child", list_id=project["id"], parent_id=parent["id"])

    grandchild = client.post(
        "/api/todos/items",
        json={"title": "x", "list_id": project["id"], "parent_id": child["id"]},
    )
    mismatched = client.post("/api/todos/items", json={"title": "x", "parent_id": parent["id"]})

    assert grandchild.status_code == 422
    assert mismatched.status_code == 422


def test_moving_a_parent_moves_its_subtasks(client: TestClient) -> None:
    """Subtasks always end up in the parent's list and section."""
    project = todo_list(client)
    next_up = section(client, project["id"])
    parent = todo(client, "Parent")
    child = todo(client, "Child", parent_id=parent["id"])

    moved = ok(move(client, parent["id"], list_id=project["id"], section_id=next_up["id"]))

    changed = by_id(moved["todos"])
    assert changed[child["id"]]["list_id"] == project["id"]
    assert changed[child["id"]]["section_id"] == next_up["id"]


def test_indent_and_outdent(client: TestClient) -> None:
    """Moving under a sibling makes a subtask; moving out promotes it."""
    first = todo(client, "First")
    second = todo(client, "Second")

    indented = ok(move(client, second["id"], parent_id=first["id"]))["todos"][0]
    outdented = ok(move(client, second["id"], after_id=first["id"]))["todos"][0]

    assert indented["parent_id"] == first["id"]
    assert outdented["parent_id"] is None


def test_a_parent_cannot_become_a_subtask(client: TestClient) -> None:
    """Indenting a todo that has subtasks would create two levels."""
    first = todo(client, "First")
    second = todo(client, "Second")
    todo(client, "Child", parent_id=second["id"])

    assert move(client, second["id"], parent_id=first["id"]).status_code == 422
    assert move(client, first["id"], parent_id=first["id"]).status_code == 422


def test_completing_a_parent_completes_open_subtasks(client: TestClient, clock: FixedClock) -> None:
    """Shared timestamp; reopening brings back exactly those."""
    parent = todo(client, "Parent")
    done_before = todo(client, "Done before", parent_id=parent["id"])
    still_open = todo(client, "Open", parent_id=parent["id"])
    ok(client.post(f"/api/todos/items/{done_before['id']}/complete"))
    clock.advance(timedelta(seconds=1))

    completed = by_id(ok(client.post(f"/api/todos/items/{parent['id']}/complete"))["todos"])
    reopened = by_id(ok(client.post(f"/api/todos/items/{parent['id']}/reopen"))["todos"])

    assert set(completed) == {parent["id"], still_open["id"]}
    assert set(reopened) == {parent["id"], still_open["id"]}
    assert by_id(current(client))[done_before["id"]]["completed_at"] is not None


def test_reopening_a_subtask_reopens_its_parent(client: TestClient) -> None:
    """No open subtask hides under a completed parent."""
    parent = todo(client, "Parent")
    child = todo(client, "Child", parent_id=parent["id"])
    ok(client.post(f"/api/todos/items/{parent['id']}/complete"))

    reopened = by_id(ok(client.post(f"/api/todos/items/{child['id']}/reopen"))["todos"])

    assert reopened[parent["id"]]["completed_at"] is None
    assert reopened[child["id"]]["completed_at"] is None


def test_no_subtasks_under_completed_todos(client: TestClient) -> None:
    """Adding work to a finished todo must reopen it first."""
    parent = todo(client, "Parent")
    ok(client.post(f"/api/todos/items/{parent['id']}/complete"))

    response = client.post("/api/todos/items", json={"title": "x", "parent_id": parent["id"]})

    assert response.status_code == 422


def test_deleting_a_todo_takes_its_subtasks_and_restore_brings_them_back(
    client: TestClient,
) -> None:
    """One undo restores the whole tree."""
    parent = todo(client, "Parent")
    child = todo(client, "Child", parent_id=parent["id"])

    deleted = ok(client.delete(f"/api/todos/items/{parent['id']}"))
    after_delete = by_id(current(client))
    restored = by_id(ok(client.post(f"/api/todos/items/{parent['id']}/restore"))["todos"])

    assert deleted["todos"] == 2
    assert after_delete == {}
    assert set(restored) == {parent["id"], child["id"]}


def test_restore_keeps_separately_deleted_subtasks_deleted(
    client: TestClient, clock: FixedClock
) -> None:
    """Only rows deleted together with the parent come back."""
    parent = todo(client, "Parent")
    gone_earlier = todo(client, "Earlier", parent_id=parent["id"])
    ok(client.delete(f"/api/todos/items/{gone_earlier['id']}"))
    clock.advance(timedelta(seconds=1))
    ok(client.delete(f"/api/todos/items/{parent['id']}"))

    restored = by_id(ok(client.post(f"/api/todos/items/{parent['id']}/restore"))["todos"])

    assert set(restored) == {parent["id"]}


def test_deleting_an_area_cascades_and_restores_exactly(client: TestClient) -> None:
    """Area -> lists -> sections -> todos, one shared stamp, one undo."""
    work = area(client)
    project = todo_list(client, "Project", work["id"])
    next_up = section(client, project["id"])
    task = todo(client, "Task", list_id=project["id"], section_id=next_up["id"])
    inbox = todo(client, "Inbox")

    deleted = ok(client.delete(f"/api/todos/areas/{work['id']}"))
    left = by_id(current(client))
    restored = ok(client.post(f"/api/todos/areas/{work['id']}/restore"))

    assert (deleted["areas"], deleted["lists"], deleted["sections"], deleted["todos"]) == (
        1,
        1,
        1,
        1,
    )
    assert set(left) == {inbox["id"]}
    assert restored["todos"] == 1
    assert task["id"] in by_id(current(client))
    assert [s["id"] for s in ok(client.get("/api/todos/sections"))] == [next_up["id"]]


def test_restoring_inside_a_deleted_container_is_refused(client: TestClient) -> None:
    """A list in a deleted area (or a todo in a deleted list) needs its container first."""
    work = area(client)
    project = todo_list(client, "Project", work["id"])
    ok(client.delete(f"/api/todos/lists/{project['id']}"))
    ok(client.delete(f"/api/todos/areas/{work['id']}"))

    assert client.post(f"/api/todos/lists/{project['id']}/restore").status_code == 409


def test_section_moving_lists_takes_its_todos(client: TestClient) -> None:
    """Todos (and subtasks) follow their section into the new list."""
    old = todo_list(client, "Old")
    new = todo_list(client, "New")
    next_up = section(client, old["id"])
    task = todo(client, "Task", list_id=old["id"], section_id=next_up["id"])
    child = todo(client, "Child", list_id=old["id"], section_id=next_up["id"], parent_id=task["id"])

    ok(client.post(f"/api/todos/sections/{next_up['id']}/move", json={"list_id": new["id"]}))

    items = by_id(current(client))
    assert items[task["id"]]["list_id"] == new["id"]
    assert items[child["id"]]["list_id"] == new["id"]


def test_deleting_a_section_takes_its_todos(client: TestClient) -> None:
    """Section delete cascades to its todos; restore brings them back."""
    project = todo_list(client)
    next_up = section(client, project["id"])
    task = todo(client, "Task", list_id=project["id"], section_id=next_up["id"])

    ok(client.delete(f"/api/todos/sections/{next_up['id']}"))
    gone = task["id"] not in by_id(current(client))
    ok(client.post(f"/api/todos/sections/{next_up['id']}/restore"))

    assert gone
    assert task["id"] in by_id(current(client))


def test_restored_item_gets_a_fresh_spot_if_its_key_was_taken(client: TestClient) -> None:
    """Restoring never creates two siblings with the same position."""
    first = todo(client, "First")
    ok(client.delete(f"/api/todos/items/{first['id']}"))
    replacement = todo(client, "Replacement")  # takes the same "end" key
    restored = ok(client.post(f"/api/todos/items/{first['id']}/restore"))["todos"][0]

    assert replacement["position"] == first["position"]
    assert restored["position"] != replacement["position"]
