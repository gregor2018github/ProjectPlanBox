r"""Builds the release zip for PCs without Node.js (see README, "Runtime-only PC").

Usage:
    py scripts\package.py             writes release\PlanBox-<version>.zip
    py scripts\package.py --out DIR   writes it into DIR instead

The zip holds one folder, PlanBox/, with exactly what is needed to run:
main.py, pyproject.toml, requirements.lock.txt, README.md, LICENSE, the
backend package (no tests), the runtime scripts, and the built frontend
(no source maps). It never contains private_data, .venv, node_modules or
tests, so unpacking it over an existing install keeps your data.
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
import time
import zipfile
from collections.abc import Iterable
from pathlib import Path

from _common import FRONTEND, ROOT, heading, npm, run

TOP = "PlanBox"
ROOT_FILES = ("main.py", "pyproject.toml", "requirements.lock.txt", "README.md", "LICENSE")
RUNTIME_SCRIPTS = ("_common.py", "setup.py", "serve.py", "migrate.py")
FORBIDDEN_PARTS = frozenset(
    {"private_data", ".venv", "node_modules", "tests", "__pycache__", ".git", "src", "e2e"}
)
FORBIDDEN_SUFFIXES = (".map", ".pyc", ".db", ".db-wal", ".db-shm")


def read_version() -> str:
    """The app version; pyproject.toml and planbox/__init__.py must agree."""
    init = (ROOT / "backend" / "planbox" / "__init__.py").read_text(encoding="utf-8")
    match = re.search(r'__version__ = "([^"]+)"', init)
    project = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    declared = re.search(r'^version = "([^"]+)"', project, re.MULTILINE)
    if match is None or declared is None or match[1] != declared[1]:
        sys.exit("Version mismatch between pyproject.toml and backend/planbox/__init__.py.")
    return match[1]


def git_commit() -> str:
    """Short commit hash, with +dirty when the tree has uncommitted changes."""
    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()
    dirty = subprocess.run(
        ["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True, check=False
    ).stdout.strip()
    return (commit or "unknown") + ("+dirty" if dirty else "")


def build_frontend(out_dir: Path, version: str) -> None:
    """Builds the frontend without source maps into ``out_dir`` and adds BUILD_INFO.json."""
    run([npm(), "run", "typecheck", "--silent"], cwd=FRONTEND)
    run(
        [
            npm(),
            "exec",
            "--",
            "vite",
            "build",
            "--outDir",
            str(out_dir),
            "--emptyOutDir",
            "--sourcemap",
            "false",
        ],
        cwd=FRONTEND,
    )
    info = {
        "version": version,
        "commit": git_commit(),
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "python_minimum": "3.12",
    }
    (out_dir / "BUILD_INFO.json").write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")


def is_forbidden(arcname: str) -> bool:
    """Tells whether a path inside the zip must never ship."""
    parts = arcname.split("/")
    return bool(FORBIDDEN_PARTS.intersection(parts)) or arcname.endswith(FORBIDDEN_SUFFIXES)


def collect(root: Path, dist: Path) -> list[tuple[Path, str]]:
    """Every (source file, path in zip) pair, from an allowlist."""
    entries: list[tuple[Path, str]] = []

    def add_tree(base: Path, prefix: str) -> None:
        for path in sorted(base.rglob("*")):
            if path.is_file():
                arcname = f"{TOP}/{prefix}/{path.relative_to(base).as_posix()}"
                if not is_forbidden(arcname):
                    entries.append((path, arcname))

    for name in ROOT_FILES:
        entries.append((root / name, f"{TOP}/{name}"))
    add_tree(root / "backend" / "planbox", "backend/planbox")
    for name in RUNTIME_SCRIPTS:
        entries.append((root / "scripts" / name, f"{TOP}/scripts/{name}"))
    add_tree(dist, "frontend/dist")
    return entries


def verify(arcnames: Iterable[str]) -> None:
    """Fails if anything forbidden slipped into the zip or something essential is missing."""
    names = set(arcnames)
    leaked = sorted(n for n in names if is_forbidden(n))
    if leaked:
        sys.exit(f"Refusing to package forbidden paths: {leaked[:5]}")
    required = {
        f"{TOP}/main.py",
        f"{TOP}/requirements.lock.txt",
        f"{TOP}/backend/planbox/main.py",
        f"{TOP}/frontend/dist/index.html",
        f"{TOP}/frontend/dist/BUILD_INFO.json",
        f"{TOP}/scripts/setup.py",
    }
    missing = sorted(required - names)
    if missing:
        sys.exit(f"The package is missing: {missing}")


def write_zip(target: Path, entries: list[tuple[Path, str]]) -> None:
    """Writes the zip with deterministic entry order."""
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source, arcname in sorted(entries, key=lambda e: e[1]):
            archive.write(source, arcname)


def main() -> int:
    """Entry point."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "release", help="output folder")
    args = parser.parse_args()

    version = read_version()
    target: Path = args.out / f"PlanBox-{version}.zip"
    with tempfile.TemporaryDirectory(prefix="planbox-dist-") as tmp:
        dist = Path(tmp) / "dist"
        heading(f"Building the frontend for {version}")
        build_frontend(dist, version)
        entries = collect(ROOT, dist)
        verify(arcname for _, arcname in entries)
        heading("Writing the zip")
        write_zip(target, entries)
    size_kb = target.stat().st_size // 1024
    print(f"{target} ({size_kb} KB, {len(entries)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
