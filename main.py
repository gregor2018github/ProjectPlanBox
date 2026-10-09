r"""Starts PlanBox and opens it in your browser.

Usage:
    py main.py

On the first start, and after an update that changed the Python packages,
this runs the setup (scripts/setup.py) by itself. With Node.js it is a
developer install; without Node.js (a release zip) it installs only what is
needed to run. If PlanBox is already running, it just opens the browser.
Stop PlanBox with the power button in the app's sidebar, or Ctrl+C here.
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts"))

from _common import (  # noqa: E402 - needs the path above
    FRONTEND,
    ensure_venv,
    install_is_current,
    install_mode,
)


def main() -> int:
    """Entry point."""
    mode = install_mode()
    ready = install_is_current(mode)
    if mode == "dev":
        ready = ready and (FRONTEND / "node_modules").is_dir()
    if not ready:
        print("Setting PlanBox up (first start, or the packages changed). This takes a minute.")
        setup = subprocess.run([sys.executable, str(ROOT / "scripts" / "setup.py")], check=False)
        if setup.returncode != 0:
            return setup.returncode

    ensure_venv()
    from serve import serve  # noqa: PLC0415 - must run inside .venv

    return serve(open_browser=True)


if __name__ == "__main__":
    sys.exit(main())
