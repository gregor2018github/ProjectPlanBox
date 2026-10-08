r"""Applies pending migrations without starting the server (backup included).

Usage:
    py scripts\migrate.py         the real database (private_data/)
    py scripts\migrate.py --dev   the dev database (private_data/dev/)
"""

import argparse
import sys

from _common import ensure_venv


def main() -> int:
    """Entry point."""
    ensure_venv()
    from planbox.config import load_settings  # noqa: PLC0415 - needs the venv
    from planbox.core.clock import SystemClock  # noqa: PLC0415
    from planbox.main import run_migrations  # noqa: PLC0415
    from planbox.modules import ENABLED_MODULES  # noqa: PLC0415

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dev", action="store_true", help="migrate the dev database")
    settings = load_settings("dev" if parser.parse_args().dev else "serve")

    applied = run_migrations(settings, ENABLED_MODULES, SystemClock())
    print(f"Database: {settings.db_path}")
    if not applied:
        print("Already up to date.")
    for migration in applied:
        print(f"Applied {migration.label}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
