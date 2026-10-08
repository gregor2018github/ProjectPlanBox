"""HTTP route for shutting the server down."""

from fastapi import APIRouter, BackgroundTasks, status

from planbox.core.lifecycle.deps import LifecycleDep
from planbox.core.lifecycle.schemas import ShutdownIn, ShutdownOut

router = APIRouter(tags=["core"])


@router.post("/shutdown", status_code=status.HTTP_202_ACCEPTED)
def shutdown(_: ShutdownIn, service: LifecycleDep, background: BackgroundTasks) -> ShutdownOut:
    """Stops the server after this response has been sent."""
    background.add_task(service.shutdown_hook())
    return ShutdownOut(status="stopping")
