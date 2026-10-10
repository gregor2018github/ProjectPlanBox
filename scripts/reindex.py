r"""Empties the search index; the next search rebuilds it from the modules' tables.

The index keeps itself current, so this is only needed if it ever looks wrong
(for example after the PC's clock was set back). Safe while the app runs.

Usage:
    py scripts\reindex.py         the real database (private_data/)
    py scripts\reindex.py --dev   the dev database (private_data/dev/)
"""

import argparse
import sys

from _common import ensure_venv


def main() -> int:
    """Entry point."""
    ensure_venv()
    from planbox.config import load_settings  # noqa: PLC0415 - needs the venv
    from planbox.core.clock import SystemClock  # noqa: PLC0415
    from planbox.core.db import connect  # noqa: PLC0415
    from planbox.core.entities import EntityRegistry  # noqa: PLC0415
    from planbox.core.search.repository import SearchRepository  # noqa: PLC0415
    from planbox.core.search.service import SearchService  # noqa: PLC0415
    from planbox.main import run_migrations  # noqa: PLC0415
    from planbox.modules import ENABLED_MODULES  # noqa: PLC0415

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dev", action="store_true", help="use the dev database")
    settings = load_settings("dev" if parser.parse_args().dev else "serve")

    run_migrations(settings, ENABLED_MODULES, SystemClock())
    registry = EntityRegistry(t for m in ENABLED_MODULES for t in m.entity_types)
    conn = connect(settings.db_path)
    try:
        SearchService(conn, SearchRepository(conn), registry, SystemClock()).rebuild()
    finally:
        conn.close()
    print(f"Database: {settings.db_path}")
    print("Search index emptied; the next search rebuilds it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
