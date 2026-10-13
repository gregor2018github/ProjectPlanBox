"""Data safety: backup files, the schedule, off-site copies, export and merge-import."""

import time
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from planbox.config import Settings, load_settings
from planbox.core.clock import FixedClock
from planbox.core.data.backups import BackupService, BackupState
from planbox.core.data.scheduler import run_scheduled_backups
from planbox.core.db import connect
from planbox.core.db.backup import backup_name, copy_backup, list_backups, prune_backups
from planbox.main import create_app, run_migrations
from planbox.modules import ENABLED_MODULES

type Json = dict[str, Any]


def ok(response: Any, status: int = 200) -> Any:  # noqa: ANN401 - JSON is untyped
    """Asserts the status and returns the JSON body."""
    assert response.status_code == status, response.text
    return response.json()


def touch_backup(folder: Path, label: str, stamp: str) -> Path:
    """Writes a stand-in backup file."""
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / backup_name(label, stamp)
    path.write_bytes(b"db")
    return path


# --- backup files -------------------------------------------------------------


def test_backup_files_are_listed_newest_first_and_pruned_per_label(tmp_path: Path) -> None:
    """Only backup names count; pruning keeps the newest per label."""
    touch_backup(tmp_path, "daily", "2026-10-06T08:00:00.000Z")
    touch_backup(tmp_path, "daily", "2026-10-07T08:00:00.000Z")
    touch_backup(tmp_path, "weekly", "2026-10-05T08:00:00.000Z")
    (tmp_path / "notes.txt").write_text("not a backup")

    found = list_backups(tmp_path)
    assert [(b.label, b.taken_at.day) for b in found] == [
        ("daily", 7),
        ("daily", 6),
        ("weekly", 5),
    ]
    assert found[0].taken_at == datetime(2026, 10, 7, 8, tzinfo=UTC)

    prune_backups(tmp_path, "daily", 1)
    assert [(b.label, b.taken_at.day) for b in list_backups(tmp_path)] == [
        ("daily", 7),
        ("weekly", 5),
    ]
    assert list_backups(tmp_path / "missing") == []


def test_copies_leave_no_partial_file(tmp_path: Path) -> None:
    """A finished copy has the backup's name and nothing else is left."""
    source = touch_backup(tmp_path / "a", "manual", "2026-10-07T08:00:00.000Z")
    (tmp_path / "b").mkdir()
    copy = copy_backup(source, tmp_path / "b")
    assert copy.read_bytes() == b"db"
    assert [p.name for p in (tmp_path / "b").iterdir()] == [source.name]


# --- settings -----------------------------------------------------------------


def test_offsite_folder_comes_from_the_file_only_for_the_real_database(tmp_path: Path) -> None:
    """settings.toml's off-site folder is for the real database; the env always wins."""
    file = tmp_path / "settings.toml"
    file.write_text('offsite_backup_dir = "E:/PlanBox"\n', encoding="utf-8")

    serve = load_settings("serve", env={}, settings_file=file)
    assert serve.offsite_backup_dir == Path("E:/PlanBox")
    assert serve.scheduled_backups

    dev = load_settings("dev", env={}, settings_file=file)
    assert dev.offsite_backup_dir is None
    assert not dev.scheduled_backups

    scratch = {"PLANBOX_DATA_DIR": str(tmp_path / "scratch")}
    assert load_settings("serve", env=scratch, settings_file=file).offsite_backup_dir is None

    env = {"PLANBOX_OFFSITE_BACKUP_DIR": str(tmp_path / "x")}
    assert load_settings("dev", env=env, settings_file=file).offsite_backup_dir == tmp_path / "x"
    cleared = load_settings("serve", env={"PLANBOX_OFFSITE_BACKUP_DIR": ""}, settings_file=file)
    assert cleared.offsite_backup_dir is None


# --- schedule and off-site ----------------------------------------------------


@pytest.fixture
def offsite_settings(tmp_path: Path) -> Settings:
    """Settings with an off-site folder whose parent exists."""
    (tmp_path / "usb").mkdir()
    return Settings(
        mode="test", data_dir=tmp_path / "data", offsite_backup_dir=tmp_path / "usb" / "PlanBox"
    )


@pytest.fixture
def migrated(offsite_settings: Settings, clock: FixedClock) -> None:
    """Creates and migrates the database."""
    run_migrations(offsite_settings, ENABLED_MODULES, clock)


def labels(folder: Path) -> list[str]:
    """Labels of the backups in a folder, newest first."""
    return [b.label for b in list_backups(folder)]


@pytest.mark.usefixtures("migrated")
def test_schedule_takes_one_daily_per_local_day_and_one_weekly_per_week(
    offsite_settings: Settings, clock: FixedClock
) -> None:
    """Days are local (Amsterdam) days; weeks start on Monday."""
    state = BackupState()
    # Thursday 2026-10-08, 14:00 in Amsterdam.
    assert run_scheduled_backups(offsite_settings, clock, state) == ["daily", "weekly"]
    clock.advance(timedelta(hours=9))  # 23:00 local, still Thursday
    assert run_scheduled_backups(offsite_settings, clock, state) == []
    clock.advance(timedelta(hours=1, minutes=30))  # 00:30 Friday local, still Thursday in UTC
    assert run_scheduled_backups(offsite_settings, clock, state) == ["daily"]
    clock.advance(timedelta(days=3))  # Monday: a new week
    assert run_scheduled_backups(offsite_settings, clock, state) == ["daily", "weekly"]

    assert labels(offsite_settings.backups_dir).count("daily") == 3
    assert labels(offsite_settings.backups_dir).count("weekly") == 2


@pytest.mark.usefixtures("migrated")
def test_backups_are_copied_off_site_and_pruned_there(
    offsite_settings: Settings, clock: FixedClock
) -> None:
    """The off-site folder mirrors the local backups and keeps as many."""
    state = BackupState()
    for _ in range(16):
        run_scheduled_backups(offsite_settings, clock, state)
        clock.advance(timedelta(days=1))

    offsite = offsite_settings.offsite_backup_dir
    assert offsite is not None
    local = [b.path.name for b in list_backups(offsite_settings.backups_dir)]
    there = [b.path.name for b in list_backups(offsite)]
    assert local == there
    assert labels(offsite).count("daily") == 14
    assert state.offsite_error is None


@pytest.mark.usefixtures("migrated")
def test_an_unreachable_offsite_folder_is_reported_and_caught_up_later(
    offsite_settings: Settings, clock: FixedClock, tmp_path: Path
) -> None:
    """A missing drive is an error in the status, never a failed backup."""
    unplugged = Settings(
        mode="test",
        data_dir=offsite_settings.data_dir,
        offsite_backup_dir=tmp_path / "missing-drive" / "PlanBox",
    )
    state = BackupState()
    assert run_scheduled_backups(unplugged, clock, state) == ["daily", "weekly"]
    assert state.offsite_error is not None
    conn = connect(unplugged.db_path)
    try:
        status = BackupService(conn, unplugged, clock, state).offsite()
    finally:
        conn.close()
    assert status is not None
    assert not status.reachable
    assert status.error == state.offsite_error

    # Plugged back in: the next pass copies what was missed.
    clock.advance(timedelta(hours=1))
    assert run_scheduled_backups(offsite_settings, clock, state) == []
    assert state.offsite_error is None
    assert offsite_settings.offsite_backup_dir is not None
    assert labels(offsite_settings.offsite_backup_dir) == ["weekly", "daily"]


@pytest.mark.usefixtures("migrated")
def test_offsite_copies_survive_losing_the_local_backups(
    offsite_settings: Settings, clock: FixedClock
) -> None:
    """Off-site files are never deleted because they are gone locally."""
    state = BackupState()
    run_scheduled_backups(offsite_settings, clock, state)
    for backup in list_backups(offsite_settings.backups_dir):
        backup.path.unlink()
    clock.advance(timedelta(days=1))
    run_scheduled_backups(offsite_settings, clock, state)

    assert offsite_settings.offsite_backup_dir is not None
    assert labels(offsite_settings.offsite_backup_dir) == ["weekly", "daily", "weekly", "daily"]


def test_the_daily_server_backs_up_on_start(tmp_path: Path, clock: FixedClock) -> None:
    """The lifespan starts the schedule, which runs once right away."""
    settings = Settings(mode="test", data_dir=tmp_path / "data", scheduled_backups=True)
    with TestClient(create_app(settings, clock=clock)):
        deadline = time.monotonic() + 10
        while len(list_backups(settings.backups_dir)) < 2 and time.monotonic() < deadline:
            time.sleep(0.05)
    assert labels(settings.backups_dir) == ["weekly", "daily"]


# --- backups API --------------------------------------------------------------


def test_backups_api_lists_and_takes_manual_backups(client: TestClient) -> None:
    """The button takes a manual backup that the list shows."""
    empty = ok(client.get("/api/data/backups"))
    assert empty == {"backups": [], "offsite": None, "scheduled": False}

    made = ok(client.post("/api/data/backups", json={"confirm": True}), 201)
    assert made["label"] == "manual"
    assert made["taken_at"] == "2026-10-08T12:00:00.000Z"
    assert made["size"] > 0
    assert ok(client.get("/api/data/backups"))["backups"] == [made]


def test_manual_backup_needs_a_json_body(client: TestClient) -> None:
    """A cross-site form post cannot trigger a backup."""
    response = client.post(
        "/api/data/backups", content='{"confirm": true}', headers={"Content-Type": "text/plain"}
    )
    assert response.status_code == 422


def test_backups_api_reports_the_offsite_folder(
    offsite_settings: Settings, clock: FixedClock
) -> None:
    """The status names the folder and its newest backup."""
    with TestClient(create_app(offsite_settings, clock=clock)) as client:
        ok(client.post("/api/data/backups", json={"confirm": True}), 201)
        offsite = ok(client.get("/api/data/backups"))["offsite"]
    assert offsite == {
        "path": str(offsite_settings.offsite_backup_dir),
        "reachable": True,
        "latest_at": "2026-10-08T12:00:00.000Z",
        "error": None,
    }


# --- export and import --------------------------------------------------------


@pytest.fixture
def other_clock() -> FixedClock:
    """The second PC's clock, an hour ahead of the first one's."""
    return FixedClock(datetime(2026, 10, 8, 13, 0, tzinfo=UTC))


@pytest.fixture
def other(tmp_path: Path, other_clock: FixedClock) -> Iterator[TestClient]:
    """A second PlanBox with its own database: the other PC."""
    settings = Settings(mode="test", data_dir=tmp_path / "other", port=0)
    with TestClient(create_app(settings, clock=other_clock)) as test_client:
        yield test_client


def export(client: TestClient) -> Json:
    """Downloads an export."""
    return ok(client.get("/api/data/export"))


def import_into(client: TestClient, data: Json, status: int = 200) -> Any:  # noqa: ANN401
    """Imports an export."""
    return ok(client.post("/api/data/import", json=data), status)


def totals(report: Json) -> dict[str, int]:
    """Sums the per-table counts of an import report."""
    keys = ("inserted", "updated", "unchanged", "conflicts")
    return {k: sum(t[k] for t in report["tables"]) for k in keys}


def titles(client: TestClient) -> list[str]:
    """Titles of the open todos."""
    items = ok(client.get("/api/todos/items", params={"completed_since": "2026-10-08T00:00:00Z"}))
    return sorted(t["title"] for t in items)


def test_export_holds_every_synced_table_and_tombstones(client: TestClient) -> None:
    """Derived tables stay out; deleted rows go along as tombstones."""
    kept = ok(client.post("/api/todos/items", json={"title": "Keep"}), 201)
    gone = ok(client.post("/api/todos/items", json={"title": "Gone"}), 201)
    ok(client.delete(f"/api/todos/items/{gone['id']}"))

    response = client.get("/api/data/export")
    assert response.headers["content-disposition"] == (
        'attachment; filename="planbox-export-20261008T120000000Z.json"'
    )
    data = response.json()
    assert data["format"] == "planbox-export"
    assert {"todos", "core_tags", "habits", "calendar_events"} <= set(data["tables"])
    assert not {"schema_migrations", "core_search_sync", "core_search"} & set(data["tables"])
    todos = data["tables"]["todos"]
    rows = {r[todos["columns"].index("id")]: r for r in todos["rows"]}
    assert set(rows) == {kept["id"], gone["id"]}
    assert rows[gone["id"]][todos["columns"].index("deleted_at")] is not None


def test_import_brings_the_other_pcs_rows_and_indexes_them(
    client: TestClient, other: TestClient
) -> None:
    """Imported rows show up, in search too, though older than the index watermark."""
    ok(other.post("/api/todos/items", json={"title": "Written at home"}), 201)
    ok(client.post("/api/todos/items", json={"title": "Written at work"}), 201)
    ok(client.get("/api/search", params={"q": "work"}))  # moves the index watermark

    report = import_into(client, export(other))
    assert report["backup"].endswith("-pre-import.db")
    assert totals(report)["inserted"] >= 1
    assert titles(client) == ["Written at home", "Written at work"]
    hits = ok(client.get("/api/search", params={"q": "home"}))
    assert [h["title"] for h in hits] != []


def test_newer_versions_win_and_deletes_travel_both_ways(
    client: TestClient, other: TestClient, clock: FixedClock, other_clock: FixedClock
) -> None:
    """Exporting and importing both ways leaves both PCs equal."""
    a = ok(client.post("/api/todos/items", json={"title": "Plan trip"}), 201)
    b = ok(client.post("/api/todos/items", json={"title": "Call bank"}), 201)
    import_into(other, export(client))

    # Home renames one todo later; work deletes the other.
    other_clock.advance(timedelta(minutes=5))
    ok(other.patch(f"/api/todos/items/{a['id']}", json={"title": "Plan the trip"}))
    clock.advance(timedelta(hours=2))
    ok(client.delete(f"/api/todos/items/{b['id']}"))

    import_into(client, export(other))
    import_into(other, export(client))
    assert titles(client) == titles(other) == ["Plan the trip"]

    # Nothing left to do: both directions now change nothing.
    for target, source in ((client, other), (other, client)):
        counts = totals(import_into(target, export(source)))
        assert counts["inserted"] == counts["updated"] == counts["conflicts"] == 0


def test_an_older_version_does_not_overwrite_a_newer_one(
    client: TestClient, other: TestClient, clock: FixedClock
) -> None:
    """Importing a stale export keeps the newer local row."""
    item = ok(client.post("/api/todos/items", json={"title": "Draft"}), 201)
    stale = export(client)
    clock.advance(timedelta(minutes=1))
    ok(client.patch(f"/api/todos/items/{item['id']}", json={"title": "Final"}))

    counts = totals(import_into(client, stale))
    assert counts["updated"] == 0
    assert titles(client) == ["Final"]
    assert other is not None


def test_duplicates_made_on_both_pcs_keep_one_live_row(
    client: TestClient, other: TestClient
) -> None:
    """The same tag made on both PCs ends up as one live tag on both."""
    ok(client.post("/api/tags", json={"name": "errands"}), 201)
    ok(other.post("/api/tags", json={"name": "Errands"}), 201)

    report = import_into(client, export(other))
    assert totals(report)["conflicts"] == 1
    import_into(other, export(client))

    names = [t["name"] for t in ok(client.get("/api/tags"))]
    assert names == [t["name"] for t in ok(other.get("/api/tags"))] == ["errands"]


def test_an_export_from_another_schema_version_is_refused(
    client: TestClient, other: TestClient
) -> None:
    """Different migrations mean different tables: refuse before any backup."""
    data = export(other)
    data["migrations"] = data["migrations"][:-1]
    problem = import_into(client, data, 409)
    assert "same version" in problem["detail"]
    assert ok(client.get("/api/data/backups"))["backups"] == []


def test_unknown_tables_and_dangling_rows_change_nothing(
    client: TestClient, other: TestClient
) -> None:
    """Unknown table names never reach SQL; missing parents roll back the merge."""
    unknown = export(other)
    unknown["tables"]["evil; DROP TABLE todos"] = {"columns": ["id"], "rows": []}
    import_into(client, unknown, 422)

    lst = ok(other.post("/api/todos/lists", json={"name": "Home"}), 201)
    ok(other.post("/api/todos/items", json={"title": "In a list", "list_id": lst["id"]}), 201)
    dangling = export(other)
    dangling["tables"]["todos_lists"]["rows"] = []
    problem = import_into(client, dangling, 422)
    assert "point at rows" in problem["detail"]
    assert titles(client) == []


def test_values_the_tables_reject_change_nothing(client: TestClient, other: TestClient) -> None:
    """A value of the wrong type is refused even where SQLite would convert it."""
    ok(other.post("/api/todos/items", json={"title": "Fine"}), 201)
    data = export(other)
    todos = data["tables"]["todos"]
    todos["rows"][0][todos["columns"].index("created_at")] = 12
    import_into(client, data, 422)
    assert titles(client) == []
