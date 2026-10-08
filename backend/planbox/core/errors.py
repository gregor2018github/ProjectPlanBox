"""Domain errors and their mapping to RFC 9457 ``application/problem+json``.

Services raise the errors defined here; they never raise ``HTTPException``.
The handlers installed by ``install_error_handlers`` turn every error,
including FastAPI's own, into one response shape with a stable ``code``
the frontend can switch on.
"""

from http import HTTPStatus
from typing import Any, ClassVar

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_MEDIA_TYPE = "application/problem+json"


class Problem(BaseModel):
    """An RFC 9457 problem document.

    Attributes:
        type: URI reference identifying the problem type (``about:blank`` here).
        title: Short, human-readable summary of the problem type.
        status: The HTTP status code.
        detail: Explanation specific to this occurrence.
        code: Stable machine-readable code, e.g. ``not_found``.
        errors: Field-level details for validation problems.
    """

    type: str = "about:blank"
    title: str
    status: int
    detail: str
    code: str
    errors: list[dict[str, Any]] | None = None


class DomainError(Exception):
    """Base class for errors that services raise on purpose."""

    status: ClassVar[int] = 400
    code: ClassVar[str] = "bad_request"
    title: ClassVar[str] = "Bad request"

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFound(DomainError):
    """The addressed entity does not exist (or is deleted)."""

    status = 404
    code = "not_found"
    title = "Not found"


class Conflict(DomainError):
    """The request conflicts with the current state."""

    status = 409
    code = "conflict"
    title = "Conflict"


class ValidationFailed(DomainError):
    """The request is well-formed but breaks a business rule."""

    status = 422
    code = "validation_failed"
    title = "Validation failed"


def problem_response(problem: Problem) -> JSONResponse:
    """Serialises a problem with the problem+json media type."""
    return JSONResponse(
        problem.model_dump(exclude_none=True),
        status_code=problem.status,
        media_type=PROBLEM_MEDIA_TYPE,
    )


async def _domain_error_handler(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, DomainError):  # pragma: no cover - registration guarantees it
        raise exc
    return problem_response(
        Problem(title=exc.title, status=exc.status, detail=exc.detail, code=exc.code)
    )


async def _validation_error_handler(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):  # pragma: no cover - registration guarantees it
        raise exc
    errors = [
        {"loc": list(err.get("loc", ())), "msg": str(err.get("msg", "")), "type": err.get("type")}
        for err in exc.errors()
    ]
    return problem_response(
        Problem(
            title="Invalid request",
            status=422,
            detail="The request did not match the expected shape.",
            code="invalid_request",
            errors=errors,
        )
    )


async def _http_error_handler(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):  # pragma: no cover - registration guarantees it
        raise exc
    not_found = exc.status_code == HTTPStatus.NOT_FOUND
    code = "not_found" if not_found else f"http_{exc.status_code}"
    return problem_response(
        Problem(
            title="Not found" if not_found else str(exc.detail),
            status=exc.status_code,
            detail=str(exc.detail),
            code=code,
        )
    )


def install_error_handlers(app: FastAPI) -> None:
    """Registers the problem+json handlers on the app."""
    app.add_exception_handler(DomainError, _domain_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_error_handler)
