"""Fractional index keys, checked against the vectors shared with the frontend."""

import json
import random
from pathlib import Path
from typing import Any

import pytest

from planbox.core.ordering import OrderingError, key_between

VECTORS = Path(__file__).resolve().parents[2] / "shared" / "ordering-vectors.json"


def load_cases() -> list[dict[str, Any]]:
    """The shared cases ({a, b, key})."""
    data: dict[str, Any] = json.loads(VECTORS.read_text(encoding="utf-8"))
    return data["cases"]


def test_reproduces_every_shared_vector() -> None:
    """Python and TypeScript must agree on every key."""
    for case in load_cases():
        assert key_between(case["a"], case["b"]) == case["key"], case


def test_keys_stay_sorted_under_random_inserts() -> None:
    """Any insert sequence keeps string order equal to list order."""
    rng = random.Random(7)
    keys: list[str] = []
    for _ in range(500):
        i = rng.randint(0, len(keys))
        key = key_between(keys[i - 1] if i else None, keys[i] if i < len(keys) else None)
        keys.insert(i, key)
    assert keys == sorted(keys)
    assert len(set(keys)) == len(keys)


def test_appending_keeps_keys_short() -> None:
    """A thousand appends still give compact keys (integer part grows slowly)."""
    key: str | None = None
    for _ in range(1000):
        key = key_between(key, None)
    assert key is not None
    assert len(key) <= 4


@pytest.mark.parametrize(
    ("a", "b"),
    [("a1", "a0"), ("a0", "a0"), ("a00", None), ("A00000000000000000000000000", None), ("!", None)],
)
def test_rejects_bad_input(a: str, b: str | None) -> None:
    """Reversed bounds, trailing zeros and foreign characters are errors."""
    with pytest.raises(OrderingError):
        key_between(a, b)
