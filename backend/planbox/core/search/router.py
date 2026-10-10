"""HTTP routes for search."""

from typing import Annotated

from fastapi import APIRouter, Query

from planbox.core.search.deps import SearchServiceDep
from planbox.core.search.schemas import SearchHitOut

router = APIRouter(prefix="/search", tags=["core"])


@router.get("")
def search(
    service: SearchServiceDep,
    q: Annotated[str, Query(max_length=200, description="Words to find (prefix match).")] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[SearchHitOut]:
    """Live items whose title or text contains every word, best first."""
    return [
        SearchHitOut(ref=str(h.ref), title=h.title, snippet=h.snippet, hint=h.hint)
        for h in service.search(q, limit)
    ]
