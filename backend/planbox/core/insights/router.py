"""HTTP routes for insights."""

import dataclasses
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from planbox.core.insights.deps import InsightsServiceDep
from planbox.core.insights.schemas import ActivityOut, AppOpenCreate, AppOpenOut

router = APIRouter(prefix="/insights", tags=["core"])


@router.post("/opens", status_code=status.HTTP_201_CREATED)
def record_open(body: AppOpenCreate, service: InsightsServiceDep, response: Response) -> AppOpenOut:
    """Records that the app was opened (idempotent per client id)."""
    row, created = service.record_open(body.id)
    if not created:
        response.status_code = status.HTTP_200_OK
    return AppOpenOut(id=row.id, created_at=row.created_at)


@router.get("/activity")
def get_activity(
    service: InsightsServiceDep,
    start: Annotated[date, Query(description="First day (YYYY-MM-DD).")],
    end: Annotated[date, Query(description="Last day, inclusive (at most 400 days).")],
) -> ActivityOut:
    """What was created, completed and deleted per day across all modules, and app opens."""
    return ActivityOut.model_validate(dataclasses.asdict(service.activity(start, end)))
