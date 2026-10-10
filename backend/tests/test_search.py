"""Core search: the index follows every write path, ranks and marks matches."""

from datetime import timedelta
from typing import Any, cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from planbox.config import Settings
from planbox.core.clock import FixedClock
from planbox.core.db import connect
from planbox.core.entities import EntityRef, EntityRegistry
from planbox.core.search.repository import MATCH_END, MATCH_START, SearchRepository
from planbox.core.search.service import SearchService, index_rowid, match_expression

type Json = dict[str, Any]


def ok(response: Any, status: int = 200) -> Any:  # noqa: ANN401 - JSON is untyped
    """Asserts the status and returns the JSON body."""
    assert response.status_code == status, response.text
    return response.json()


def search(client: TestClient, q: str) -> list[Json]:
    """Runs a search."""
    return ok(client.get("/api/search", params={"q": q}))


def plain(text: str) -> str:
    """Drops the match marks."""
    return text.replace(MATCH_START, "").replace(MATCH_END, "")


def titles(client: TestClient, q: str) -> list[str]:
    """Plain titles of the hits, best first."""
    return [plain(h["title"]) for h in search(client, q)]


def todo(client: TestClient, title: str, **fields: Any) -> Json:  # noqa: ANN401
    """Creates a todo."""
    return ok(client.post("/api/todos/items", json={"title": title, **fields}), 201)


def entry(client: TestClient, title: str, kind: str = "note", **fields: Any) -> Json:  # noqa: ANN401
    """Creates a knowledge entry."""
    body = {"kind": kind, "title": title, **fields}
    return ok(client.post("/api/knowledge/entries", json=body), 201)


def test_finds_todos_and_entries_by_word_prefixes(client: TestClient) -> None:
    """Every word must match as a prefix, in title or text, across modules."""
    t = todo(client, "Write quarterly report", notes="Ask Anna for the numbers")
    e = entry(client, "Report outline", body="Intro, numbers, outlook")
    entry(client, "Holiday ideas")

    assert {h["ref"] for h in search(client, "rep")} == {
        f"todos.todo:{t['id']}",
        f"knowledge.entry:{e['id']}",
    }
    assert titles(client, "numb out") == ["Report outline"]
    assert titles(client, "anna") == ["Write quarterly report"]


def test_title_matches_rank_first_and_are_marked(client: TestClient) -> None:
    """A title match outranks a text match; matched terms are marked."""
    entry(client, "Shopping", body="Remember the budget spreadsheet")
    entry(client, "Budget 2027")

    hits = search(client, "budget")

    assert [plain(h["title"]) for h in hits] == ["Budget 2027", "Shopping"]
    assert hits[0]["title"] == f"{MATCH_START}Budget{MATCH_END} 2027"
    assert f"{MATCH_START}budget{MATCH_END}" in hits[1]["snippet"]


def test_hints_name_the_place_and_state(client: TestClient) -> None:
    """Todos show their list (and Done); entries their kind and collection."""
    work = ok(client.post("/api/todos/lists", json={"name": "Work"}), 201)
    done = todo(client, "Alpha done", list_id=work["id"])
    ok(client.post(f"/api/todos/items/{done['id']}/complete"))
    todo(client, "Alpha open")
    recipes = ok(client.post("/api/knowledge/collections", json={"name": "Recipes"}), 201)
    entry(client, "Alpha soup", kind="link", url="https://example.com", collection_id=recipes["id"])

    hints = {plain(h["title"]): h["hint"] for h in search(client, "alpha")}

    assert hints == {
        "Alpha done": "Done · Work",
        "Alpha open": "Inbox",
        "Alpha soup": "Link · Recipes",
    }


def test_edits_deletes_and_restores_show_up(client: TestClient, clock: FixedClock) -> None:
    """The index follows patches, soft deletes (also cascading) and restores."""
    t = todo(client, "Call plumber")
    assert titles(client, "plumber") == ["Call plumber"]

    clock.advance(timedelta(minutes=5))
    ok(client.patch(f"/api/todos/items/{t['id']}", json={"title": "Call electrician"}))
    assert titles(client, "plumber") == []
    assert titles(client, "electric") == ["Call electrician"]

    clock.advance(timedelta(minutes=5))
    ok(client.delete(f"/api/todos/items/{t['id']}"))
    assert titles(client, "electric") == []

    clock.advance(timedelta(minutes=5))
    ok(client.post(f"/api/todos/items/{t['id']}/restore"))
    assert titles(client, "electric") == ["Call electrician"]


def test_deleting_a_collection_removes_its_entries(client: TestClient, clock: FixedClock) -> None:
    """A cascading delete reaches the index too."""
    trips = ok(client.post("/api/knowledge/collections", json={"name": "Trips"}), 201)
    entry(client, "Lisbon packing list", collection_id=trips["id"])
    assert titles(client, "lisbon") == ["Lisbon packing list"]

    clock.advance(timedelta(hours=1))
    ok(client.delete(f"/api/knowledge/collections/{trips['id']}"))

    assert titles(client, "lisbon") == []


def test_late_commits_inside_the_overlap_are_indexed(client: TestClient, clock: FixedClock) -> None:
    """A write stamped slightly before the watermark is still picked up."""
    todo(client, "First")
    clock.advance(timedelta(minutes=10))
    todo(client, "Second")
    assert titles(client, "second") == ["Second"]  # watermark = Second's stamp

    clock.advance(timedelta(seconds=-30))  # a write that committed late
    todo(client, "Latecomer")

    assert titles(client, "latecomer") == ["Latecomer"]


def test_rebuild_refills_the_index(
    client: TestClient, app: FastAPI, settings: Settings, clock: FixedClock
) -> None:
    """Forgetting the watermarks rebuilds the index on the next search."""
    todo(client, "Rebuild me")
    clock.advance(timedelta(minutes=5))
    todo(client, "Later")
    assert titles(client, "rebuild") == ["Rebuild me"]
    conn = connect(settings.db_path)
    try:
        conn.execute("DELETE FROM core_search")
        assert titles(client, "rebuild") == []  # older than the watermark, so not re-read

        registry = cast("EntityRegistry", app.state.entity_registry)
        SearchService(conn, SearchRepository(conn), registry, clock).rebuild()
    finally:
        conn.close()

    assert titles(client, "rebuild") == ["Rebuild me"]


def test_queries_without_words_and_odd_input(client: TestClient) -> None:
    """Empty or punctuation-only queries return nothing; FTS syntax is inert."""
    todo(client, 'He said "hi" AND left')

    assert search(client, "") == []
    assert search(client, ' "*() ') == []
    assert titles(client, 'said" AND') == ['He said "hi" AND left']
    assert titles(client, "NEAR(said left)") == []


def test_diacritics_are_ignored(client: TestClient) -> None:
    """Café matches cafe and the other way round."""
    entry(client, "Café list")

    assert titles(client, "cafe") == ["Café list"]
    assert titles(client, "CAFÉ") == ["Café list"]


def test_match_expression_quotes_each_word() -> None:
    """Words become quoted prefix terms; the rest is dropped."""
    assert match_expression("Rep out") == '"rep"* "out"*'
    assert match_expression(' ") ') is None


def test_index_rowids_are_stable_and_positive() -> None:
    """The same ref always maps to the same positive 63-bit row id."""
    ref = EntityRef("todos.todo", "0199")
    assert index_rowid(ref) == index_rowid(EntityRef("todos.todo", "0199"))
    assert 0 <= index_rowid(ref) < 2**63
    assert index_rowid(ref) != index_rowid(EntityRef("knowledge.entry", "0199"))
