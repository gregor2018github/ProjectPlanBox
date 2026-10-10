"""Knowledge API: collections, the three entry kinds, tags and cascading deletes."""

from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient

from planbox.core.clock import FixedClock
from planbox.core.ids import new_id

type Json = dict[str, Any]


def ok(response: Any, status: int = 200) -> Any:  # noqa: ANN401 - JSON is untyped
    """Asserts the status and returns the JSON body."""
    assert response.status_code == status, response.text
    return response.json()


def collection(client: TestClient, name: str = "Recipes") -> Json:
    """Creates a collection."""
    return ok(client.post("/api/knowledge/collections", json={"name": name}), 201)


def entry(client: TestClient, kind: str = "note", title: str = "Idea", **fields: Any) -> Json:  # noqa: ANN401
    """Creates an entry."""
    body = {"kind": kind, "title": title, **fields}
    return ok(client.post("/api/knowledge/entries", json=body), 201)


def entries(client: TestClient) -> list[Json]:
    """All live entries."""
    return ok(client.get("/api/knowledge/entries"))


def problem(response: Any, status: int) -> str:  # noqa: ANN401 - JSON is untyped
    """Asserts a problem response and returns its code."""
    assert response.status_code == status, response.text
    return response.json()["code"]


def test_create_each_kind(client: TestClient) -> None:
    """Notes, links and snippets carry their own fields."""
    note = entry(client, "note", "Idea", body="line one\n  line two")
    link = entry(client, "link", "Docs", url="  https://example.com/a  ")
    snippet = entry(client, "snippet", "Loop", body="for x in y:\n    pass", language="python")

    assert note["body"] == "line one\n  line two"
    assert (note["url"], note["language"], note["collection_id"]) == (None, None, None)
    assert link["url"] == "https://example.com/a"
    assert snippet["language"] == "python"
    assert {e["id"] for e in entries(client)} == {note["id"], link["id"], snippet["id"]}


def test_kind_rules_are_enforced(client: TestClient) -> None:
    """Links need an http(s) URL; only links have URLs and only snippets a language."""

    def post(body: Json) -> Any:  # noqa: ANN401 - a response
        return client.post("/api/knowledge/entries", json=body)

    assert problem(post({"kind": "link", "title": "x"}), 422) == "validation_failed"
    assert problem(post({"kind": "link", "title": "x", "url": "javascript:alert(1)"}), 422)
    assert problem(post({"kind": "link", "title": "x", "url": "example.com"}), 422)
    assert problem(post({"kind": "note", "title": "x", "url": "https://a.b"}), 422)
    assert problem(post({"kind": "note", "title": "x", "language": "py"}), 422)
    assert problem(post({"kind": "page", "title": "x"}), 422) == "invalid_request"
    assert problem(post({"kind": "note", "title": "   "}), 422)


def test_create_is_idempotent_per_client_id(client: TestClient) -> None:
    """Retrying a create returns the same entry with 200."""
    entry_id = new_id()
    body = {"id": entry_id, "kind": "note", "title": "Once"}
    first = client.post("/api/knowledge/entries", json=body)
    again = client.post("/api/knowledge/entries", json=body)

    assert (first.status_code, again.status_code) == (201, 200)
    assert len(entries(client)) == 1


def test_patch_changes_only_present_fields(client: TestClient, clock: FixedClock) -> None:
    """Absent fields stay; null clears the language; tags are set as a whole."""
    tag = ok(client.post("/api/tags", json={"name": "py"}), 201)
    snippet = entry(client, "snippet", "Loop", body="code", language="python")
    clock.advance(timedelta(minutes=1))

    patched = ok(
        client.patch(
            f"/api/knowledge/entries/{snippet['id']}",
            json={"title": "Better loop", "language": None, "tag_ids": [tag["id"]]},
        )
    )

    assert (patched["title"], patched["body"], patched["language"]) == ("Better loop", "code", None)
    assert patched["tag_ids"] == [tag["id"]]
    assert patched["updated_at"] > snippet["updated_at"]


def test_patch_respects_kind(client: TestClient) -> None:
    """A note cannot get a URL; a link cannot lose it."""
    note = entry(client)
    link = entry(client, "link", "Docs", url="https://example.com")

    assert problem(
        client.patch(f"/api/knowledge/entries/{note['id']}", json={"url": "https://a.b"}), 422
    )
    assert problem(client.patch(f"/api/knowledge/entries/{link['id']}", json={"url": None}), 422)


def test_entries_move_between_collections(client: TestClient) -> None:
    """collection_id is patchable; unknown collections are refused."""
    recipes = collection(client)
    note = entry(client, collection_id=recipes["id"])

    moved = ok(client.patch(f"/api/knowledge/entries/{note['id']}", json={"collection_id": None}))

    assert moved["collection_id"] is None
    bad = client.patch(f"/api/knowledge/entries/{note['id']}", json={"collection_id": new_id()})
    assert problem(bad, 422) == "validation_failed"


def test_collections_are_ordered_and_movable(client: TestClient) -> None:
    """New collections go last; move places one between neighbours."""
    a, b, c = (collection(client, name) for name in "ABC")

    ok(client.post(f"/api/knowledge/collections/{c['id']}/move", json={"before_id": a["id"]}))

    names = [x["name"] for x in ok(client.get("/api/knowledge/collections"))]
    assert names == ["C", "A", "B"]
    renamed = ok(client.patch(f"/api/knowledge/collections/{b['id']}", json={"name": " Bee "}))
    assert renamed["name"] == "Bee"


def test_collection_delete_cascades_and_restores_exactly(
    client: TestClient, clock: FixedClock
) -> None:
    """Entries deleted earlier stay deleted when their collection comes back."""
    recipes = collection(client)
    kept = entry(client, title="Soup", collection_id=recipes["id"])
    gone = entry(client, title="Old", collection_id=recipes["id"])
    ok(client.delete(f"/api/knowledge/entries/{gone['id']}"))
    clock.advance(timedelta(seconds=1))

    deleted = ok(client.delete(f"/api/knowledge/collections/{recipes['id']}"))
    assert (deleted["collections"], deleted["entries"]) == (1, 1)
    assert entries(client) == []

    restored = ok(client.post(f"/api/knowledge/collections/{recipes['id']}/restore"))
    assert restored["entries"] == 1
    assert [e["id"] for e in entries(client)] == [kept["id"]]


def test_entry_restore_needs_its_collection(client: TestClient) -> None:
    """An entry whose collection is gone cannot come back on its own."""
    recipes = collection(client)
    note = entry(client, collection_id=recipes["id"])
    ok(client.delete(f"/api/knowledge/entries/{note['id']}"))
    ok(client.delete(f"/api/knowledge/collections/{recipes['id']}"))

    assert problem(client.post(f"/api/knowledge/entries/{note['id']}/restore"), 409) == "conflict"
    assert problem(client.delete(f"/api/knowledge/entries/{note['id']}"), 404) == "not_found"


def test_deleted_entry_restores(client: TestClient) -> None:
    """Delete then restore brings the entry back with its tags."""
    tag = ok(client.post("/api/tags", json={"name": "keep"}), 201)
    note = entry(client, tag_ids=[tag["id"]])
    ok(client.delete(f"/api/knowledge/entries/{note['id']}"))
    assert entries(client) == []

    restored = ok(client.post(f"/api/knowledge/entries/{note['id']}/restore"))

    assert restored["tag_ids"] == [tag["id"]]
