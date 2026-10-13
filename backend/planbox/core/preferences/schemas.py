"""HTTP shapes for preferences."""

from typing import Literal

from pydantic import BaseModel


class PreferencesOut(BaseModel):
    """Every preference; ``null`` means never set (each device keeps its own until then)."""

    theme: Literal["system", "light", "dark"] | None


class PreferencesPatch(BaseModel):
    """Preferences to change; leave a field out to keep it."""

    theme: Literal["system", "light", "dark"] | None = None
