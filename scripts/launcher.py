r"""The entry point of PlanBox.exe (built by ``py scripts\package.py --exe``).

The exe brings its own Python and packages, so there is no .venv and no
setup step. It has no console window: everything PlanBox prints goes to
``private_data/planbox.log``, and when PlanBox cannot start, a message box
shows why. Stop it with the power button in the app or by closing its window.

Usage:
    PlanBox.exe               starts PlanBox and opens its app window
    PlanBox.exe --no-window   only the server (the build's smoke test uses this)
"""

import os
import sys
import time
import traceback
from pathlib import Path
from typing import TextIO

from planbox.config import PRIVATE_DATA_DIR

LOG_NAME = "planbox.log"
LOG_LIMIT_BYTES = 1_000_000
"""Past this size the log moves to planbox.log.1 (one old log is kept)."""
ERROR_LINES = 12


def open_log(data_dir: Path) -> TextIO:
    """Opens the log for appending, after moving a too-large one aside.

    Args:
        data_dir: The data folder; it is created when missing.

    Returns:
        The open log, line-buffered so it is current when PlanBox crashes.
    """
    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / LOG_NAME
    if path.is_file() and path.stat().st_size > LOG_LIMIT_BYTES:
        path.replace(path.with_name(LOG_NAME + ".1"))
    log = path.open("a", encoding="utf-8", buffering=1)
    log.write(f"\n== PlanBox.exe started {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    return log


def failure_message(log_path: Path, start: int) -> str:
    """The message box text: the end of what this run logged, and where the log is.

    Args:
        log_path: The log file.
        start: Its size before this run, so older runs are left out.

    Returns:
        Text for the message box.
    """
    with log_path.open(encoding="utf-8", errors="replace") as log:
        log.seek(start)
        lines = [line.rstrip() for line in log.read().splitlines() if line.strip()]
    tail = "\n".join(lines[-ERROR_LINES:])
    return f"PlanBox could not start.\n\n{tail}\n\nThe full log is in:\n{log_path}"


def show_error(message: str) -> None:
    """Shows a message box (on Windows; elsewhere the log has to do).

    Args:
        message: What to say.
    """
    if sys.platform == "win32":
        import ctypes  # noqa: PLC0415 - Windows only

        mb_iconerror = 0x10
        ctypes.windll.user32.MessageBoxW(None, message, "PlanBox", mb_iconerror)


def main() -> int:
    """Entry point."""
    data_dir = Path(os.environ.get("PLANBOX_DATA_DIR", PRIVATE_DATA_DIR))
    log = open_log(data_dir)
    start = log.tell()
    # A windowed exe has no stdout/stderr (both None); uvicorn's logging needs one.
    sys.stdout = sys.stderr = log
    try:
        from serve import serve  # noqa: PLC0415 - imports the app, which may fail

        code = serve(open_browser="--no-window" not in sys.argv[1:], build=False)
    except Exception:  # anything that stops the start goes to the log
        traceback.print_exc()
        code = 1
    log.flush()
    if code != 0:
        show_error(failure_message(Path(log.name), start))
    log.close()
    return code


if __name__ == "__main__":
    sys.exit(main())
