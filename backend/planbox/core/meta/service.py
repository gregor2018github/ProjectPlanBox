"""Health and metadata use cases."""

from dataclasses import dataclass

from planbox import __version__
from planbox.config import Settings
from planbox.core.meta.repository import MetaRepository

WEEK_STARTS_ON = 1
"""ISO weekday the week starts on: 1 = Monday."""


@dataclass(frozen=True, slots=True)
class Health:
    """Liveness and schema state."""

    status: str
    version: str
    schema_versions: dict[str, int]


@dataclass(frozen=True, slots=True)
class Meta:
    """Facts the frontend needs to behave like the backend."""

    version: str
    mode: str
    timezone: str
    week_starts_on: int


class MetaService:
    """Answers health and metadata questions."""

    def __init__(self, repository: MetaRepository, settings: Settings) -> None:
        self._repository = repository
        self._settings = settings

    def health(self) -> Health:
        """Reports whether the database answers and which migrations are applied."""
        status = "ok" if self._repository.ping() else "degraded"
        return Health(
            status=status,
            version=__version__,
            schema_versions=self._repository.schema_versions(),
        )

    def meta(self) -> Meta:
        """Returns the app version, mode, timezone and week start."""
        return Meta(
            version=__version__,
            mode=self._settings.mode,
            timezone=self._settings.timezone,
            week_starts_on=WEEK_STARTS_ON,
        )
