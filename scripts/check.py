r"""The full quality gate: formatting, lint, types, API drift, then all tests.

Usage:
    py scripts\check.py          everything except the browser smoke suite
    py scripts\check.py --full   also the Playwright smoke suite
    py scripts\check.py --fix    apply formatters and safe lint fixes first
"""

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from _common import FRONTEND, ROOT, VENV_PYTHON, ensure_venv, heading, npm, run, venv_tool
from test import run_tests

PY_PATHS = ("backend", "scripts", "main.py")


def main() -> int:
    """Entry point."""
    ensure_venv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--full", action="store_true", help="include the Playwright suite")
    parser.add_argument("--fix", action="store_true", help="apply formatters and lint fixes first")
    args = parser.parse_args()

    ruff = venv_tool("ruff")
    if args.fix:
        heading("Fixing")
        run([ruff, "format", *PY_PATHS], check=False)
        run([ruff, "check", "--fix", *PY_PATHS], check=False)
        run([npm(), "run", "format", "--silent"], cwd=FRONTEND, check=False)
        run([npm(), "exec", "--", "eslint", "--fix", "."], cwd=FRONTEND, check=False)

    steps: list[tuple[str, Sequence[str], Path]] = [
        ("ruff format", [ruff, "format", "--check", *PY_PATHS], ROOT),
        ("ruff lint", [ruff, "check", *PY_PATHS], ROOT),
        ("pyright", [venv_tool("pyright")], ROOT),
        ("API types", [str(VENV_PYTHON), str(ROOT / "scripts" / "gen_api.py"), "--check"], ROOT),
        ("prettier", [npm(), "run", "format:check", "--silent"], FRONTEND),
        ("eslint", [npm(), "run", "lint", "--silent"], FRONTEND),
        ("tsc", [npm(), "run", "typecheck", "--silent"], FRONTEND),
    ]
    failures: list[str] = []
    for name, cmd, cwd in steps:
        heading(name)
        if run(cmd, cwd=cwd, check=False) != 0:
            failures.append(name)

    if run_tests(e2e=args.full) != 0:
        failures.append("tests")

    heading("Check")
    if failures:
        print(f"FAILED: {', '.join(failures)}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
