r"""Builds the PlanBox Android app (and installs it on a connected phone).

Usage:
    py scripts\android.py            build android\app\build\outputs\apk\debug\app-debug.apk
    py scripts\android.py --install  also install it on the phone (USB debugging) or emulator
    py scripts\android.py --open     prepare the project and open it in Android Studio instead

Needs Node.js and Android Studio (its JDK and Android SDK). The app keeps
its own database on the phone; see README, "Phone app".
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

from _common import FRONTEND, ensure_venv, heading, npm, run

ANDROID = FRONTEND / "android"
APK = ANDROID / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"


def android_env() -> dict[str, str]:
    """Android Studio's JDK and the Android SDK, from their usual places.

    Android Studio's bundled JDK wins over JAVA_HOME: Capacitor 8 needs Java
    21, and a system JAVA_HOME is often older.
    """
    env: dict[str, str] = {}
    for studio in (
        Path(r"C:\Program Files\Android\Android Studio\jbr"),
        Path("/Applications/Android Studio.app/Contents/jbr/Contents/Home"),
        Path("/opt/android-studio/jbr"),
    ):
        if studio.is_dir():
            env["JAVA_HOME"] = str(studio)
            break
    if "ANDROID_HOME" not in os.environ:
        for sdk in (
            Path(os.environ.get("LOCALAPPDATA", "")) / "Android" / "Sdk",
            Path.home() / "Library" / "Android" / "sdk",
            Path.home() / "Android" / "Sdk",
        ):
            if sdk.is_dir():
                env["ANDROID_HOME"] = str(sdk)
                break
    return env


def adb(env: dict[str, str]) -> str:
    """The adb of the Android SDK."""
    sdk = env.get("ANDROID_HOME") or os.environ.get("ANDROID_HOME", "")
    found = Path(sdk) / "platform-tools" / ("adb.exe" if os.name == "nt" else "adb")
    return str(found) if found.is_file() else (shutil.which("adb") or "adb")


def main() -> int:
    """Entry point."""
    ensure_venv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", action="store_true", help="install on the connected device")
    parser.add_argument("--open", action="store_true", help="open the project in Android Studio")
    args = parser.parse_args()

    heading("Web app (device build)")
    run([npm(), "run", "build:device"], cwd=FRONTEND)
    heading("Capacitor sync")
    run([npm(), "exec", "--", "cap", "sync", "android"], cwd=FRONTEND)
    if args.open:
        run([npm(), "exec", "--", "cap", "open", "android"], cwd=FRONTEND)
        return 0

    env = android_env()
    heading("Gradle (debug APK)")
    gradle = str(ANDROID / ("gradlew.bat" if os.name == "nt" else "gradlew"))
    run([gradle, "assembleDebug"], cwd=ANDROID, env=env)
    print(f"Built {APK}")
    if args.install:
        heading("Install")
        run([adb(env), "install", "-r", str(APK)], env=env)
    return 0


if __name__ == "__main__":
    sys.exit(main())
