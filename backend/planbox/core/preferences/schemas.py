"""HTTP shapes for preferences."""

from typing import Literal

from pydantic import BaseModel


class PreferencesOut(BaseModel):
    """Every preference."""

    theme: Literal["system", "light", "dark"]


class PreferencesPatch(BaseModel):
    """Preferences to change; leave a field out to keep it."""

    theme: Literal["system", "light", "dark"] | None = None
