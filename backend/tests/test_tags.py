"""Core tags: CRUD, naming rules, idempotent create, delete/restore with attachments."""

from fastapi.testclient import TestClient

from planbox.core.ids import new_id


def create_tag(client: TestClient, name: str) -> dict[str, str]:
    """Creates a tag and returns it."""
    response = client.post("/api/tags", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def test_create_list_rename(client: TestClient) -> None:
    """Tags are listed alphabetically, case-insensitively."""
    create_tag(client, "work")
    home = create_tag(client, "Home")

    renamed = client.patch(f"/api/tags/{home['id']}", json={"name": "errands"}).json()

    assert renamed["name"] == "errands"
    assert [t["name"] for t in client.get("/api/tags").json()] == ["errands", "work"]


def test_names_are_unique_ignoring_case(client: TestClient) -> None:
    """A second "Work" is a conflict."""
    create_tag(client, "work")

    response = client.post("/api/tags", json={"name": "Work"})

    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


def test_names_are_single_words(client: TestClient) -> None:
    """Spaces, # and @ would break quick-add parsing."""
    for bad in ["two words", "#hash", "a@b", "   "]:
        response = client.post("/api/tags", json={"name": bad})
        assert response.status_code == 422, bad
        assert response.json()["code"] == "validation_failed"


def test_create_is_idempotent_per_client_id(client: TestClient) -> None:
    """Retrying a create returns the same tag with 200."""
    tag_id = new_id()
    first = client.post("/api/tags", json={"id": tag_id, "name": "focus"})
    again = client.post("/api/tags", json={"id": tag_id, "name": "focus"})

    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["id"] == tag_id


def test_delete_detaches_and_restore_reattaches(client: TestClient) -> None:
    """Deleting a tag removes it from todos; restoring brings it back there too."""
    tag = create_tag(client, "urgent")
    todo = client.post("/api/todos/items", json={"title": "Pay rent", "tag_ids": [tag["id"]]})
    todo_id = todo.json()["id"]

    client.delete(f"/api/tags/{tag['id']}")
    after_delete = client.get(f"/api/todos/items?completed_since={SINCE}").json()
    restored = client.post(f"/api/tags/{tag['id']}/restore")
    after_restore = client.get(f"/api/todos/items?completed_since={SINCE}").json()

    assert next(t for t in after_delete if t["id"] == todo_id)["tag_ids"] == []
    assert restored.status_code == 200
    assert next(t for t in after_restore if t["id"] == todo_id)["tag_ids"] == [tag["id"]]


def test_restore_refuses_a_taken_name(client: TestClient) -> None:
    """If the name was reused meanwhile, restoring would create a duplicate."""
    old = create_tag(client, "later")
    client.delete(f"/api/tags/{old['id']}")
    create_tag(client, "later")

    assert client.post(f"/api/tags/{old['id']}/restore").status_code == 409


def test_unknown_tag_is_not_found(client: TestClient) -> None:
    """Renaming a tag that does not exist is a 404 problem."""
    response = client.patch(f"/api/tags/{new_id()}", json={"name": "x"})

    assert response.status_code == 404


SINCE = "2026-10-08T00:00:00Z"
