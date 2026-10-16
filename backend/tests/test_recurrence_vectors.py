"""The shared recurrence vectors match what recurrence.py answers today."""

from recurrence_vectors import VECTORS, render


def test_vectors_are_current() -> None:
    """Regenerate with ``python backend/tests/recurrence_vectors.py`` after changing rules."""
    assert VECTORS.read_text(encoding="utf-8") == render()
