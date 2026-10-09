"""The install scripts: lock-file check, install marker, mode detection, runtime frontend."""

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import _common  # noqa: E402
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
