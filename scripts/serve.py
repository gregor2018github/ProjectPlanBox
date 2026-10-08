r"""Daily use: builds the frontend if needed and serves app + API from one process.

Usage:
    py scripts\serve.py              http://127.0.0.1:8765 (real data in private_data/)
    py scripts\serve.py --no-build   skip the freshness check
"""

import argparse
import sys
from pathlib import Path

from _common import FRONTEND, ensure_venv, heading, npm, run

BUILD_INPUTS = ("src", "public", "index.html", "package-lock.json", "vite.config.ts")


def newest_mtime(paths: list[Path]) -> float:
    """Latest modification time of any file under the given paths."""
    newest = 0.0
    for path in paths:
        files = path.rglob("*") if path.is_dir() else [path]
        for file in files:
            if file.is_file():
                newest = max(newest, file.stat().st_mtime)
    return newest


def build_is_stale() -> bool:
    """True when dist/ is missing or older than any frontend source."""
    index = FRONTEND / "dist" / "index.html"
    if not index.is_file():
        return True
    return newest_mtime([FRONTEND / p for p in BUILD_INPUTS]) > index.stat().st_mtime


def main() -> int:
    """Entry point."""
    ensure_venv()
    import uvicorn  # noqa: PLC0415 - needs the venv

    from planbox.config import HOST, load_settings  # noqa: PLC0415
    from planbox.main import create_app  # noqa: PLC0415

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-build", action="store_true", help="do not rebuild the frontend")
    args = parser.parse_args()

    if not args.no_build and build_is_stale():
        heading("Building the frontend")
        run([npm(), "run", "build", "--silent"], cwd=FRONTEND)

    settings = load_settings("serve")
    heading(f"PlanBox on http://{HOST}:{settings.port}")
    print(f"Database: {settings.db_path}")
    uvicorn.run(create_app(settings), host=HOST, port=settings.port, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
