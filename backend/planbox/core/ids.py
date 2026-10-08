"""Primary keys: UUIDv7 as lowercase, hyphenated text."""

import re
import uuid

_UUID7_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


def new_id() -> str:
    """Returns a new time-ordered UUIDv7 in canonical text form."""
    return str(uuid.uuid7())


def is_valid_id(value: str) -> bool:
    """Tells whether ``value`` is a canonical (lowercase, hyphenated) UUIDv7."""
    return _UUID7_RE.fullmatch(value) is not None
