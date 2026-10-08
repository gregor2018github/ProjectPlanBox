"""FastAPI dependency for the tag service (also used by modules)."""

from typing import Annotated

from fastapi import Depends

from planbox.core.db.deps import ClockDep, ConnectionDep
from planbox.core.tags.repository import TagRepository
from planbox.core.tags.service import TagService


def get_tag_service(conn: ConnectionDep, clock: ClockDep) -> TagService:
    """Builds a tag service on the request's connection."""
    return TagService(conn, TagRepository(conn), clock)


TagServiceDep = Annotated[TagService, Depends(get_tag_service)]
