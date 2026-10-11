"""Area colours: default hues, changing a hue, and the migration that backfills them."""

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient
from todos_helpers import area, ok

from planbox.modules.todos.service import AREA_HUES, default_area_hue

_MIGRATIONS = Path(__file__).parents[1] / "planbox" / "modules" / "todos" / "migrations"


def test_new_areas_get_distinct_default_hues(client: TestClient) -> None:
    """Each new area takes the next default hue that no live area uses."""
    work = area(client, "Work")
    home = area(client, "Home")
    ok(client.delete(f"/api/todos/areas/{work['id']}"))
    garden = area(client, "Garden")

    assert (work["hue"], home["hue"]) == AREA_HUES[:2]
    assert garden["hue"] == AREA_HUES[0]


def test_default_hue_cycles_once_every_default_is_taken() -> None:
    """With all defaults in use, the hue cycles by the number of areas."""
    assert default_area_hue([]) == AREA_HUES[0]
    assert default_area_hue([AREA_HUES[0], 7]) == AREA_HUES[1]
    assert default_area_hue(list(AREA_HUES)) == AREA_HUES[0]
    assert default_area_hue([*AREA_HUES, 1]) == AREA_HUES[1]


def test_an_explicit_hue_is_kept_and_can_change(client: TestClient) -> None:
    """A create may name its hue; a PATCH changes the hue and leaves the name."""
    work = ok(client.post("/api/todos/areas", json={"name": "Work", "hue": 12}), 201)
    url = f"/api/todos/areas/{work['id']}"

    recoloured = ok(client.patch(url, json={"hue": 300}))
    renamed = ok(client.patch(url, json={"name": "Job"}))

    assert work["hue"] == 12
    assert (recoloured["name"], recoloured["hue"]) == ("Work", 300)
    assert (renamed["name"], renamed["hue"]) == ("Job", 300)
    assert ok(client.get("/api/todos/areas"))[0]["hue"] == 300


def test_hues_outside_the_wheel_are_rejected(client: TestClient) -> None:
    """A hue is 0 to 359 degrees."""
    work = area(client)
    url = f"/api/todos/areas/{work['id']}"

    assert client.patch(url, json={"hue": 360}).status_code == 422
    assert client.patch(url, json={"hue": -1}).status_code == 422
    assert client.post("/api/todos/areas", json={"name": "X", "hue": 400}).status_code == 422


def test_migration_gives_existing_areas_defaults_in_sidebar_order(tmp_path: Path) -> None:
    """Live areas get the default hues by position; deleted ones keep the column default."""
    conn = sqlite3.connect(tmp_path / "areas.db")
    conn.executescript((_MIGRATIONS / "0001_create_todos.sql").read_text(encoding="utf-8"))
    rows = [("b", "a1", None), ("a", "a2", None), ("gone", "a0", "2026-10-01T00:00:00.000Z")]
    for area_id, position, deleted_at in rows:
        conn.execute(
            "INSERT INTO todos_areas VALUES (?, ?, ?, '', '', ?)",
            (area_id, area_id, position, deleted_at),
        )

    conn.executescript((_MIGRATIONS / "0005_add_area_hue.sql").read_text(encoding="utf-8"))

    hues = dict(conn.execute("SELECT id, hue FROM todos_areas").fetchall())
    conn.close()
    assert hues == {"b": AREA_HUES[0], "a": AREA_HUES[1], "gone": 264}
