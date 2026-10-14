"""Application settings.

Settings are resolved in three layers, later ones winning: built-in
defaults, ``private_data/settings.toml``, then ``PLANBOX_*`` environment
variables.
"""

import ipaddress
import os
import socket
import sys
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


def app_paths(
    *, frozen: bool, executable: Path, bundle: Path | None, source_file: Path
) -> tuple[Path, Path]:
    """Where PlanBox keeps its data and finds its built frontend.

    Args:
        frozen: Running as PlanBox.exe (a PyInstaller build sets ``sys.frozen``).
        executable: ``sys.executable``; in the exe, PlanBox.exe itself.
        bundle: The exe's bundled files (``sys._MEIPASS``), or None from source.
        source_file: This file, for the repository layout.

    Returns:
        The folder that holds ``private_data/``, and the built frontend. From
        source that is the repository root and ``frontend/dist``. In the exe it
        is the folder of PlanBox.exe, and the frontend packed inside it.
    """
    if frozen and bundle is not None:
        return executable.resolve().parent, bundle / "frontend" / "dist"
    root = source_file.resolve().parents[2]  # backend/planbox/config.py -> three levels up
    return root, root / "frontend" / "dist"


_bundle: str | None = getattr(sys, "_MEIPASS", None)
REPO_ROOT, FRONTEND_DIST_DIR = app_paths(
    frozen=bool(getattr(sys, "frozen", False)),
    executable=Path(sys.executable),
    bundle=None if _bundle is None else Path(_bundle),
    source_file=Path(__file__),
)
"""The repository root (the exe's folder in PlanBox.exe), and the built frontend."""

PRIVATE_DATA_DIR = REPO_ROOT / "private_data"
"""Everything that must not leave this PC lives here (gitignored)."""

HOST = "127.0.0.1"
"""The only interface the server ever binds to. Deliberately not configurable."""

type Mode = Literal["serve", "dev", "test"]

_MODES: tuple[Mode, ...] = ("serve", "dev", "test")
_DEFAULT_PORTS: Mapping[Mode, int] = {"serve": 8765, "dev": 8000, "test": 0}


class SettingsError(ValueError):
    """Raised when settings.toml or the environment holds an invalid value."""


_TAILSCALE = ipaddress.ip_network("100.64.0.0/10")


@dataclass(frozen=True, slots=True)
class NetworkSettings:
    """Phone access: a second listener on a private-network address (phase 7).

    Attributes:
        address: The private IPv4 address to listen on (home Wi-Fi or Tailscale).
        hostname: An extra name the phone may use, e.g. ``desk.tail1234.ts.net``.
        tls_cert: Certificate (PEM) for https; with ``tls_key``, or neither.
        tls_key: Its private key (PEM).
    """

    address: str
    hostname: str | None = None
    tls_cert: Path | None = None
    tls_key: Path | None = None

    @property
    def tls(self) -> bool:
        """Whether the network listener speaks https."""
        return self.tls_cert is not None


@dataclass(frozen=True, slots=True)
class Settings:
    """Resolved, immutable application settings.

    Attributes:
        mode: ``serve`` for daily use, ``dev`` for the dev server, ``test`` for tests.
        data_dir: Directory holding the database and its backups.
        timezone: IANA zone used to decide what "today" is.
        port: TCP port on 127.0.0.1.
        frontend_dist: Built frontend to serve, or ``None`` to serve the API only.
        offsite_backup_dir: A folder outside ``data_dir`` (another disk, a synced
            cloud folder, a USB stick) that receives a copy of every backup, or
            ``None`` to keep backups on this disk only.
        scheduled_backups: Whether the running server takes daily and weekly
            backups by itself (daily use only).
        network: Phone access, or ``None`` (the default) for this PC only.
    """

    mode: Mode
    data_dir: Path
    timezone: str = "Europe/Amsterdam"
    port: int = 8765
    frontend_dist: Path | None = None
    offsite_backup_dir: Path | None = None
    scheduled_backups: bool = False
    network: NetworkSettings | None = None

    @property
    def db_path(self) -> Path:
        """Path of the SQLite database file."""
        return self.data_dir / "planbox.db"

    @property
    def backups_dir(self) -> Path:
        """Directory for the local backups (pre-migration, scheduled, manual, pre-import)."""
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

    # The off-site folder in settings.toml belongs to the real database. Dev
    # and scratch data dirs (tests, PLANBOX_DATA_DIR) only copy off-site when
    # the environment asks for it, so test backups never land there.
    real = mode == "serve" and data_dir == PRIVATE_DATA_DIR
    offsite = _get_str(file_values, "offsite_backup_dir", "") if real else ""
    offsite = env.get("PLANBOX_OFFSITE_BACKUP_DIR", offsite)

    return Settings(
        mode=mode,
        data_dir=data_dir,
        timezone=timezone,
        port=port,
        frontend_dist=FRONTEND_DIST_DIR if mode == "serve" else None,
        offsite_backup_dir=Path(offsite) if offsite else None,
        scheduled_backups=mode == "serve",
        network=_network_settings(file_values if real else {}, env),
    )


def _network_settings(
    values: Mapping[str, object], env: Mapping[str, str]
) -> NetworkSettings | None:
    """Phone access from settings.toml (real database only) or ``PLANBOX_NETWORK*``.

    Off unless ``network = true``. Leaving this PC is a deliberate step, so
    only private addresses are accepted (CLAUDE.md, ARCHITECTURE §9).
    """
    enabled = values.get("network", False)
    if not isinstance(enabled, bool):
        raise SettingsError("settings.toml: network must be true or false")
    if "PLANBOX_NETWORK" in env:
        enabled = env["PLANBOX_NETWORK"].lower() in {"1", "true", "yes"}
    if not enabled:
        return None

    address = env.get("PLANBOX_NETWORK_ADDRESS", _get_str(values, "network_address", ""))
    address = address or detect_private_address()
    if address is None:
        raise SettingsError(
            "network = true, but this PC has no private network address. "
            "Set network_address in settings.toml."
        )
    check_private_address(address)
    hostname = env.get("PLANBOX_NETWORK_HOSTNAME", _get_str(values, "network_hostname", ""))
    cert = env.get("PLANBOX_NETWORK_TLS_CERT", _get_str(values, "network_tls_cert", ""))
    key = env.get("PLANBOX_NETWORK_TLS_KEY", _get_str(values, "network_tls_key", ""))
    if bool(cert) != bool(key):
        raise SettingsError("network_tls_cert and network_tls_key go together")
    return NetworkSettings(
        address=address,
        hostname=hostname or None,
        tls_cert=Path(cert) if cert else None,
        tls_key=Path(key) if key else None,
    )


def check_private_address(address: str) -> None:
    """Accepts private IPv4 addresses (and Tailscale's 100.64.0.0/10) only.

    Raises:
        SettingsError: For anything else: public, loopback or wildcard addresses.
    """
    try:
        ip = ipaddress.IPv4Address(address)
    except ValueError as exc:
        raise SettingsError(f"network_address {address!r} is not an IPv4 address") from exc
    private = ip.is_private or ip in _TAILSCALE
    if not private or ip.is_loopback or ip.is_unspecified or ip.is_link_local:
        raise SettingsError(
            f"network_address {address} is not a private network address "
            "(192.168.x.x, 10.x.x.x, 172.16-31.x.x or a Tailscale 100.x address)"
        )


def detect_private_address() -> str | None:
    """The private IPv4 address of the interface that routes outwards, if any.

    Connecting a UDP socket sends nothing; it only asks the OS which local
    address it would use.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        try:
            sock.connect(("192.0.2.1", 9))  # TEST-NET-1: never actually contacted
            address = str(sock.getsockname()[0])
        except OSError:
            return None
    try:
        check_private_address(address)
    except SettingsError:
        return None
    return address


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
