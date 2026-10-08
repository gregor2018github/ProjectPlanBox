"""Running several long-lived processes together (dev servers)."""

import os
import subprocess
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Service:
    """A process to run alongside others."""

    name: str
    cmd: Sequence[str]
    cwd: Path
    env: Mapping[str, str]


def _kill_tree(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        # npm.cmd starts node through cmd.exe; terminate() would orphan node.
        subprocess.run(
            ["taskkill", "/T", "/F", "/PID", str(process.pid)],
            capture_output=True,
            check=False,
        )
    else:
        process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def run_together(services: Sequence[Service]) -> int:
    """Starts every service; stops all when one exits or on Ctrl+C.

    Returns:
        The exit code of the first service that stopped (0 on Ctrl+C).
    """
    processes: list[tuple[Service, subprocess.Popen[bytes]]] = []
    try:
        for service in services:
            env = {**os.environ, **service.env}
            processes.append(
                (service, subprocess.Popen(list(service.cmd), cwd=service.cwd, env=env))
            )
        while True:
            for service, process in processes:
                code = process.poll()
                if code is not None:
                    print(f"\n{service.name} exited with code {code}; stopping the others.")
                    return code
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping…")
        return 0
    finally:
        for _, process in processes:
            _kill_tree(process)
