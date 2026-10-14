r"""Builds the release zip for PCs without Node.js (see README, "Runtime-only PC").

Usage:
    py scripts\package.py             writes release\PlanBox-<version>.zip
    py scripts\package.py --exe       also writes release\PlanBox-<version>-windows.zip
    py scripts\package.py --out DIR   writes them into DIR instead

The zip holds one folder, PlanBox/, with exactly what is needed to run:
main.py, pyproject.toml, requirements.lock.txt, README.md, LICENSE, the
backend package (no tests), the runtime scripts, and the built frontend
(no source maps). It never contains private_data, .venv, node_modules or
tests, so unpacking it over an existing install keeps your data.

With --exe (Windows only), PlanBox-<version>-windows.zip holds
PlanBox/PlanBox.exe and its _internal/ folder: a PyInstaller build (one
folder, no console) with its own Python, so that PC needs nothing installed.
It is built from .venv (which has PyInstaller) and smoke-tested on a scratch
data folder before it is zipped.
"""

import argparse
import importlib.util
import json
import os
import re
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
import zlib
from collections.abc import Iterable
from pathlib import Path

from _common import FRONTEND, ROOT, ensure_venv, heading, npm, run

TOP = "PlanBox"
ROOT_FILES = ("main.py", "pyproject.toml", "requirements.lock.txt", "README.md", "LICENSE")
RUNTIME_SCRIPTS = ("_common.py", "app_window.py", "setup.py", "serve.py", "migrate.py")
FORBIDDEN_PARTS = frozenset(
    {"private_data", ".venv", "node_modules", "tests", "__pycache__", ".git", "src", "e2e"}
)
DATA_SUFFIXES = (".db", ".db-wal", ".db-shm")
FORBIDDEN_SUFFIXES = (".map", ".pyc", *DATA_SUFFIXES)
EXE_NAME = "PlanBox"
EXE_FORBIDDEN_PARTS = frozenset({"private_data", ".venv", "node_modules", ".git"})
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ICON_SIZES = (256, 64, 32, 16)
RGBA = 4
"""Bytes per pixel."""
SUB, UP, AVERAGE, PAETH = 1, 2, 3, 4
"""PNG row filters (0 is none)."""
SMOKE_TIMEOUT_S = 60.0


def read_version() -> str:
    """The app version; pyproject.toml and planbox/__init__.py must agree."""
    init = (ROOT / "backend" / "planbox" / "__init__.py").read_text(encoding="utf-8")
    match = re.search(r'__version__ = "([^"]+)"', init)
    project = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    declared = re.search(r'^version = "([^"]+)"', project, re.MULTILINE)
    if match is None or declared is None or match[1] != declared[1]:
        sys.exit("Version mismatch between pyproject.toml and backend/planbox/__init__.py.")
    return match[1]


def git_commit() -> str:
    """Short commit hash, with +dirty when the tree has uncommitted changes."""
    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()
    dirty = subprocess.run(
        ["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True, check=False
    ).stdout.strip()
    return (commit or "unknown") + ("+dirty" if dirty else "")


def build_frontend(out_dir: Path, version: str) -> None:
    """Builds the frontend without source maps into ``out_dir`` and adds BUILD_INFO.json."""
    run([npm(), "run", "typecheck", "--silent"], cwd=FRONTEND)
    run(
        [
            npm(),
            "exec",
            "--",
            "vite",
            "build",
            "--outDir",
            str(out_dir),
            "--emptyOutDir",
            "--sourcemap",
            "false",
        ],
        cwd=FRONTEND,
    )
    info = {
        "version": version,
        "commit": git_commit(),
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "python_minimum": "3.12",
    }
    (out_dir / "BUILD_INFO.json").write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")


def is_forbidden(arcname: str) -> bool:
    """Tells whether a path inside the zip must never ship."""
    parts = arcname.split("/")
    return bool(FORBIDDEN_PARTS.intersection(parts)) or arcname.endswith(FORBIDDEN_SUFFIXES)


def collect(root: Path, dist: Path) -> list[tuple[Path, str]]:
    """Every (source file, path in zip) pair, from an allowlist."""
    entries: list[tuple[Path, str]] = []

    def add_tree(base: Path, prefix: str) -> None:
        for path in sorted(base.rglob("*")):
            if path.is_file():
                arcname = f"{TOP}/{prefix}/{path.relative_to(base).as_posix()}"
                if not is_forbidden(arcname):
                    entries.append((path, arcname))

    for name in ROOT_FILES:
        entries.append((root / name, f"{TOP}/{name}"))
    add_tree(root / "backend" / "planbox", "backend/planbox")
    for name in RUNTIME_SCRIPTS:
        entries.append((root / "scripts" / name, f"{TOP}/scripts/{name}"))
    add_tree(dist, "frontend/dist")
    return entries


def verify(arcnames: Iterable[str]) -> None:
    """Fails if anything forbidden slipped into the zip or something essential is missing."""
    names = set(arcnames)
    leaked = sorted(n for n in names if is_forbidden(n))
    if leaked:
        sys.exit(f"Refusing to package forbidden paths: {leaked[:5]}")
    required = {
        f"{TOP}/main.py",
        f"{TOP}/requirements.lock.txt",
        f"{TOP}/backend/planbox/main.py",
        f"{TOP}/frontend/dist/index.html",
        f"{TOP}/frontend/dist/BUILD_INFO.json",
        f"{TOP}/scripts/setup.py",
    }
    missing = sorted(required - names)
    if missing:
        sys.exit(f"The package is missing: {missing}")


def write_zip(target: Path, entries: list[tuple[Path, str]]) -> None:
    """Writes the zip with deterministic entry order."""
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source, arcname in sorted(entries, key=lambda e: e[1]):
            archive.write(source, arcname)


def png_rgba(data: bytes) -> tuple[int, bytes]:
    """Decodes a square, 8-bit RGBA, non-interlaced PNG (like the app icons).

    Args:
        data: The PNG file.

    Returns:
        The side length and the pixels, four bytes each, row by row.
    """
    if data[:8] != PNG_SIGNATURE:
        sys.exit("The app icon is not a PNG.")
    pos, size, compressed = 8, 0, b""
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos : pos + 8])
        body = data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if width != height or (depth, colour, interlace) != (8, 6, 0):
                sys.exit("The app icon must be a square, 8-bit RGBA, non-interlaced PNG.")
            size = width
        elif kind == b"IDAT":
            compressed += body
        pos += 12 + length
    raw = zlib.decompress(compressed)
    stride = size * RGBA
    pixels = bytearray()
    previous = bytearray(stride)
    for y in range(size):
        start = y * (stride + 1)
        method = raw[start]
        line = bytearray(raw[start + 1 : start + 1 + stride])
        for i in range(stride):
            left = line[i - RGBA] if i >= RGBA else 0
            up = previous[i]
            up_left = previous[i - RGBA] if i >= RGBA else 0
            if method == SUB:
                line[i] = (line[i] + left) & 0xFF
            elif method == UP:
                line[i] = (line[i] + up) & 0xFF
            elif method == AVERAGE:
                line[i] = (line[i] + (left + up) // 2) & 0xFF
            elif method == PAETH:
                guess = left + up - up_left
                pa, pb, pc = abs(guess - left), abs(guess - up), abs(guess - up_left)
                nearest = left if pa <= pb and pa <= pc else up if pb <= pc else up_left
                line[i] = (line[i] + nearest) & 0xFF
        pixels += line
        previous = line
    return size, bytes(pixels)


def shrink(pixels: bytes, size: int, factor: int) -> bytes:
    """Scales RGBA pixels down by a whole factor, averaging colour by alpha.

    Args:
        pixels: Square RGBA pixels.
        size: Their side length.
        factor: How many source pixels make one target pixel, per side.

    Returns:
        The smaller pixels.
    """
    target = size // factor
    out = bytearray()
    for y in range(target):
        for x in range(target):
            red = green = blue = alpha = 0
            for dy in range(factor):
                row = ((y * factor + dy) * size + x * factor) * 4
                for i in range(row, row + factor * 4, 4):
                    weight = pixels[i + 3]
                    red += pixels[i] * weight
                    green += pixels[i + 1] * weight
                    blue += pixels[i + 2] * weight
                    alpha += weight
            if alpha:
                out += bytes((red // alpha, green // alpha, blue // alpha, alpha // factor**2))
            else:
                out += bytes(4)
    return bytes(out)


def encode_png(pixels: bytes, size: int) -> bytes:
    """Encodes square RGBA pixels as a PNG."""

    def chunk(kind: bytes, body: bytes) -> bytes:
        crc = struct.pack(">I", zlib.crc32(kind + body))
        return struct.pack(">I", len(body)) + kind + body + crc

    stride = size * 4
    rows = b"".join(b"\0" + pixels[y * stride : (y + 1) * stride] for y in range(size))
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        PNG_SIGNATURE
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows, 9))
        + chunk(b"IEND", b"")
    )


def png_to_ico(data: bytes) -> bytes:
    """A Windows icon (PNG-compressed sizes) from the app's PNG icon.

    PyInstaller needs an .ico on Windows; converting a PNG itself would need
    Pillow, which nothing else uses.

    Args:
        data: A square RGBA PNG whose side the icon sizes divide.

    Returns:
        The .ico file.
    """
    size, pixels = png_rgba(data)
    sides = [side for side in ICON_SIZES if size % side == 0]
    if not sides:
        sys.exit(f"The app icon ({size} px) cannot be scaled to {ICON_SIZES}.")
    images = [encode_png(shrink(pixels, size, size // side), side) for side in sides]
    offset = 6 + 16 * len(images)
    entries = b""
    for side, image in zip(sides, images, strict=True):
        # Width and height are one byte each; 0 means 256.
        entries += struct.pack("<BBBBHHII", side % 256, side % 256, 0, 0, 1, 32, len(image), offset)
        offset += len(image)
    return struct.pack("<HHH", 0, 1, len(images)) + entries + b"".join(images)


def build_exe(dist: Path, work: Path) -> Path:
    """Builds PlanBox.exe with PyInstaller: one folder, no console.

    Args:
        dist: The built frontend; it goes inside the exe.
        work: A scratch folder for the build.

    Returns:
        The folder holding PlanBox.exe and _internal/.
    """
    icon = work / "PlanBox.ico"
    icon.write_bytes(png_to_ico((FRONTEND / "public" / "icon-512.png").read_bytes()))
    run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--log-level",
            "WARN",
            "--onedir",
            "--windowed",
            "--name",
            EXE_NAME,
            "--icon",
            str(icon),
            "--distpath",
            str(work / "dist"),
            "--workpath",
            str(work / "build"),
            "--specpath",
            str(work),
            "--paths",
            str(ROOT / "backend"),
            "--paths",
            str(ROOT / "scripts"),
            "--collect-submodules",
            "planbox",
            "--collect-data",
            "planbox",  # the migrations (.sql)
            "--add-data",
            f"{dist}{os.pathsep}frontend/dist",
            str(ROOT / "scripts" / "launcher.py"),
        ]
    )
    return work / "dist" / EXE_NAME


def collect_exe(folder: Path) -> list[tuple[Path, str]]:
    """Every (source file, path in zip) pair of the exe build."""
    return [
        (path, f"{TOP}/{path.relative_to(folder).as_posix()}")
        for path in sorted(folder.rglob("*"))
        if path.is_file()
    ]


def verify_exe(arcnames: Iterable[str]) -> None:
    """Fails if data slipped into the exe build or something essential is missing."""
    names = set(arcnames)
    leaked = sorted(
        n
        for n in names
        if EXE_FORBIDDEN_PARTS.intersection(n.split("/")) or n.endswith(DATA_SUFFIXES)
    )
    if leaked:
        sys.exit(f"Refusing to package forbidden paths: {leaked[:5]}")
    internal = f"{TOP}/_internal"
    required = {
        f"{TOP}/{EXE_NAME}.exe",
        f"{internal}/frontend/dist/index.html",
        f"{internal}/frontend/dist/BUILD_INFO.json",
        f"{internal}/planbox/core/migrations/0001_create_tags.sql",
    }
    missing = sorted(required - names)
    if missing:
        sys.exit(f"The exe build is missing: {missing}")


def free_port() -> int:
    """A loopback port nothing listens on right now."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port: int = sock.getsockname()[1]
        return port


def smoke_test(exe: Path, scratch: Path) -> None:
    """Starts the built exe on a scratch data folder, checks it serves, then shuts it down.

    Catches what only shows in the frozen app: a module PyInstaller missed,
    the migrations, the time zone data, the bundled frontend.

    Args:
        exe: PlanBox.exe.
        scratch: An empty folder for its data (never private_data).
    """
    port = free_port()
    env = {**os.environ, "PLANBOX_DATA_DIR": str(scratch), "PLANBOX_PORT": str(port)}
    log = scratch / "planbox.log"

    def fail(reason: str) -> None:
        details = log.read_text(encoding="utf-8") if log.is_file() else "(no log)"
        sys.exit(f"Smoke test failed: {reason}\n{details}")

    process = subprocess.Popen([str(exe), "--no-window"], env=env)
    try:
        deadline = time.monotonic() + SMOKE_TIMEOUT_S
        health: object = None
        while health is None:
            if process.poll() is not None:
                fail(f"PlanBox.exe exited with {process.returncode}.")
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{port}/api/health", timeout=2
                ) as response:
                    health = json.load(response)
            except (urllib.error.URLError, ConnectionError, TimeoutError):
                if time.monotonic() > deadline:
                    fail(f"no answer within {SMOKE_TIMEOUT_S:.0f} s.")
                time.sleep(0.25)
        if not isinstance(health, dict) or "schema_versions" not in health:
            fail(f"unexpected health answer {health!r}.")
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/todos", timeout=5) as response:
            if b"<html" not in response.read().lower():
                fail("the app page is not served.")
        shutdown = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/shutdown",
            data=b'{"confirm": true}',
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(shutdown, timeout=5):  # noqa: S310 - the http URL above
            pass
        if process.wait(timeout=SMOKE_TIMEOUT_S) != 0:
            fail(f"PlanBox.exe stopped with {process.returncode}.")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
    print(f"PlanBox.exe started, served the app and shut down (port {port}).")


def package_exe(dist: Path, work: Path, target: Path) -> int:
    """Builds, checks, smoke-tests and zips PlanBox.exe.

    Args:
        dist: The built frontend.
        work: A scratch folder for the build.
        target: The zip to write.

    Returns:
        The number of files in the zip.
    """
    folder = build_exe(dist, work)
    entries = collect_exe(folder)
    verify_exe(arcname for _, arcname in entries)
    heading("Smoke test")
    scratch = work / "smoke-data"
    scratch.mkdir()
    smoke_test(folder / f"{EXE_NAME}.exe", scratch)
    heading("Writing the windows zip")
    write_zip(target, entries)
    return len(entries)


def report(target: Path, files: int) -> None:
    """Prints what was written."""
    size = target.stat().st_size
    shown = f"{size // 1024} KB" if size < 10 * 1024 * 1024 else f"{size // (1024 * 1024)} MB"
    print(f"{target} ({shown}, {files} files)")


def main() -> int:
    """Entry point."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "release", help="output folder")
    parser.add_argument("--exe", action="store_true", help="also build the windows exe zip")
    args = parser.parse_args()
    if args.exe:
        if sys.platform != "win32":
            sys.exit("PlanBox.exe can only be built on Windows.")
        ensure_venv()  # the exe bundles this interpreter and the packages in .venv
        if importlib.util.find_spec("PyInstaller") is None:
            sys.exit("PyInstaller is missing from .venv. Run `py scripts\\setup.py`.")

    version = read_version()
    out: Path = args.out
    with tempfile.TemporaryDirectory(prefix="planbox-dist-") as tmp:
        dist = Path(tmp) / "dist"
        heading(f"Building the frontend for {version}")
        build_frontend(dist, version)
        entries = collect(ROOT, dist)
        verify(arcname for _, arcname in entries)
        heading("Writing the zip")
        target = out / f"PlanBox-{version}.zip"
        write_zip(target, entries)
        report(target, len(entries))
        if args.exe:
            heading("Building PlanBox.exe")
            work = Path(tmp) / "exe"
            work.mkdir()
            exe_target = out / f"PlanBox-{version}-windows.zip"
            report(exe_target, package_exe(dist, work, exe_target))
    return 0


if __name__ == "__main__":
    sys.exit(main())
