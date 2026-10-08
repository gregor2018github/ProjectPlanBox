r"""Regenerates the frontend's API types from the FastAPI OpenAPI schema.

Usage:
    py scripts\gen_api.py           write openapi.json and schema.d.ts
    py scripts\gen_api.py --check   fail if the committed files are stale
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path

from _common import FRONTEND, ensure_venv, npm, run

API_DIR = FRONTEND / "src" / "core" / "api"


def export_schema() -> str:
    """Builds the app (without starting it) and returns its OpenAPI JSON."""
    from planbox.config import Settings  # noqa: PLC0415 - needs ensure_venv() first
    from planbox.main import create_app  # noqa: PLC0415

    with tempfile.TemporaryDirectory() as tmp:
        app = create_app(Settings(mode="test", data_dir=Path(tmp)))
        schema = app.openapi()
    return json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def generate(target: Path) -> None:
    """Writes openapi.json and schema.d.ts into ``target``."""
    target.mkdir(parents=True, exist_ok=True)
    spec = target / "openapi.json"
    spec.write_text(export_schema(), encoding="utf-8", newline="\n")
    run(
        [npm(), "exec", "--", "openapi-typescript", str(spec), "-o", str(target / "schema.d.ts")],
        cwd=FRONTEND,
    )


def main() -> int:
    """Entry point."""
    ensure_venv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if committed types are stale")
    args = parser.parse_args()

    if not args.check:
        generate(API_DIR)
        return 0

    with tempfile.TemporaryDirectory() as tmp:
        generate(Path(tmp))
        stale = [
            name
            for name in ("openapi.json", "schema.d.ts")
            if not (API_DIR / name).is_file()
            or (API_DIR / name).read_text(encoding="utf-8")
            != (Path(tmp) / name).read_text(encoding="utf-8")
        ]
    if stale:
        print(f"API types are stale ({', '.join(stale)}). Run: py scripts\\gen_api.py")
        return 1
    print("API types are up to date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
