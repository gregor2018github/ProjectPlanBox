"""The shared API scenarios match what this backend answers today."""

from api_scenarios import SCENARIOS_FILE, render


def test_scenarios_are_current() -> None:
    """Regenerate with ``python backend/tests/api_scenarios.py`` after changing behaviour."""
    assert SCENARIOS_FILE.read_text(encoding="utf-8") == render()
