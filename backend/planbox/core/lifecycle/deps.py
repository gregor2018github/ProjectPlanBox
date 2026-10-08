"""FastAPI dependency for the lifecycle service."""

from typing import Annotated, cast

from fastapi import Depends, Request

from planbox.core.lifecycle.service import LifecycleService, ShutdownHook


def get_lifecycle_service(request: Request) -> LifecycleService:
    """Builds the service from the hook the launcher installed (if any)."""
    hook = cast("ShutdownHook | None", request.app.state.request_shutdown)
    return LifecycleService(hook)


LifecycleDep = Annotated[LifecycleService, Depends(get_lifecycle_service)]
