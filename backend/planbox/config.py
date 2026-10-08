"""Application settings.

Settings are resolved in three layers, later ones winning: built-in
defaults, ``private_data/settings.toml``, then ``PLANBOX_*`` environment
variables.
"""

import os
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

REPO_ROOT = Path(__file__).resolve().parents[2]
"""The repository root (``backend/planbox/config.py`` -> three levels up)."""

PRIVATE_DATA_DIR = REPO_ROOT / "private_data"
"""Everything that must not leave this PC lives here (gitignored)."""

FRONTEND_DIST_DIR = REPO_ROOT / "frontend" / "dist"

HOST = "127.0.0.1"
"""The only interface the server ever binds to. Deliberately not configurable."""

type Mode = Literal["serve", "dev", "test"]

_MODES: tuple[Mode, ...] = ("serve", "dev", "test")
_DEFAULT_PORTS: Mapping[Mode, int] = {"serve": 8765, "dev": 8000, "test": 0}


class SettingsError(ValueError):
    """Raised when settings.toml or the environment holds an invalid value."""


@dataclass(frozen=True, slots=True)
class Settings:
    """Resolved, immutable application settings.

    Attributes:
        mode: ``serve`` for daily use, ``dev`` for the dev server, ``test`` for tests.
        data_dir: Directory holding the database and its backups.
        timezone: IANA zone used to decide what "today" is.
        port: TCP port on 127.0.0.1.
        frontend_dist: Built frontend to serve, or ``None`` to serve the API only.
    """

    mode: Mode
    data_dir: Path
    timezone: str = "Europe/Amsterdam"
    port: int = 8765
    frontend_dist: Path | None = None

    @property
    def db_path(self) -> Path:
        """Path of the SQLite database file."""
        return self.data_dir / "planbox.db"

    @property
    def backups_dir(self) -> Path:
        """Directory for automatic pre-migration backups."""
        return self.data_dir / "backups"


def load_settings(
    mode: Mode,
    *,
    env: Mapping[str, str] | None = None,
    settings_file: Path | None = None,
) -> Settings:
    """Builds settings for a mode from defaults, settings.toml and the environment.

    Args:
        mode: The run mode; it picks the default data directory and port.
        env: Environment to read ``PLANBOX_*`` variables from. Defaults to ``os.environ``.
        settings_file: The TOML file to read. Defaults to ``private_data/settings.toml``.

    Returns:
        The resolved settings.

    Raises:
        SettingsError: If a value has the wrong type or the mode is unknown.
    """
    if mode not in _MODES:
        raise SettingsError(f"unknown mode {mode!r}")
    env = os.environ if env is None else env
    settings_file = PRIVATE_DATA_DIR / "settings.toml" if settings_file is None else settings_file

    file_values = _read_settings_file(settings_file)

    data_dir = PRIVATE_DATA_DIR / "dev" if mode == "dev" else PRIVATE_DATA_DIR
    if "PLANBOX_DATA_DIR" in env:
        data_dir = Path(env["PLANBOX_DATA_DIR"])

    timezone = env.get("PLANBOX_TIMEZONE", _get_str(file_values, "timezone", "Europe/Amsterdam"))
    if not timezone:
        raise SettingsError("timezone must not be empty")

    port = _DEFAULT_PORTS[mode]
    if mode == "serve":
        port = _get_int(file_values, "port", port)
    if "PLANBOX_PORT" in env:
        try:
            port = int(env["PLANBOX_PORT"])
        except ValueError as exc:
            raise SettingsError("PLANBOX_PORT must be an integer") from exc

    return Settings(
        mode=mode,
        data_dir=data_dir,
        timezone=timezone,
        port=port,
        frontend_dist=FRONTEND_DIST_DIR if mode == "serve" else None,
    )


def mode_from_env(env: Mapping[str, str] | None = None) -> Mode:
    """Reads the run mode from ``PLANBOX_MODE`` (default ``serve``).

    Raises:
        SettingsError: If the variable holds an unknown mode.
    """
    env = os.environ if env is None else env
    raw = env.get("PLANBOX_MODE", "serve")
    if raw not in _MODES:
        raise SettingsError(f"PLANBOX_MODE must be one of {', '.join(_MODES)}")
    return raw


def _read_settings_file(path: Path) -> dict[str, object]:
    if not path.is_file():
        return {}
    try:
        with path.open("rb") as fh:
            return tomllib.load(fh)
    except tomllib.TOMLDecodeError as exc:
        raise SettingsError(f"{path}: {exc}") from exc


def _get_str(values: Mapping[str, object], key: str, default: str) -> str:
    value = values.get(key, default)
    if not isinstance(value, str):
        raise SettingsError(f"settings.toml: {key} must be a string")
    return value


def _get_int(values: Mapping[str, object], key: str, default: int) -> int:
    value = values.get(key, default)
    if not isinstance(value, int) or isinstance(value, bool):
        raise SettingsError(f"settings.toml: {key} must be an integer")
    return value
