r"""First-time setup (safe to re-run): .venv, Python packages, and on a dev PC the frontend.

Usage:
    py scripts\setup.py             picks the mode: dev with Node.js, runtime without
    py scripts\setup.py --runtime   force the runtime-only install

Dev (Node.js available): runtime packages plus the dev group (pinned by
requirements.lock.txt), an editable install, `npm ci` and the API types.

Runtime (no Node.js, e.g. from a release zip): only the packages in
requirements.lock.txt, and the prebuilt frontend/dist. Works with the pip
that ships with Python 3.12.
"""

import argparse
import subprocess
import sys
import venv

from _common import (
    FRONTEND,
    LOCK_FILE,
    NO_FRONTEND_MESSAGE,
    ROOT,
    VENV,
    VENV_PYTHON,
    InstallMode,
    has_built_frontend,
    heading,
    install_mode,
    npm,
    run,
    write_install_marker,
)

MINIMUM = (3, 12)
PIP = [str(VENV_PYTHON), "-m", "pip", "--disable-pip-version-check"]


def install_python_packages(mode: InstallMode) -> None:
    """Creates .venv if needed and installs the packages for the mode."""
    heading(f"Python environment (.venv, {mode} install)")
    if not VENV_PYTHON.is_file():
        venv.EnvBuilder(with_pip=True).create(VENV)
        print(f"Created {VENV}")
    if mode == "runtime":
        run([*PIP, "install", "--quiet", "-r", str(LOCK_FILE)])
    else:
        # `--group` needs pip 25.1+, so upgrade first; the lock pins the runtime packages.
        run([*PIP, "install", "--quiet", "--upgrade", "pip"])
        run([*PIP, "install", "--quiet", "-c", str(LOCK_FILE), "-e", ".", "--group", "dev"])
    write_install_marker(mode)


def main() -> int:
    """Entry point."""
    if sys.version_info[:2] < MINIMUM:
        found = f"{sys.version_info.major}.{sys.version_info.minor}"
        sys.exit(f"PlanBox needs Python 3.12 or newer (found {found}).")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", action="store_true", help="install only what is needed to run")
    mode: InstallMode = "runtime" if parser.parse_args().runtime else install_mode()

    if mode == "runtime" and not has_built_frontend():
        sys.exit(NO_FRONTEND_MESSAGE)

    install_python_packages(mode)

    if mode == "dev":
        heading("Frontend dependencies")
        lockfile = FRONTEND / "package-lock.json"
        run(
            [npm(), "ci" if lockfile.is_file() else "install", "--no-fund", "--no-audit"],
            cwd=FRONTEND,
        )
        heading("API types")
        run([str(VENV_PYTHON), str(ROOT / "scripts" / "gen_api.py")])

    heading("Done")
    print("Start PlanBox:              py main.py")
    if mode == "dev":
        print("Start the dev environment:  py scripts\\dev.py")
        print("Run all tests:              py scripts\\test.py")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)
