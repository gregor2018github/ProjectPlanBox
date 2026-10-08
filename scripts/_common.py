"""Shared helpers for the developer scripts (Windows-first, plain Python)."""

import os
import shutil
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
VENV = ROOT / ".venv"
VENV_PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def ensure_venv() -> None:
    """Re-runs the current script with the .venv interpreter if not already in it."""
    if not VENV_PYTHON.is_file():
        sys.exit("No .venv found. Run `py -3.14 scripts\\setup.py` first.")
    if Path(sys.prefix).resolve() != VENV.resolve():
        completed = subprocess.run([str(VENV_PYTHON), *sys.argv], check=False)
        sys.exit(completed.returncode)
    backend = str(ROOT / "backend")
    if backend not in sys.path:
        sys.path.insert(0, backend)


def npm() -> str:
    """Path of the npm executable (npm.cmd on Windows)."""
    found = shutil.which("npm")
    if found is None:
        sys.exit("npm not found. Install Node.js 24 LTS.")
    return found


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
