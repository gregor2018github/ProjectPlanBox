"""The launcher scripts: lock check, install marker and mode, runtime frontend, app window, exe."""

import struct
import subprocess
import sys
from pathlib import Path

import pytest

from planbox.config import app_paths

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import _common  # noqa: E402
import app_window  # noqa: E402
import launcher  # noqa: E402
import lock  # noqa: E402
import package  # noqa: E402
import serve  # noqa: E402


@pytest.fixture
def fake_install(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Points the install paths at a temp folder with a lock file and a .venv python."""
    lock_file = tmp_path / "requirements.lock.txt"
    lock_file.write_text("fastapi==1.0\n", encoding="utf-8")
    venv = tmp_path / ".venv"
    python = venv / "Scripts" / "python.exe"
    python.parent.mkdir(parents=True)
    python.write_text("", encoding="utf-8")
    monkeypatch.setattr(_common, "LOCK_FILE", lock_file)
    monkeypatch.setattr(_common, "VENV_PYTHON", python)
    monkeypatch.setattr(_common, "INSTALL_MARKER", venv / "planbox-install.json")
    return tmp_path


def test_install_marker_tracks_mode_and_lock(fake_install: Path) -> None:
    """Reinstall when the lock changes; a dev install also serves runtime use."""
    assert not _common.install_is_current("runtime")

    _common.write_install_marker("runtime")
    assert _common.install_is_current("runtime")
    assert not _common.install_is_current("dev")

    (fake_install / "requirements.lock.txt").write_text("fastapi==2.0\n", encoding="utf-8")
    assert not _common.install_is_current("runtime")

    _common.write_install_marker("dev")
    assert _common.install_is_current("runtime")
    assert _common.install_is_current("dev")


def test_line_endings_do_not_count_as_a_lock_change(fake_install: Path) -> None:
    """A CRLF checkout of the same lock needs no reinstall."""
    _common.write_install_marker("runtime")
    (fake_install / "requirements.lock.txt").write_bytes(b"fastapi==1.0\r\n")

    assert _common.install_is_current("runtime")


def test_mode_needs_both_node_and_frontend_sources(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A release zip (no package.json) stays runtime even where npm exists."""
    monkeypatch.setattr(_common, "FRONTEND", tmp_path)
    monkeypatch.setattr(_common, "find_npm", lambda: "npm")
    assert _common.install_mode() == "runtime"

    (tmp_path / "package.json").write_text("{}", encoding="utf-8")
    assert _common.install_mode() == "dev"

    monkeypatch.setattr(_common, "find_npm", lambda: None)
    assert _common.install_mode() == "runtime"


def test_lock_check_reports_drift(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """--check fails when pyproject's pins and the lock disagree."""
    lock_file = tmp_path / "requirements.lock.txt"
    monkeypatch.setattr(lock, "LOCK_FILE", lock_file)
    monkeypatch.setattr(lock, "declared_pins", lambda: {"fastapi": "1.0", "pydantic": "2.0"})

    lock_file.write_text("# header\nFastAPI==1.0\npydantic==2.0\nstarlette==9\n", encoding="utf-8")
    assert lock.check() == 0

    lock_file.write_text("fastapi==1.0\npydantic==1.9\n", encoding="utf-8")
    assert lock.check() == 1


def test_real_lock_matches_pyproject() -> None:
    """The committed lock covers every pinned runtime dependency."""
    assert lock.check() == 0


def test_runtime_without_dist_refuses_to_start(monkeypatch: pytest.MonkeyPatch) -> None:
    """No Node.js and no built frontend: explain instead of serving a blank page."""
    monkeypatch.setattr(serve, "install_mode", lambda: "runtime")
    monkeypatch.setattr(serve, "has_built_frontend", lambda: False)

    assert serve.prepare_frontend(build=True) is False


def test_runtime_with_release_dist_never_builds(monkeypatch: pytest.MonkeyPatch) -> None:
    """A release install serves its prebuilt frontend and never calls npm."""
    monkeypatch.setattr(serve, "install_mode", lambda: "runtime")
    monkeypatch.setattr(serve, "has_built_frontend", lambda: True)
    monkeypatch.setattr(serve, "is_prebuilt_release", lambda: True)

    def no_npm() -> str:
        raise AssertionError("npm must not be used in runtime mode")

    monkeypatch.setattr(serve, "npm", no_npm)

    assert serve.prepare_frontend(build=True) is True


def test_package_allowlist_never_ships_private_or_dev_files(tmp_path: Path) -> None:
    """The zip holds the runtime only, even when private and dev files sit next to it."""
    root = tmp_path / "repo"
    for name in package.ROOT_FILES:
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_text("x", encoding="utf-8")
    for rel in [
        "backend/planbox/main.py",
        "backend/planbox/__pycache__/main.cpython-314.pyc",
        "backend/tests/test_x.py",
        "private_data/planbox.db",
        "frontend/node_modules/x/index.js",
        "scripts/dev.py",
        *[f"scripts/{name}" for name in package.RUNTIME_SCRIPTS],
    ]:
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text("x", encoding="utf-8")
    dist = tmp_path / "dist"
    for rel in ["index.html", "BUILD_INFO.json", "assets/app.js", "assets/app.js.map"]:
        (dist / rel).parent.mkdir(parents=True, exist_ok=True)
        (dist / rel).write_text("x", encoding="utf-8")

    names = [arcname for _, arcname in package.collect(root, dist)]
    package.verify(names)

    assert "PlanBox/backend/planbox/main.py" in names
    assert "PlanBox/frontend/dist/assets/app.js" in names
    assert not [n for n in names if "private_data" in n or "node_modules" in n]
    assert not [n for n in names if n.endswith((".map", ".pyc")) or "/tests/" in n]
    assert "PlanBox/scripts/dev.py" not in names


def test_package_verify_rejects_leaks_and_gaps() -> None:
    """A forbidden path or a missing essential file stops packaging."""
    with pytest.raises(SystemExit, match="forbidden"):
        package.verify(["PlanBox/private_data/planbox.db"])
    with pytest.raises(SystemExit, match="missing"):
        package.verify(["PlanBox/main.py"])


def test_app_browser_prefers_chrome_then_edge(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """On Windows the standard install folders are searched, Chrome first."""
    monkeypatch.setattr(app_window.sys, "platform", "win32")

    def not_on_path(_: str) -> None:
        return None

    monkeypatch.setattr(app_window.shutil, "which", not_on_path)
    edge = tmp_path / "x86" / "Microsoft" / "Edge" / "Application" / "msedge.exe"
    edge.parent.mkdir(parents=True)
    edge.write_text("", encoding="utf-8")
    env = {"ProgramFiles(x86)": str(tmp_path / "x86"), "LOCALAPPDATA": str(tmp_path / "local")}
    assert app_window.find_app_browser(env) == edge

    chrome = tmp_path / "local" / "Google" / "Chrome" / "Application" / "chrome.exe"
    chrome.parent.mkdir(parents=True)
    chrome.write_text("", encoding="utf-8")
    assert app_window.find_app_browser(env) == chrome
    # os.environ upper-cases names on Windows.
    assert app_window.find_app_browser({k.upper(): v for k, v in env.items()}) == chrome

    assert app_window.find_app_browser({}) is None


def test_app_window_runs_as_its_own_browser(tmp_path: Path) -> None:
    """App mode plus a private profile: a separate process that can be closed alone."""
    command = app_window.app_window_command(
        Path("chrome.exe"), "http://127.0.0.1:8765", tmp_path / "browser"
    )

    assert "--app=http://127.0.0.1:8765" in command
    assert f"--user-data-dir={tmp_path / 'browser'}" in command


def test_browser_env_falls_back_to_the_default_browser(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """BROWSER=echo (tests) never starts a real browser window."""
    opened: list[str] = []
    monkeypatch.setenv("BROWSER", "echo")
    monkeypatch.setattr(app_window.webbrowser, "open", opened.append)

    def no_browser(_: object = None) -> Path:
        raise AssertionError("must not look for an app browser")

    monkeypatch.setattr(app_window, "find_app_browser", no_browser)

    assert app_window.open_app("http://127.0.0.1:1", tmp_path / "browser") is None
    assert opened == ["http://127.0.0.1:1"]


def test_close_app_ends_a_process_that_ignores_the_polite_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A window that does not close by itself is killed after the timeout."""
    monkeypatch.setattr(app_window, "CLOSE_TIMEOUT_S", 0.5)
    process = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(60)"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    app_window.close_app(process)

    assert process.poll() is not None
    app_window.close_app(process)  # already gone: nothing to do


def test_a_quick_exit_is_a_handover_not_a_close(monkeypatch: pytest.MonkeyPatch) -> None:
    """A browser that only passed the URL on must not stop PlanBox; a real close does."""
    quick = subprocess.Popen([sys.executable, "-c", "pass"])
    assert app_window.wait_until_closed(quick) is False

    monkeypatch.setattr(app_window, "HANDOFF_S", 0.0)
    closed = subprocess.Popen([sys.executable, "-c", "pass"])
    assert app_window.wait_until_closed(closed) is True


def test_the_exe_keeps_data_next_to_itself_and_serves_its_bundled_frontend(
    tmp_path: Path,
) -> None:
    """PlanBox.exe: private_data/ beside the exe, the frontend from inside it."""
    exe = tmp_path / "PlanBox" / "PlanBox.exe"
    bundle = tmp_path / "PlanBox" / "_internal"
    source = tmp_path / "repo" / "backend" / "planbox" / "config.py"

    assert app_paths(frozen=True, executable=exe, bundle=bundle, source_file=source) == (
        exe.parent.resolve(),
        bundle / "frontend" / "dist",
    )
    root = (tmp_path / "repo").resolve()
    assert app_paths(frozen=False, executable=exe, bundle=None, source_file=source) == (
        root,
        root / "frontend" / "dist",
    )


def test_the_exe_serves_its_frontend_without_building(monkeypatch: pytest.MonkeyPatch) -> None:
    """Frozen, there is no frontend/dist on disk to check and no npm to call."""
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(serve, "has_built_frontend", lambda: False)

    assert serve.prepare_frontend(build=True) is True


def test_launcher_log_rolls_over_once_it_grows(tmp_path: Path) -> None:
    """The log is created with its folder, and a too-large one moves to planbox.log.1."""
    data = tmp_path / "private_data"
    launcher.open_log(data).close()
    log = data / launcher.LOG_NAME
    assert "PlanBox.exe started" in log.read_text(encoding="utf-8")

    log.write_text("x" * (launcher.LOG_LIMIT_BYTES + 1), encoding="utf-8")
    launcher.open_log(data).close()

    assert (data / "planbox.log.1").stat().st_size == launcher.LOG_LIMIT_BYTES + 1
    assert log.stat().st_size < launcher.LOG_LIMIT_BYTES


def test_launcher_shows_why_the_start_failed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A failed start logs the error and shows this run's last lines in a message box."""
    data = tmp_path / "data"
    data.mkdir()
    (data / launcher.LOG_NAME).write_text("an older run went wrong\n", encoding="utf-8")
    monkeypatch.setenv("PLANBOX_DATA_DIR", str(data))
    monkeypatch.setattr(sys, "argv", ["PlanBox.exe"])
    monkeypatch.setattr(sys, "stdout", sys.stdout)  # restored after main() swaps them
    monkeypatch.setattr(sys, "stderr", sys.stderr)
    shown: list[str] = []
    monkeypatch.setattr(launcher, "show_error", shown.append)

    def broken(*, open_browser: bool, build: bool) -> int:
        assert open_browser
        assert not build
        raise RuntimeError("migration checksum mismatch")

    monkeypatch.setattr(serve, "serve", broken)

    assert launcher.main() == 1
    assert "RuntimeError: migration checksum mismatch" in shown[0]
    assert "older run" not in shown[0]
    assert str(data / launcher.LOG_NAME) in shown[0]
    assert "migration checksum mismatch" in (data / launcher.LOG_NAME).read_text(encoding="utf-8")


def test_launcher_without_a_window_and_a_clean_stop_shows_nothing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """``--no-window`` only serves; a normal stop never shows a message box."""
    monkeypatch.setenv("PLANBOX_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(sys, "argv", ["PlanBox.exe", "--no-window"])
    monkeypatch.setattr(sys, "stdout", sys.stdout)
    monkeypatch.setattr(sys, "stderr", sys.stderr)
    monkeypatch.setattr(launcher, "show_error", pytest.fail)
    calls: list[bool] = []

    def fine(*, open_browser: bool, build: bool) -> int:
        calls.append(open_browser)
        return 0

    monkeypatch.setattr(serve, "serve", fine)

    assert launcher.main() == 0
    assert calls == [False]


def test_app_icon_becomes_a_windows_icon() -> None:
    """The PWA icon converts to an .ico with every size, without Pillow."""
    png = (SCRIPTS.parent / "frontend" / "public" / "icon-512.png").read_bytes()
    size, pixels = package.png_rgba(png)
    assert size == 512
    assert len(pixels) == 512 * 512 * 4

    ico = package.png_to_ico(png)
    reserved, kind, count = struct.unpack("<HHH", ico[:6])
    assert (reserved, kind, count) == (0, 1, len(package.ICON_SIZES))
    for index, side in enumerate(package.ICON_SIZES):
        width, _, _, _, _, bits, length, offset = struct.unpack(
            "<BBBBHHII", ico[6 + 16 * index : 22 + 16 * index]
        )
        assert width == side % 256
        assert bits == 32
        assert package.png_rgba(ico[offset : offset + length])[0] == side


def test_shrinking_averages_colour_by_alpha() -> None:
    """A transparent pixel adds no colour; the PNG round trip keeps every byte."""
    red, clear = bytes((255, 0, 0, 255)), bytes((0, 0, 255, 0))
    pixels = red + clear + red + clear
    assert package.shrink(pixels, 2, 2) == bytes((255, 0, 0, 127))
    assert package.png_rgba(package.encode_png(pixels, 2)) == (2, pixels)


def test_exe_verify_rejects_leaks_and_gaps() -> None:
    """Data in the exe build, or a missing exe, migration or frontend, stops packaging."""
    complete = [
        "PlanBox/PlanBox.exe",
        "PlanBox/_internal/frontend/dist/index.html",
        "PlanBox/_internal/frontend/dist/BUILD_INFO.json",
        "PlanBox/_internal/planbox/core/migrations/0001_create_tags.sql",
    ]
    package.verify_exe(complete)
    with pytest.raises(SystemExit, match="forbidden"):
        package.verify_exe([*complete, "PlanBox/private_data/planbox.db"])
    with pytest.raises(SystemExit, match="forbidden"):
        package.verify_exe([*complete, "PlanBox/_internal/backup.db-wal"])
    with pytest.raises(SystemExit, match="missing"):
        package.verify_exe(complete[1:])
