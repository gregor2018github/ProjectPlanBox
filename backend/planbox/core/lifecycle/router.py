"""HTTP route for shutting the server down."""

from fastapi import APIRouter, BackgroundTasks, status

from planbox.core.auth.deps import AuthDep, ClientHostDep
from planbox.core.lifecycle.deps import LifecycleDep
from planbox.core.lifecycle.schemas import ShutdownIn, ShutdownOut

router = APIRouter(tags=["core"])


@router.post("/shutdown", status_code=status.HTTP_202_ACCEPTED)
def shutdown(
    _: ShutdownIn,
    service: LifecycleDep,
    background: BackgroundTasks,
    auth: AuthDep,
    client: ClientHostDep,
) -> ShutdownOut:
    """Stops the server after this response has been sent (this PC only)."""
    auth.require_local(client)
    background.add_task(service.shutdown_hook())
    return ShutdownOut(status="stopping")
