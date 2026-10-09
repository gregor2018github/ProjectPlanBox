"""Primary keys: UUIDv7 (RFC 9562) as lowercase, hyphenated text.

Python's ``uuid.uuid7()`` only exists from 3.14, so PlanBox generates its
own (the minimum is 3.12). The layout matches the frontend's
``core/ids.ts``: a 48-bit millisecond timestamp, the version nibble, a 12-bit
counter in ``rand_a`` that keeps ids strictly increasing within one
millisecond, the variant bits and 62 random bits.
"""

import re
import secrets
import threading
import time
import uuid
from collections.abc import Callable

_UUID7_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
_COUNTER_MAX = 0xFFF
_MS_MASK = (1 << 48) - 1


class Uuid7Generator:
    """Thread-safe UUIDv7 source whose ids strictly increase.

    Within one millisecond the 12-bit counter increments (starting from a
    random value with headroom). If it overflows, or the system clock goes
    backwards, the timestamp borrows from the next millisecond, so order
    is never lost.
    """

    def __init__(self, clock_ms: Callable[[], int] | None = None) -> None:
        self._clock_ms = clock_ms or (lambda: time.time_ns() // 1_000_000)
        self._lock = threading.Lock()
        self._last_ms = -1
        self._counter = 0

    def new(self) -> str:
        """Returns the next id."""
        with self._lock:
            ms = self._clock_ms()
            if ms > self._last_ms:
                self._counter = secrets.randbits(11)
            else:
                ms = self._last_ms
                self._counter += 1
                if self._counter > _COUNTER_MAX:
                    ms += 1
                    self._counter = 0
            self._last_ms = ms
            counter = self._counter
        value = (
            (ms & _MS_MASK) << 80 | 0x7 << 76 | counter << 64 | 0b10 << 62 | secrets.randbits(62)
        )
        return str(uuid.UUID(int=value))


_default = Uuid7Generator()


def new_id() -> str:
    """Returns a new time-ordered UUIDv7 in canonical text form."""
    return _default.new()


def is_valid_id(value: str) -> bool:
    """Tells whether ``value`` is a canonical (lowercase, hyphenated) UUIDv7."""
    return _UUID7_RE.fullmatch(value) is not None
