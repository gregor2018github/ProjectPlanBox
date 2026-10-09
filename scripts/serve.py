r"""Daily use: builds the frontend if needed and serves app + API from one process.

Usage:
    py scripts\serve.py              http://127.0.0.1:8765 (real data in private_data/)
    py scripts\serve.py --open       also open it in its own app window (what main.py does)
    py scripts\serve.py --no-build   skip the freshness check

The app's "Shut down" button stops this process and closes the app window;
closing the app window stops this process.
"""

import argparse
import json
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Literal

from _common import (
    FRONTEND,
    NO_FRONTEND_MESSAGE,
    ensure_venv,
    has_built_frontend,
    heading,
    install_mode,
    is_prebuilt_release,
    npm,
    run,
)
from app_window import close_app, open_app, wait_until_closed

BUILD_INPUTS = ("src", "public", "index.html", "package-lock.json", "vite.config.ts")
STARTUP_TIMEOUT_S = 30.0


def newest_mtime(paths: list[Path]) -> float:
    """Latest modification time of any file under the given paths."""
    newest = 0.0
    for path in paths:
        files = path.rglob("*") if path.is_dir() else [path]
        for file in files:
            if file.is_file():
                newest = max(newest, file.stat().st_mtime)
    return newest


def build_is_stale() -> bool:
    """True when dist/ is missing or older than any frontend source."""
    index = FRONTEND / "dist" / "index.html"
    if not index.is_file():
        return True
    return newest_mtime([FRONTEND / p for p in BUILD_INPUTS]) > index.stat().st_mtime


def probe(host: str, port: int) -> Literal["free", "planbox", "other"]:
    """Tells whether the port is free, already serving PlanBox, or taken by something else."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        if sock.connect_ex((host, port)) != 0:
            return "free"
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/api/health", timeout=2) as response:
            body = json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError):
        return "other"
    is_planbox = isinstance(body, dict) and "schema_versions" in body
    return "planbox" if is_planbox else "other"


def prepare_frontend(*, build: bool) -> bool:
    """Makes sure there is a frontend to serve; rebuilds it on a dev PC when stale.

    Without Node.js (runtime install) the prebuilt frontend/dist is used as is.

    Returns:
        False when there is nothing to serve.
    """
    if install_mode() == "runtime":
        if not has_built_frontend():
            print(NO_FRONTEND_MESSAGE)
            return False
        if not is_prebuilt_release():
            print("Note: Node.js is not available, so frontend/dist is served as it is;")
            print("it may be older than the source code.")
        return True
    if build and build_is_stale():
        heading("Building the frontend")
        run([npm(), "run", "build", "--silent"], cwd=FRONTEND)
    return True


def serve(*, open_browser: bool, build: bool = True) -> int:
    """Runs PlanBox until it is shut down (from the app or with Ctrl+C).

    Args:
        open_browser: Open the app in its own window once the server answers
            (see app_window.py). The window closes when the server stops, and
            closing the window stops the server.
        build: Rebuild the frontend first if its sources changed.

    Returns:
        A process exit code.
    """
    import uvicorn  # noqa: PLC0415 - needs the venv

    from planbox.config import HOST, load_settings  # noqa: PLC0415
    from planbox.main import create_app  # noqa: PLC0415

    settings = load_settings("serve")
    url = f"http://{HOST}:{settings.port}"

    state = probe(HOST, settings.port)
    if state == "planbox":
        print(f"PlanBox is already running at {url}.")
        if open_browser:
            open_app(url, settings.data_dir / "browser")
        return 0
    if state == "other":
        print(f"Port {settings.port} is used by another program. Set `port` in")
        print("private_data/settings.toml (or PLANBOX_PORT) to a free port.")
        return 1

    if not prepare_frontend(build=build):
        return 1

    server: uvicorn.Server | None = None

    def request_shutdown() -> None:
        if server is not None:
            server.should_exit = True

    app = create_app(settings, request_shutdown=request_shutdown)
    server = uvicorn.Server(uvicorn.Config(app, host=HOST, port=settings.port, log_level="warning"))

    heading(f"PlanBox on {url}")
    print(f"Database: {settings.db_path}")
    print("Stop it with the power button in the app, by closing its window, or Ctrl+C here.")
    windows: list[subprocess.Popen[bytes]] = []
    if open_browser:
        profile = settings.data_dir / "browser"
        threading.Thread(
            target=_open_when_ready,
            args=(server, url, profile, windows, request_shutdown),
            daemon=True,
        ).start()
    server.run()
    for window in windows:
        close_app(window)
    print("PlanBox stopped.")
    return 0


def _open_when_ready(
    server: object,
    url: str,
    profile: Path,
    windows: list[subprocess.Popen[bytes]],
    request_shutdown: Callable[[], None],
) -> None:
    """Opens the app window once the server answers, and stops the server when it closes."""
    deadline = time.monotonic() + STARTUP_TIMEOUT_S
    while time.monotonic() < deadline:
        if getattr(server, "started", False):
            window = open_app(url, profile)
            if window is not None:
                windows.append(window)
                closed = wait_until_closed(window)
                if closed and not getattr(server, "should_exit", False):
                    print("The PlanBox window was closed.")
                    request_shutdown()
            return
        time.sleep(0.05)
    print(f"PlanBox did not start within {STARTUP_TIMEOUT_S:.0f} s; open {url} yourself.")


def main() -> int:
    """Entry point."""
    ensure_venv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--open", action="store_true", help="open the app in the browser")
    parser.add_argument("--no-build", action="store_true", help="do not rebuild the frontend")
    args = parser.parse_args()
    return serve(open_browser=args.open, build=not args.no_build)


if __name__ == "__main__":
    sys.exit(main())
