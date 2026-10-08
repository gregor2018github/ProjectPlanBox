r"""Runs all tests: pytest, then Vitest.

Usage:
    py scripts\test.py          backend + frontend tests
    py scripts\test.py --e2e    also the Playwright smoke suite (from phase 1)
"""

import argparse
import sys

from _common import FRONTEND, VENV_PYTHON, ensure_venv, heading, npm, run


def run_tests(*, e2e: bool) -> int:
    """Runs every suite and returns 0 only if all passed."""
    failures: list[str] = []

    heading("Backend tests (pytest)")
    if run([str(VENV_PYTHON), "-m", "pytest"], check=False) != 0:
        failures.append("pytest")

    heading("Frontend tests (Vitest)")
    if run([npm(), "run", "test", "--silent"], cwd=FRONTEND, check=False) != 0:
        failures.append("vitest")

    if e2e:
        heading("Smoke tests (Playwright)")
        if not (FRONTEND / "e2e").is_dir():
            print("The Playwright smoke suite arrives in phase 1.")
            failures.append("playwright (not set up yet)")
        elif run([npm(), "exec", "--", "playwright", "test"], cwd=FRONTEND, check=False) != 0:
            failures.append("playwright")

    heading("Result")
    if failures:
        print(f"FAILED: {', '.join(failures)}")
        return 1
    print("All tests passed.")
    return 0


def main() -> int:
    """Entry point."""
    ensure_venv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--e2e", action="store_true", help="also run the Playwright smoke suite")
    return run_tests(e2e=parser.parse_args().e2e)


if __name__ == "__main__":
    sys.exit(main())
