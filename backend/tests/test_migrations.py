"""The migration runner: ordering, bookkeeping, checksums, rollback, backups, directives."""

import sqlite3
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path

import pytest

from planbox.core.clock import FixedClock
from planbox.core.db import connect, init_database
from planbox.core.db.migrations import (
    MigrationError,
    MigrationSource,
    applied_versions,
    discover,
    migrate,
    pending,
)


@pytest.fixture
def conn(tmp_path: Path) -> Iterator[sqlite3.Connection]:
    """A fresh WAL database."""
    path = tmp_path / "db" / "test.db"
    init_database(path)
    connection = connect(path)
    yield connection
    connection.close()


def write(folder: Path, name: str, sql: str) -> Path:
    """Writes a migration file, creating the folder."""
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_text(sql, encoding="utf-8")
    return path


def tables(conn: sqlite3.Connection) -> set[str]:
    """Names of all user tables."""
    rows = conn.execute(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    )
    return {str(r["name"]) for r in rows}


def test_applies_core_before_modules_and_records_each(
    conn: sqlite3.Connection, tmp_path: Path, clock: FixedClock
) -> None:
    """Sources run in the given order, versions ascending, and are recorded."""
    core = tmp_path / "core"
    todos = tmp_path / "todos"
    write(core, "0001_create_core_tags.sql", "CREATE TABLE core_tags (id TEXT PRIMARY KEY);")
    write(core, "0002_add_name.sql", "ALTER TABLE core_tags ADD COLUMN name TEXT;")
    write(
        todos,
        "0001_create_todos.sql",
        "CREATE TABLE todos (id TEXT PRIMARY KEY, tag TEXT REFERENCES core_tags(id));",
    )
    sources = [MigrationSource("core", core), MigrationSource("todos", todos)]

    applied = migrate(conn, sources, clock=clock)

    assert [m.label for m in applied] == [
        "core/0001_create_core_tags",
        "core/0002_add_name",
        "todos/0001_create_todos",
    ]
    assert {"core_tags", "todos", "schema_migrations"} <= tables(conn)
    assert applied_versions(conn) == {"core": 2, "todos": 1}
    row = conn.execute("SELECT applied_at FROM schema_migrations LIMIT 1").fetchone()
    assert row["applied_at"] == "2026-10-08T12:00:00.000Z"


def test_second_run_applies_nothing(
    conn: sqlite3.Connection, tmp_path: Path, clock: FixedClock
) -> None:
    """Running again is a no-op."""
    write(tmp_path / "core", "0001_a.sql", "CREATE TABLE core_a (id TEXT);")
    sources = [MigrationSource("core", tmp_path / "core")]
    migrate(conn, sources, clock=clock)

    assert migrate(conn, sources, clock=clock) == []
    assert pending(conn, sources) == []


def test_new_file_is_picked_up_later(
    conn: sqlite3.Connection, tmp_path: Path, clock: FixedClock
) -> None:
    """Only the new migration runs on the next start."""
    folder = tmp_path / "core"
    write(folder, "0001_a.sql", "CREATE TABLE core_a (id TEXT);")
    sources = [MigrationSource("core", folder)]
    migrate(conn, sources, clock=clock)
    write(folder, "0002_b.sql", "CREATE TABLE core_b (id TEXT);")

    applied = migrate(conn, sources, clock=clock)

    assert [m.label for m in applied] == ["core/0002_b"]


def test_edited_migration_is_refused(
    conn: sqlite3.Connection, tmp_path: Path, clock: FixedClock
) -> None:
    """Changing an applied file blocks startup."""
    folder = tmp_path / "core"
    path = write(folder, "0001_a.sql", "CREATE TABLE core_a (id TEXT);")
    sources = [MigrationSource("core", folder)]
    migrate(conn, sources, clock=clock)
    path.write_text("CREATE TABLE core_a (id TEXT, extra TEXT);", encoding="utf-8")

    with pytest.raises(MigrationError, match="edited after it was applied"):
        migrate(conn, sources, clock=clock)


def test_line_endings_do_not_change_the_checksum(
    conn: sqlite3.Connection, tmp_path: Path, clock: FixedClock
) -> None:
    """A CRLF checkout of the same file is not an edit."""
    folder = tmp_path / "core"
    path = write(folder, "0001_a.sql", "CREATE TABLE core_a (\n  id TEXT\n);\n")
    sources = [MigrationSource("core", folder)]
    migrate(conn, sources, clock=clock)
    path.write_bytes(b"CREATE TABLE core_a (\r\n  id TEXT\r\n);\r\n")

    assert migrate(conn, sources, clock=clock) == []


def test_missing_applied_file_is_refused(
    conn: sqlite3.Connection, tmp_path: Path, clock: FixedClock
) -> None:
    """Deleting an applied migration file is an error, not silently ignored."""
    folder = tmp_path / "core"
    write(folder, "0001_a.sql", "CREATE TABLE core_a (id TEXT);")
    second = write(folder, "0002_b.sql", "CREATE TABLE core_b (id TEXT);")
    sources = [MigrationSource("core", folder)]
    migrate(conn, sources, clock=clock)
    second.unlink()

    with pytest.raises(MigrationError, match="missing on disk"):
        migrate(conn, sources, clock=clock)


def test_failing_migration_rolls_back_and_keeps_earlier_ones(
    conn: sqlite3.Connection, tmp_path: Path, clock: FixedClock
) -> None:
    """A broken file leaves no partial schema and no bookkeeping row."""
    folder = tmp_path / "core"
    write(folder, "0001_ok.sql", "CREATE TABLE core_ok (id TEXT);")
    write(
        folder,
        "0002_broken.sql",
        "CREATE TABLE core_half (id TEXT);\nTHIS IS NOT SQL;",
    )
    sources = [MigrationSource("core", folder)]

    with pytest.raises(MigrationError, match="core/0002_broken failed"):
        migrate(conn, sources, clock=clock)

    assert "core_ok" in tables(conn)
    assert "core_half" not in tables(conn)
    assert applied_versions(conn) == {"core": 1}
    assert not conn.in_transaction


@pytest.mark.parametrize(
    "filename",
    ["1_short.sql", "0001-dash.sql", "0001_Upper.sql", "0001_.sql", "0001_trailing_.sql"],
)
def test_bad_filenames_are_rejected(tmp_path: Path, filename: str) -> None:
    """Only NNNN_snake_name.sql is accepted."""
    write(tmp_path / "core", filename, "SELECT 1;")

    with pytest.raises(MigrationError, match="bad migration filename"):
        discover(MigrationSource("core", tmp_path / "core"))


def test_version_gaps_are_rejected(tmp_path: Path) -> None:
    """Versions must be contiguous from 1."""
    folder = tmp_path / "core"
    write(folder, "0001_a.sql", "SELECT 1;")
    write(folder, "0003_c.sql", "SELECT 1;")

    with pytest.raises(MigrationError, match="without gaps"):
        discover(MigrationSource("core", folder))


def test_missing_folder_is_rejected(tmp_path: Path) -> None:
    """A typo in a module's migrations path is caught."""
    with pytest.raises(MigrationError, match="not found"):
        discover(MigrationSource("todos", tmp_path / "nope"))


def test_non_sql_files_are_ignored(tmp_path: Path) -> None:
    """A .gitkeep keeps an empty folder in git without confusing the runner."""
    folder = tmp_path / "core"
    write(folder, ".gitkeep", "")

    assert discover(MigrationSource("core", folder)) == []


def test_backup_is_written_only_when_something_is_pending(
    conn: sqlite3.Connection, tmp_path: Path, clock: FixedClock
) -> None:
    """A new database gets no backup; an existing one gets one before changes."""
    folder = tmp_path / "core"
    backups = tmp_path / "backups"
    write(folder, "0001_a.sql", "CREATE TABLE core_a (id TEXT);")
    sources = [MigrationSource("core", folder)]

    migrate(conn, sources, clock=clock, backups_dir=backups)
    assert not backups.exists()

    conn.execute("INSERT INTO core_a (id) VALUES ('kept')")
    migrate(conn, sources, clock=clock, backups_dir=backups)
    assert not backups.exists()

    write(folder, "0002_b.sql", "DROP TABLE core_a;")
    migrate(conn, sources, clock=clock, backups_dir=backups)

    files = list(backups.glob("*.db"))
    assert [f.name for f in files] == ["planbox-20261008T120000000Z-pre-migration.db"]
    backup = sqlite3.connect(files[0])
    try:
        assert backup.execute("SELECT id FROM core_a").fetchall() == [("kept",)]
    finally:
        backup.close()


def test_only_the_newest_backups_are_kept(
    conn: sqlite3.Connection, tmp_path: Path, clock: FixedClock
) -> None:
    """Old backups are pruned down to keep_backups."""
    folder = tmp_path / "core"
    backups = tmp_path / "backups"
    write(folder, "0001_a.sql", "CREATE TABLE core_a (id TEXT);")
    sources = [MigrationSource("core", folder)]
    migrate(conn, sources, clock=clock, backups_dir=backups)

    for version in range(2, 6):
        clock.advance(timedelta(minutes=1))
        write(folder, f"{version:04d}_v{version}.sql", f"CREATE TABLE core_t{version} (id TEXT);")
        migrate(conn, sources, clock=clock, backups_dir=backups, keep_backups=2)

    names = sorted(f.name for f in backups.glob("*.db"))
    assert names == [
        "planbox-20261008T120300000Z-pre-migration.db",
        "planbox-20261008T120400000Z-pre-migration.db",
    ]


REBUILD = """-- planbox: foreign_keys=off
CREATE TABLE core_child_new (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL REFERENCES core_parent(id),
    note TEXT NOT NULL DEFAULT ''
) STRICT;
INSERT INTO core_child_new (id, parent_id) SELECT id, parent_id FROM core_child;
DROP TABLE core_child;
ALTER TABLE core_child_new RENAME TO core_child;
"""

PARENT_CHILD = """
CREATE TABLE core_parent (id TEXT PRIMARY KEY) STRICT;
CREATE TABLE core_child (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL REFERENCES core_parent(id)
) STRICT;
INSERT INTO core_parent (id) VALUES ('p');
INSERT INTO core_child (id, parent_id) VALUES ('c', 'p');
"""


def test_foreign_keys_off_directive_allows_table_rebuilds(
    conn: sqlite3.Connection, tmp_path: Path, clock: FixedClock
) -> None:
    """The 12-step rebuild works and enforcement is back on afterwards."""
    folder = tmp_path / "core"
    write(folder, "0001_parent_child.sql", PARENT_CHILD)
    write(folder, "0002_rebuild_child.sql", REBUILD)

    migrate(conn, [MigrationSource("core", folder)], clock=clock)

    assert conn.execute("SELECT id, parent_id, note FROM core_child").fetchone()[:] == (
        "c",
        "p",
        "",
    )
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_foreign_key_violations_roll_back_a_directive_migration(
    conn: sqlite3.Connection, tmp_path: Path, clock: FixedClock
) -> None:
    """Rows orphaned during a rebuild abort that migration."""
    folder = tmp_path / "core"
    write(folder, "0001_parent_child.sql", PARENT_CHILD)
    write(
        folder,
        "0002_orphan.sql",
        "-- planbox: foreign_keys=off\nDELETE FROM core_parent;\n",
    )

    with pytest.raises(MigrationError, match="foreign key violation"):
        migrate(conn, [MigrationSource("core", folder)], clock=clock)

    assert conn.execute("SELECT COUNT(*) FROM core_parent").fetchone()[0] == 1
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    assert applied_versions(conn) == {"core": 1}
