"""HTTP shapes for health and metadata."""

from typing import Literal

from pydantic import BaseModel


class HealthOut(BaseModel):
    """Liveness and schema state.

    Attributes:
        status: ``ok`` when the database answers.
        version: Application version.
        schema_versions: Highest applied migration per owner (``core``, module ids).
    """

    status: Literal["ok", "degraded"]
    version: str
    schema_versions: dict[str, int]


class MetaOut(BaseModel):
    """Facts the frontend needs to agree with the backend.

    Attributes:
        version: Application version.
        mode: ``serve``, ``dev`` or ``test``.
        timezone: IANA zone that defines "today".
        week_starts_on: ISO weekday the week starts on (1 = Monday).
    """

    version: str
    mode: Literal["serve", "dev", "test"]
    timezone: str
    week_starts_on: int
