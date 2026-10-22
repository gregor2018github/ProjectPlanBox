"""Knowledge API: collections, pages and their content, images, tags and cascading deletes."""

import base64
import json
import sqlite3
from datetime import timedelta
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from planbox.config import Settings
from planbox.core.clock import FixedClock
from planbox.core.ids import new_id
from planbox.modules.knowledge.content import check_content, page_text

type Json = dict[str, Any]


def ok(response: Any, status: int = 200) -> Any:  # noqa: ANN401 - JSON is untyped
    """Asserts the status and returns the JSON body."""
    assert response.status_code == status, response.text
    return response.json()


def collection(client: TestClient, name: str = "Recipes") -> Json:
    """Creates a collection."""
    return ok(client.post("/api/knowledge/collections", json={"name": name}), 201)


def paragraph(text: str) -> Json:
    """A paragraph node holding plain text."""
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def box(*nodes: Json, x: int = 0, y: int = 0, box_id: str = "b1") -> Json:
    """A box at x/y holding these nodes."""
    doc = {"type": "doc", "content": list(nodes)}
    return {"id": box_id, "x": x, "y": y, "width": 400, "doc": doc}


def entry(client: TestClient, title: str = "Idea", **fields: Any) -> Json:  # noqa: ANN401
    """Creates a page."""
    body = {"title": title, **fields}
    return ok(client.post("/api/knowledge/entries", json=body), 201)


def entries(client: TestClient) -> list[Json]:
    """All live entries."""
    return ok(client.get("/api/knowledge/entries"))


def problem(response: Any, status: int) -> str:  # noqa: ANN401 - JSON is untyped
    """Asserts a problem response and returns its code."""
    assert response.status_code == status, response.text
    return response.json()["code"]


def test_a_new_page_is_empty(client: TestClient) -> None:
    """A page made with only a title has no boxes and no text."""
    page = entry(client, "Idea")

    assert page["content"] == {"boxes": []}
    assert (page["body"], page["collection_id"]) == ("", None)
    assert [e["id"] for e in entries(client)] == [page["id"]]


def test_body_is_the_pages_plain_text(client: TestClient) -> None:
    """Each text block is a line, hard breaks too; empty boxes are skipped; tables read cells."""
    table = {
        "type": "table",
        "content": [
            {
                "type": "tableRow",
                "content": [
                    {"type": "tableHeader", "content": [paragraph("Name")]},
                    {"type": "tableCell", "content": [paragraph("Ada")]},
                ],
            }
        ],
    }
    first = box(
        {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Plan"}]},
        {
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "one", "marks": [{"type": "bold"}]},
                {"type": "hardBreak"},
                {"type": "text", "text": "two"},
            ],
        },
        {"type": "bulletList", "content": [{"type": "listItem", "content": [paragraph("item")]}]},
    )
    empty = box({"type": "paragraph"}, box_id="b2", x=500)
    third = box(table, {"type": "codeBlock", "attrs": {"language": "py"}}, box_id="b3", y=300)

    page = entry(client, content={"boxes": [first, empty, third]})

    assert page["body"] == "Plan\none\ntwo\nitem\nName\nAda\n"
    assert page["content"]["boxes"][1]["x"] == 500


def test_content_rules_are_enforced(client: TestClient) -> None:
    """Only the editor's nodes and marks; own images only; links never run script."""

    def post(*nodes: Json) -> str:
        content = {"boxes": [box(*nodes)]}
        response = client.post("/api/knowledge/entries", json={"title": "x", "content": content})
        assert response.status_code == 422, response.text
        return response.json()["code"]

    def link(href: str) -> Json:
        mark = {"type": "link", "attrs": {"href": href}}
        return {"type": "paragraph", "content": [{"type": "text", "text": "a", "marks": [mark]}]}

    image_url = f"/api/knowledge/images/{new_id()}.png"
    assert post({"type": "script"}) == "validation_failed"
    assert post({"type": "image", "attrs": {"src": "https://evil.example/x.png"}})
    assert post({"type": "image", "attrs": {"src": image_url + "?x"}})
    assert post(link("javascript:alert(1)"))
    assert post(link("data:text/html,hi"))
    assert post({"type": "paragraph", "content": [{"type": "text", "marks": [{"type": "x"}]}]})
    assert post({"type": "paragraph", "content": [{"type": "text"}]})

    def create(content: Json) -> Any:  # noqa: ANN401 - a response
        return client.post("/api/knowledge/entries", json={"title": "x", "content": content})

    assert problem(create({"boxes": [box(), box()]}), 422) == "validation_failed"
    not_doc = {"boxes": [{**box(), "doc": {"type": "paragraph"}}]}
    assert problem(create(not_doc), 422) == "validation_failed"
    assert problem(create({"boxes": [{**box(), "width": 10}]}), 422) == "invalid_request"

    fine = box(
        {"type": "image", "attrs": {"src": image_url, "alt": None}},
        link("https://example.com/a"),
        link("mailto:me@example.com"),
    )
    entry(client, content={"boxes": [fine]})


def test_create_is_idempotent_per_client_id(client: TestClient) -> None:
    """Retrying a create returns the same entry with 200."""
    entry_id = new_id()
    body = {"id": entry_id, "title": "Once"}
    first = client.post("/api/knowledge/entries", json=body)
    again = client.post("/api/knowledge/entries", json=body)

    assert (first.status_code, again.status_code) == (201, 200)
    assert len(entries(client)) == 1


def test_patch_changes_only_present_fields(client: TestClient, clock: FixedClock) -> None:
    """Absent fields stay; content replaces the boxes and its text; tags are set as a whole."""
    tag = ok(client.post("/api/tags", json={"name": "py"}), 201)
    page = entry(client, "Loop", content={"boxes": [box(paragraph("old"))]})
    clock.advance(timedelta(minutes=1))
    url = f"/api/knowledge/entries/{page['id']}"

    retitled = ok(client.patch(url, json={"title": "Better loop", "tag_ids": [tag["id"]]}))
    moved = box(paragraph("new"), x=120, y=40)
    patched = ok(client.patch(url, json={"content": {"boxes": [moved]}}))

    assert (retitled["title"], retitled["body"]) == ("Better loop", "old")
    assert retitled["tag_ids"] == [tag["id"]]
    assert retitled["updated_at"] > page["updated_at"]
    assert (patched["title"], patched["body"]) == ("Better loop", "new")
    assert patched["content"]["boxes"][0]["x"] == 120
    assert problem(client.patch(url, json={"content": None}), 422) == "validation_failed"


def test_images_are_saved_and_served(client: TestClient, settings: Settings) -> None:
    """An upload is checked, stored under the data folder and served with its type."""
    png = b"\x89PNG\r\n\x1a\n" + b"rest of the file"
    data = base64.b64encode(png).decode()

    saved = ok(client.post("/api/knowledge/images", json={"data": data, "type": "image/png"}), 201)

    name = saved["url"].removeprefix("/api/knowledge/images/")
    assert (settings.data_dir / "images" / name).read_bytes() == png
    served = client.get(saved["url"])
    assert served.status_code == 200
    assert served.content == png
    assert served.headers["content-type"] == "image/png"
    assert served.headers["x-content-type-options"] == "nosniff"
    entry(client, content={"boxes": [box({"type": "image", "attrs": {"src": saved["url"]}})]})


def test_image_uploads_are_checked(client: TestClient) -> None:
    """The bytes must be base64 and the claimed type; unknown names are 404."""

    def upload(data: str, media_type: str = "image/png") -> Any:  # noqa: ANN401 - a response
        return client.post("/api/knowledge/images", json={"data": data, "type": media_type})

    svg = base64.b64encode(b"<svg onload='x'/>").decode()
    assert problem(upload(svg), 422) == "validation_failed"
    assert problem(upload("not base64!"), 422) == "validation_failed"
    assert problem(upload(""), 422) == "validation_failed"
    assert problem(upload(svg, "image/svg+xml"), 422) == "invalid_request"
    jpeg = base64.b64encode(b"\xff\xd8\xff\xe0 jpeg").decode()
    assert problem(upload(jpeg, "image/gif"), 422) == "validation_failed"
    assert ok(upload(jpeg, "image/jpeg"), 201)["url"].endswith(".jpg")
    assert problem(client.get(f"/api/knowledge/images/{new_id()}.png"), 404) == "not_found"
    assert problem(client.get("/api/knowledge/images/..%2Fplanbox.db"), 404) == "not_found"


def test_migration_turns_old_entries_into_pages() -> None:
    """Notes become paragraphs per line, links a link plus description, snippets a code block."""
    folder = Path(__file__).parents[1] / "planbox" / "modules" / "knowledge" / "migrations"
    conn = sqlite3.connect(":memory:")
    conn.executescript((folder / "0001_create_knowledge.sql").read_text(encoding="utf-8"))
    rows = [
        ("n", "note", "a\r\n\nb", None, None),
        ("e", "note", "", None, None),
        ("l", "link", "about", "https://x.y", None),
        ("s", "snippet", "x = 1\n", None, "python"),
    ]
    for row_id, kind, body, url, language in rows:
        conn.execute(
            "INSERT INTO knowledge_entries (id, kind, title, body, url, language, created_at, "
            "updated_at) VALUES (?, ?, 'T', ?, ?, ?, 't0', 't1')",
            (row_id, kind, body, url, language),
        )
    conn.executescript((folder / "0002_entries_become_pages.sql").read_text(encoding="utf-8"))

    pages = {
        str(r[0]): (json.loads(r[1]), str(r[2]), str(r[3]))
        for r in conn.execute("SELECT id, content, body, updated_at FROM knowledge_entries")
    }
    conn.close()

    def doc(row_id: str) -> list[Json]:
        first = pages[row_id][0]["boxes"][0]
        assert (first["id"], first["x"], first["y"], first["width"]) == (row_id, 0, 0, 640)
        return first["doc"]["content"]

    link_mark = {"type": "link", "attrs": {"href": "https://x.y"}}
    link_text = {"type": "text", "text": "https://x.y", "marks": [link_mark]}
    code = {"type": "codeBlock", "attrs": {"language": "python"}}
    assert doc("n") == [paragraph("a"), {"type": "paragraph"}, paragraph("b")]
    assert doc("e") == [{"type": "paragraph"}]
    assert doc("l") == [{"type": "paragraph", "content": [link_text]}, paragraph("about")]
    assert doc("s") == [{**code, "content": [{"type": "text", "text": "x = 1\n"}]}]
    assert {row_id: page[1] for row_id, page in pages.items()} == {
        "n": "a\n\nb",
        "e": "",
        "l": "https://x.y\nabout",
        "s": "x = 1\n",
    }
    for content, body, updated_at in pages.values():
        assert body == page_text(content)
        assert updated_at == "t1"
        check_content(content)


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
