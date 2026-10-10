"""Core links: todo <-> knowledge entry, both directions, validation, delete/restore."""

from typing import Any

from fastapi.testclient import TestClient

from planbox.core.ids import new_id

type Json = dict[str, Any]


def ok(response: Any, status: int = 200) -> Any:  # noqa: ANN401 - JSON is untyped
    """Asserts the status and returns the JSON body."""
    assert response.status_code == status, response.text
    return response.json()


def todo_ref(client: TestClient, title: str = "Write report") -> str:
    """Creates a todo and returns its entity reference."""
    todo = ok(client.post("/api/todos/items", json={"title": title}), 201)
    return f"todos.todo:{todo['id']}"


def note_ref(client: TestClient, title: str = "Report outline") -> str:
    """Creates a note and returns its entity reference."""
    body = {"kind": "note", "title": title}
    note = ok(client.post("/api/knowledge/entries", json=body), 201)
    return f"knowledge.entry:{note['id']}"


def link(client: TestClient, source: str, target: str) -> Json:
    """Links two entities and returns the link."""
    return ok(client.post("/api/links", json={"source": source, "target": target}), 201)


def links_of(client: TestClient, ref: str) -> list[Json]:
    """Live links of an entity."""
    return ok(client.get("/api/links", params={"entity": ref}))


def test_link_shows_from_both_ends_with_titles(client: TestClient) -> None:
    """A todo -> note link is listed for both, with summarised titles."""
    todo, note = todo_ref(client), note_ref(client)

    created = link(client, todo, note)

    assert created["source"] == {"ref": todo, "title": "Write report", "deleted": False}
    assert created["target"] == {"ref": note, "title": "Report outline", "deleted": False}
    assert [x["id"] for x in links_of(client, todo)] == [created["id"]]
    assert [x["id"] for x in links_of(client, note)] == [created["id"]]


def test_duplicates_in_either_direction_conflict(client: TestClient) -> None:
    """The same pair is linked once, whichever way round."""
    todo, note = todo_ref(client), note_ref(client)
    link(client, todo, note)

    again = client.post("/api/links", json={"source": note, "target": todo})

    assert again.status_code == 409


def test_invalid_ends_are_refused(client: TestClient) -> None:
    """Self links, unknown types, unknown ids and malformed refs are rejected."""
    todo = todo_ref(client)
    cases = [
        (todo, todo),
        (todo, f"nowhere.thing:{new_id()}"),
        (todo, f"knowledge.entry:{new_id()}"),
        (todo, "not a ref"),
    ]
    for source, target in cases:
        response = client.post("/api/links", json={"source": source, "target": target})
        assert response.status_code == 422, (source, target)


def test_create_is_idempotent_per_client_id(client: TestClient) -> None:
    """Retrying with the same id returns the link with 200."""
    todo, note = todo_ref(client), note_ref(client)
    body = {"id": new_id(), "source": todo, "target": note}

    first = client.post("/api/links", json=body)
    again = client.post("/api/links", json=body)

    assert (first.status_code, again.status_code) == (201, 200)


def test_deleted_entities_show_as_deleted(client: TestClient) -> None:
    """Deleting the note keeps the link, marked deleted, until it is restored."""
    todo, note = todo_ref(client), note_ref(client)
    link(client, todo, note)
    note_id = note.split(":")[1]

    ok(client.delete(f"/api/knowledge/entries/{note_id}"))
    assert links_of(client, todo)[0]["target"]["deleted"] is True

    ok(client.post(f"/api/knowledge/entries/{note_id}/restore"))
    assert links_of(client, todo)[0]["target"]["deleted"] is False


def test_delete_and_restore(client: TestClient) -> None:
    """Unlinking is undoable, unless the pair was linked again meanwhile."""
    todo, note = todo_ref(client), note_ref(client)
    first = link(client, todo, note)

    ok(client.delete(f"/api/links/{first['id']}"))
    assert links_of(client, todo) == []
    ok(client.post(f"/api/links/{first['id']}/restore"))
    assert len(links_of(client, note)) == 1

    ok(client.delete(f"/api/links/{first['id']}"))
    link(client, note, todo)
    assert client.post(f"/api/links/{first['id']}/restore").status_code == 409
    assert client.delete(f"/api/links/{new_id()}").status_code == 404
