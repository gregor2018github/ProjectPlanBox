"""Shared helpers for the developer and runtime scripts (Windows-first, plain Python).

Two install modes exist (see README):

- **dev**: Node.js is available. Full toolchain, editable install with the
  dev group, frontend built from source.
- **runtime**: no Node.js. Only the runtime packages from the lock file,
  and a prebuilt ``frontend/dist`` (from the release zip).
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Literal

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
DIST = FRONTEND / "dist"
BUILD_INFO = DIST / "BUILD_INFO.json"
VENV = ROOT / ".venv"
VENV_PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
LOCK_FILE = ROOT / "requirements.lock.txt"
INSTALL_MARKER = VENV / "planbox-install.json"

type InstallMode = Literal["dev", "runtime"]


def ensure_venv() -> None:
    """Re-runs the current script with the .venv interpreter if not already in it."""
    if not VENV_PYTHON.is_file():
        sys.exit("No .venv found. Run `py main.py` (or `py scripts\\setup.py`) first.")
    if Path(sys.prefix).resolve() != VENV.resolve():
        completed = subprocess.run([str(VENV_PYTHON), *sys.argv], check=False)
        sys.exit(completed.returncode)
    backend = str(ROOT / "backend")
    if backend not in sys.path:
        sys.path.insert(0, backend)


def find_npm() -> str | None:
    """Path of the npm executable (npm.cmd on Windows), or None without Node.js."""
    return shutil.which("npm")


def npm() -> str:
    """Path of the npm executable; exits when Node.js is missing."""
    found = find_npm()
    if found is None:
        sys.exit("npm not found. Install Node.js 24 LTS.")
    return found


def install_mode() -> InstallMode:
    """``dev`` with Node.js and frontend sources, otherwise ``runtime`` (e.g. a release zip)."""
    has_sources = (FRONTEND / "package.json").is_file()
    return "dev" if find_npm() is not None and has_sources else "runtime"


def has_built_frontend() -> bool:
    """Tells whether ``frontend/dist`` holds a built app."""
    return (DIST / "index.html").is_file()


def is_prebuilt_release() -> bool:
    """Tells whether ``frontend/dist`` came from a release zip (it carries BUILD_INFO.json)."""
    return BUILD_INFO.is_file()


NO_FRONTEND_MESSAGE = (
    "PlanBox needs a built frontend, and Node.js is not installed to build one.\n"
    "Download PlanBox-<version>.zip from the GitHub releases page\n"
    "(https://github.com/gregor2018github/ProjectPlanBox/releases), unpack it and\n"
    "run `py main.py` from the unpacked folder. Or install Node.js 24 LTS to build it."
)


def lock_digest() -> str:
    """SHA-256 of the lock file (empty string if it is missing)."""
    if not LOCK_FILE.is_file():
        return ""
    return hashlib.sha256(LOCK_FILE.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def write_install_marker(mode: InstallMode) -> None:
    """Records how .venv was installed, so main.py can tell when to reinstall."""
    INSTALL_MARKER.write_text(
        json.dumps({"mode": mode, "lock_sha256": lock_digest()}, indent=2) + "\n",
        encoding="utf-8",
    )


def install_is_current(mode: InstallMode) -> bool:
    """True when .venv exists and was installed for this mode from the current lock file."""
    if not VENV_PYTHON.is_file() or not INSTALL_MARKER.is_file():
        return False
    try:
        marker: object = json.loads(INSTALL_MARKER.read_text(encoding="utf-8"))
    except ValueError:
        return False
    if not isinstance(marker, dict):
        return False
    recorded: dict[str, object] = marker  # pyright: ignore[reportUnknownVariableType]
    # A dev install also covers runtime use; a runtime install lacks the dev tools.
    mode_ok = recorded.get("mode") == mode or recorded.get("mode") == "dev"
    return mode_ok and recorded.get("lock_sha256") == lock_digest()


def venv_tool(name: str) -> str:
    """Path of a console script installed in .venv (ruff, pyright, ...)."""
    folder = VENV_PYTHON.parent
    for candidate in (folder / f"{name}.exe", folder / name):
        if candidate.is_file():
            return str(candidate)
    sys.exit(f"{name} is not installed in .venv. Run scripts/setup.py.")


def run(
    cmd: Sequence[str],
    *,
    cwd: Path = ROOT,
    env: Mapping[str, str] | None = None,
    check: bool = True,
) -> int:
    """Runs a command, streaming its output; exits on failure when ``check``."""
    merged = {**os.environ, **(env or {})}
    completed = subprocess.run(list(cmd), cwd=cwd, env=merged, check=False)
    if check and completed.returncode != 0:
        sys.exit(completed.returncode)
    return completed.returncode


def heading(text: str) -> None:
    """Prints a visible section heading."""
    print(f"\n== {text}", flush=True)
