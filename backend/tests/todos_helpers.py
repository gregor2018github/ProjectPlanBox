"""Small API helpers shared by the todos tests."""

from typing import Any

from fastapi.testclient import TestClient

SINCE = "2026-10-08T00:00:00Z"
"""Start of "today" for the fixed test clock (2026-10-08 12:00 UTC)."""

type Json = dict[str, Any]


def ok(response: Any, status: int = 200) -> Any:  # noqa: ANN401 - JSON is untyped
    """Asserts the status and returns the JSON body."""
    assert response.status_code == status, response.text
    return response.json()


def area(client: TestClient, name: str = "Work") -> Json:
    """Creates an area."""
    return ok(client.post("/api/todos/areas", json={"name": name}), 201)


def todo_list(client: TestClient, name: str = "Project", area_id: str | None = None) -> Json:
    """Creates a list."""
    return ok(client.post("/api/todos/lists", json={"name": name, "area_id": area_id}), 201)


def section(client: TestClient, list_id: str, name: str = "Next") -> Json:
    """Creates a section."""
    return ok(client.post("/api/todos/sections", json={"list_id": list_id, "name": name}), 201)


def todo(client: TestClient, title: str = "Do it", **fields: Any) -> Json:  # noqa: ANN401
    """Creates a todo."""
    return ok(client.post("/api/todos/items", json={"title": title, **fields}), 201)


def current(client: TestClient) -> list[Json]:
    """Open todos plus today's completed ones."""
    return ok(client.get(f"/api/todos/items?completed_since={SINCE}"))


def by_id(items: list[Json]) -> dict[str, Json]:
    """Indexes todos by id."""
    return {t["id"]: t for t in items}


def titles_in_order(client: TestClient, **container: str | None) -> list[str]:
    """Titles of the live todos in one container, in display order."""
    rows = [t for t in current(client) if all(t[key] == value for key, value in container.items())]
    return [t["title"] for t in sorted(rows, key=lambda t: (t["position"], t["id"]))]


def move(client: TestClient, todo_id: str, **body: Any) -> Any:  # noqa: ANN401
    """Moves a todo; container fields default to the Inbox top level."""
    payload = {"list_id": None, "section_id": None, "parent_id": None, **body}
    return client.post(f"/api/todos/items/{todo_id}/move", json=payload)
