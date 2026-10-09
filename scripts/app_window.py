"""Opens PlanBox in its own browser window, so stopping PlanBox can close it.

A web page cannot close its own tab once it has navigated, and never the
browser. So the launcher starts Chrome or Edge in app mode (one window, no
tabs or address bar) with a profile of its own and keeps the process. The
window and the server live and die together: stopping the server closes the
window, and closing the window stops the server. Without either browser, or when ``BROWSER`` is set
(tests use ``BROWSER=echo``), it falls back to the default browser.
"""

import os
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

CLOSE_TIMEOUT_S = 5.0
HANDOFF_S = 3.0
"""A browser that exits sooner only passed the URL to an instance already running."""

_WINDOWS_CANDIDATES = (
    ("ProgramFiles", r"Google\Chrome\Application\chrome.exe"),
    ("ProgramFiles(x86)", r"Google\Chrome\Application\chrome.exe"),
    ("LOCALAPPDATA", r"Google\Chrome\Application\chrome.exe"),
    ("ProgramFiles(x86)", r"Microsoft\Edge\Application\msedge.exe"),
    ("ProgramFiles", r"Microsoft\Edge\Application\msedge.exe"),
    ("LOCALAPPDATA", r"Microsoft\Edge\Application\msedge.exe"),
)
_PATH_CANDIDATES = (
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
)


def find_app_browser(env: dict[str, str] | None = None) -> Path | None:
    """Finds a browser with an app mode (Chrome, then Edge, then Chromium).

    Args:
        env: Environment to read install folders from (defaults to ``os.environ``).

    Returns:
        The executable, or None when there is none.
    """
    # Windows variable names are case-insensitive (os.environ upper-cases them).
    folders = {name.upper(): value for name, value in (os.environ if env is None else env).items()}
    if sys.platform == "win32":
        for var, relative in _WINDOWS_CANDIDATES:
            base = folders.get(var.upper())
            if base and (Path(base) / relative).is_file():
                return Path(base) / relative
    for name in _PATH_CANDIDATES:
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def app_window_command(browser: Path, url: str, profile_dir: Path) -> list[str]:
    """The command line that opens ``url`` as a standalone app window.

    Args:
        browser: Chrome/Edge executable.
        url: The PlanBox address.
        profile_dir: The window's own profile, so it runs as a separate
            browser process that can be closed without touching other windows.

    Returns:
        The argument list for ``subprocess``.
    """
    return [
        str(browser),
        f"--app={url}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
    ]


def open_app(url: str, profile_dir: Path) -> subprocess.Popen[bytes] | None:
    """Opens PlanBox in an app window, or in the default browser as a fallback.

    Args:
        url: The PlanBox address.
        profile_dir: Where the app window keeps its browser profile.

    Returns:
        The app window's process (to close later), or None when the default
        browser was used.
    """
    browser = None if os.environ.get("BROWSER") else find_app_browser()
    if browser is None:
        webbrowser.open(url)
        return None
    profile_dir.mkdir(parents=True, exist_ok=True)
    try:
        return subprocess.Popen(
            app_window_command(browser, url, profile_dir),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        webbrowser.open(url)
        return None


def wait_until_closed(process: subprocess.Popen[bytes]) -> bool:
    """Blocks until the app window's browser process exits.

    Call it right after :func:`open_app`. When the profile is already open in
    another browser process (say, a window left over from an earlier run),
    the new process hands the URL over and exits at once; that is not a close.

    Args:
        process: What :func:`open_app` returned.

    Returns:
        True when the user closed the window, False after a quick hand-over.
    """
    started = time.monotonic()
    process.wait()
    return time.monotonic() - started >= HANDOFF_S


def close_app(process: subprocess.Popen[bytes]) -> None:
    """Closes the app window gracefully, and forcibly if it does not react.

    A graceful close lets the browser save its profile, so it does not offer to
    "restore pages" on the next start.

    Args:
        process: What :func:`open_app` returned.
    """
    if process.poll() is not None:
        return
    if sys.platform == "win32":
        # Without /F, taskkill asks the window to close (WM_CLOSE), like clicking X.
        subprocess.run(
            ["taskkill", "/PID", str(process.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        process.terminate()
    try:
        process.wait(timeout=CLOSE_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
