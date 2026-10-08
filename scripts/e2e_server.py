r"""Runs PlanBox for the Playwright smoke suite on a throwaway data folder.

Usage (Playwright starts this itself; see frontend/playwright.config.ts):
    py -3.14 scripts\e2e_server.py --port 8790
"""

import argparse
import os
import sys
import tempfile

from _common import ensure_venv


def main() -> int:
    """Entry point."""
    ensure_venv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="planbox-e2e-") as data_dir:
        # serve() reads its settings from the environment; never the real private_data/.
        os.environ["PLANBOX_DATA_DIR"] = data_dir
        os.environ["PLANBOX_PORT"] = str(args.port)
        from serve import serve  # noqa: PLC0415 - must run inside .venv

        return serve(open_browser=False)


if __name__ == "__main__":
    sys.exit(main())
