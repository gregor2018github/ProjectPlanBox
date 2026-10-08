r"""Starts the dev environment: backend with reload plus Vite. Ctrl+C stops both.

Usage:
    py scripts\dev.py

Open http://127.0.0.1:5173. The backend uses the throwaway database in
private_data/dev/, never your real data.
"""

import sys

from _common import FRONTEND, ROOT, VENV_PYTHON, ensure_venv, heading, npm
from _processes import Service, run_together


def main() -> int:
    """Entry point."""
    ensure_venv()
    from gen_api import API_DIR, generate  # noqa: PLC0415 - needs the venv
    from planbox.config import HOST, load_settings  # noqa: PLC0415

    settings = load_settings("dev")
    heading("Generating API types")
    generate(API_DIR)

    heading(f"Backend http://{HOST}:{settings.port}  |  App http://{HOST}:5173")
    print(f"Dev database: {settings.db_path}")
    return run_together(
        [
            Service(
                "backend",
                [
                    str(VENV_PYTHON),
                    "-m",
                    "uvicorn",
                    "planbox.main:create_app_from_env",
                    "--factory",
                    "--host",
                    HOST,
                    "--port",
                    str(settings.port),
                    "--reload",
                    "--reload-dir",
                    str(ROOT / "backend" / "planbox"),
                ],
                ROOT,
                {"PLANBOX_MODE": "dev"},
            ),
            Service("frontend", [npm(), "run", "dev"], FRONTEND, {}),
        ]
    )


if __name__ == "__main__":
    sys.exit(main())
