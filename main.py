r"""Starts PlanBox and opens it in your browser.

Usage:
    py main.py

On the very first start this runs the one-time setup (.venv, packages,
frontend build). If PlanBox is already running, it just opens the browser.
Stop PlanBox with the power button in the app's sidebar, or Ctrl+C here.
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts"))

from _common import FRONTEND, VENV_PYTHON, ensure_venv  # noqa: E402 - needs the path above


def main() -> int:
    """Entry point."""
    if not VENV_PYTHON.is_file() or not (FRONTEND / "node_modules").is_dir():
        print("First start: setting PlanBox up. This takes a minute, once.")
        setup = subprocess.run([sys.executable, str(ROOT / "scripts" / "setup.py")], check=False)
        if setup.returncode != 0:
            return setup.returncode

    ensure_venv()
    from serve import serve  # noqa: PLC0415 - must run inside .venv

    return serve(open_browser=True)


if __name__ == "__main__":
    sys.exit(main())
