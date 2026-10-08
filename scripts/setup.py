r"""First-time setup (safe to re-run): .venv, Python deps, npm deps, API types.

Usage:
    py -3.14 scripts\setup.py
"""

import subprocess
import sys
import venv

from _common import FRONTEND, ROOT, VENV, VENV_PYTHON, heading, npm, run

REQUIRED = (3, 14)


def main() -> int:
    """Entry point."""
    if sys.version_info[:2] != REQUIRED:
        found = f"{sys.version_info.major}.{sys.version_info.minor}"
        sys.exit(f"PlanBox needs Python 3.14 (found {found}). Run: py -3.14 scripts\\setup.py")

    heading("Python environment (.venv)")
    if not VENV_PYTHON.is_file():
        venv.EnvBuilder(with_pip=True).create(VENV)
        print(f"Created {VENV}")
    run([str(VENV_PYTHON), "-m", "pip", "install", "--quiet", "--upgrade", "pip"])
    run([str(VENV_PYTHON), "-m", "pip", "install", "--quiet", "-e", ".", "--group", "dev"])

    heading("Frontend dependencies")
    lockfile = FRONTEND / "package-lock.json"
    run([npm(), "ci" if lockfile.is_file() else "install", "--no-fund", "--no-audit"], cwd=FRONTEND)

    heading("API types")
    run([str(VENV_PYTHON), str(ROOT / "scripts" / "gen_api.py")])

    heading("Done")
    print("Start the dev environment:  py scripts\\dev.py")
    print("Run all tests:              py scripts\\test.py")
    print("Use PlanBox daily:          py scripts\\serve.py")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)
