"""FastAPI dependencies for Google Drive sync."""

from typing import Annotated, cast

from fastapi import Depends, Request

from planbox.core.cloud.google import Transport
from planbox.core.cloud.models import CloudState
from planbox.core.cloud.service import CloudService
from planbox.core.data.deps import TransferServiceDep
from planbox.core.db.deps import ClockDep, SettingsDep


def get_cloud_service(
    request: Request, settings: SettingsDep, clock: ClockDep, transfer: TransferServiceDep
) -> CloudService:
    """Builds the sync service on the request's connection."""
    state = cast("CloudState", request.app.state.cloud)
    transport = cast("Transport", request.app.state.cloud_transport)
    return CloudService(settings, clock, state, transfer, transport)


CloudServiceDep = Annotated[CloudService, Depends(get_cloud_service)]
