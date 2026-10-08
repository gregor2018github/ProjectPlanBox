"""Settings, clock, ids, entity refs and the module manifest."""

from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import APIRouter

from planbox.config import PRIVATE_DATA_DIR, SettingsError, load_settings, mode_from_env
from planbox.core.clock import FixedClock, to_iso
from planbox.core.entities import EntityRef, EntityRegistry, EntitySummary, EntityType
from planbox.core.ids import is_valid_id, new_id
from planbox.core.module import Module

NO_FILE = Path("does-not-exist.toml")


def test_serve_defaults_use_private_data() -> None:
    """Daily use reads and writes private_data/ on port 8765."""
    settings = load_settings("serve", env={}, settings_file=NO_FILE)

    assert settings.data_dir == PRIVATE_DATA_DIR
    assert settings.db_path == PRIVATE_DATA_DIR / "planbox.db"
    assert settings.port == 8765
    assert settings.timezone == "Europe/Amsterdam"
    assert settings.frontend_dist is not None


def test_dev_uses_its_own_database() -> None:
    """Dev never touches the real database."""
    settings = load_settings("dev", env={}, settings_file=NO_FILE)

    assert settings.data_dir == PRIVATE_DATA_DIR / "dev"
    assert settings.port == 8000
    assert settings.frontend_dist is None


def test_file_then_env_override(tmp_path: Path) -> None:
    """settings.toml beats defaults; PLANBOX_* beats settings.toml."""
    file = tmp_path / "settings.toml"
    file.write_text('timezone = "Europe/Berlin"\nport = 9000\n', encoding="utf-8")

    from_file = load_settings("serve", env={}, settings_file=file)
    from_env = load_settings(
        "serve",
        env={"PLANBOX_TIMEZONE": "UTC", "PLANBOX_PORT": "9100", "PLANBOX_DATA_DIR": "x"},
        settings_file=file,
    )

    assert (from_file.timezone, from_file.port) == ("Europe/Berlin", 9000)
    assert (from_env.timezone, from_env.port, from_env.data_dir) == ("UTC", 9100, Path("x"))


@pytest.mark.parametrize("content", ["port = 'eight'", "timezone = 3", "not toml ["])
def test_bad_settings_file_is_rejected(tmp_path: Path, content: str) -> None:
    """Wrong types and broken TOML fail loudly."""
    file = tmp_path / "settings.toml"
    file.write_text(content, encoding="utf-8")

    with pytest.raises(SettingsError):
        load_settings("serve", env={}, settings_file=file)


def test_mode_from_env() -> None:
    """PLANBOX_MODE picks the mode; unknown values are rejected."""
    assert mode_from_env({}) == "serve"
    assert mode_from_env({"PLANBOX_MODE": "dev"}) == "dev"
    with pytest.raises(SettingsError):
        mode_from_env({"PLANBOX_MODE": "prod"})


def test_to_iso_is_fixed_width_utc() -> None:
    """Timestamps are UTC with exactly three fractional digits and a Z."""
    plus_two = timezone(timedelta(hours=2))

    assert to_iso(datetime(2026, 3, 1, 0, 0, 0, tzinfo=UTC)) == "2026-03-01T00:00:00.000Z"
    assert to_iso(datetime(2026, 3, 1, 2, 5, 9, 123999, tzinfo=plus_two)) == (
        "2026-03-01T00:05:09.123Z"
    )
    with pytest.raises(ValueError, match="aware"):
        to_iso(datetime(2026, 3, 1))  # noqa: DTZ001


def test_fixed_clock_advances(clock: FixedClock) -> None:
    """The test clock only moves when told to."""
    before = clock.now()
    clock.advance(timedelta(seconds=5))

    assert clock.now() - before == timedelta(seconds=5)


def test_new_ids_are_valid_and_time_ordered() -> None:
    """UUIDv7 ids validate and sort by creation."""
    ids = [new_id() for _ in range(50)]

    assert all(is_valid_id(i) for i in ids)
    assert ids == sorted(ids)
    assert not is_valid_id("01a11c71-6563-473d-8602-c5617ab6aaed")  # v4
    assert not is_valid_id(ids[0].upper())


def test_entity_refs_round_trip() -> None:
    """Refs print and parse as module.kind:id."""
    ref = EntityRef.parse("todos.todo:abc")

    assert ref == EntityRef("todos.todo", "abc")
    assert str(ref) == "todos.todo:abc"
    for bad in ["todos:abc", "todos.todo:", "Todos.todo:1", "todo"]:
        with pytest.raises(ValueError, match="not an entity reference"):
            EntityRef.parse(bad)


def _no_summaries(_conn: object, _ids: object) -> dict[str, EntitySummary]:
    return {}


def test_registry_rejects_duplicates() -> None:
    """Each entity type name is registered once."""
    registry = EntityRegistry([EntityType("todos.todo", _no_summaries)])

    assert registry.names() == ["todos.todo"]
    with pytest.raises(ValueError, match="registered twice"):
        registry.register(EntityType("todos.todo", _no_summaries))


def test_module_manifest_validation(tmp_path: Path) -> None:
    """Module ids are lowercase, unreserved, and prefix their entity types."""
    Module("todos", APIRouter(), tmp_path, (EntityType("todos.todo", _no_summaries),))

    with pytest.raises(ValueError, match="must match"):
        Module("Todos", APIRouter(), tmp_path)
    with pytest.raises(ValueError, match="reserved"):
        Module("core", APIRouter(), tmp_path)
    with pytest.raises(ValueError, match="must start with"):
        Module("todos", APIRouter(), tmp_path, (EntityType("notes.note", _no_summaries),))
