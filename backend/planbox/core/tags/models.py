"""Tag rows."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Tag:
    """A live or deleted tag."""

    id: str
    name: str
    created_at: str
    updated_at: str
    deleted_at: str | None
