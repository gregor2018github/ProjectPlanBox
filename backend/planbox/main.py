"""Composition root: builds the FastAPI app from core and the enabled modules."""

from collections.abc import AsyncGenerator, Sequence
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute
from starlette.middleware.trustedhost import TrustedHostMiddleware

from planbox import __version__
from planbox.config import Settings, load_settings, mode_from_env
from planbox.core.clock import Clock, SystemClock
from planbox.core.db import connect, init_database
from planbox.core.db.migrations import Migration, MigrationSource, migrate
from planbox.core.entities import EntityRegistry
from planbox.core.errors import NotFound, Problem, install_error_handlers
from planbox.core.lifecycle.router import router as lifecycle_router
from planbox.core.lifecycle.service import ShutdownHook
from planbox.core.links.router import router as links_router
from planbox.core.meta.router import router as meta_router
from planbox.core.module import Module
from planbox.core.tags.router import router as tags_router
from planbox.modules import ENABLED_MODULES

CORE_MIGRATIONS_DIR = Path(__file__).parent / "core" / "migrations"

LOOPBACK_HOSTS = ["127.0.0.1", "localhost"]
"""Accepted Host headers. Rejecting others blocks DNS-rebinding attacks, where a
website points its own domain at 127.0.0.1 to read or change local data."""


def migration_sources(modules: Sequence[Module]) -> list[MigrationSource]:
    """Returns migration sources in application order: core first, then modules."""
    return [
        MigrationSource("core", CORE_MIGRATIONS_DIR),
        *(MigrationSource(m.id, m.migrations_dir) for m in modules),
    ]


def run_migrations(settings: Settings, modules: Sequence[Module], clock: Clock) -> list[Migration]:
    """Prepares the database file and applies pending migrations (with backup).

    Returns:
        The migrations applied by this call.
    """
    init_database(settings.db_path)
    conn = connect(settings.db_path)
    try:
        return migrate(
            conn, migration_sources(modules), clock=clock, backups_dir=settings.backups_dir
        )
    finally:
        conn.close()


def _operation_id(route: APIRoute) -> str:
    """Readable OpenAPI operation ids such as ``core_get_health``."""
    prefix = route.tags[0] if route.tags else "api"
    return f"{prefix}_{route.name}"


def create_app(
    settings: Settings,
    *,
    modules: Sequence[Module] | None = None,
    clock: Clock | None = None,
    request_shutdown: ShutdownHook | None = None,
) -> FastAPI:
    """Builds the application.

    Migrations run in the lifespan, so merely creating the app (for example
    to export the OpenAPI schema) does not touch the database.

    Args:
        settings: Resolved settings.
        modules: Modules to mount; defaults to ``ENABLED_MODULES``.
        clock: Time source; defaults to the system clock.
        request_shutdown: Stops the server gracefully. Only the daily-use launcher
            passes one; without it the app's shutdown button is unavailable.

    Returns:
        The configured FastAPI app.

    Raises:
        ValueError: If two modules share an id.
    """
    modules = ENABLED_MODULES if modules is None else modules
    clock = SystemClock() if clock is None else clock
    ids = [m.id for m in modules]
    if len(set(ids)) != len(ids):
        raise ValueError(f"duplicate module ids: {ids}")

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
        run_migrations(settings, modules, clock)
        yield

    app = FastAPI(
        title="PlanBox",
        version=__version__,
        lifespan=lifespan,
        generate_unique_id_function=_operation_id,
        responses={"default": {"model": Problem, "description": "Problem details"}},
        docs_url="/api/docs" if settings.mode == "dev" else None,
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings
    app.state.clock = clock
    app.state.request_shutdown = request_shutdown
    app.state.entity_registry = EntityRegistry(t for m in modules for t in m.entity_types)
    install_error_handlers(app)
    allowed_hosts = [*LOOPBACK_HOSTS, "testserver"] if settings.mode == "test" else LOOPBACK_HOSTS
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

    app.include_router(meta_router, prefix="/api")
    app.include_router(lifecycle_router, prefix="/api")
    app.include_router(tags_router, prefix="/api")
    app.include_router(links_router, prefix="/api")
    for module in modules:
        app.include_router(module.router, prefix=f"/api/{module.id}", tags=[module.id])

    if settings.frontend_dist is not None:
        _mount_frontend(app, settings.frontend_dist)
    return app


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """Serves the built SPA: real files when they exist, else ``index.html``."""
    root = dist.resolve()

    @app.get("/api/{path:path}", include_in_schema=False)
    def api_not_found(path: str) -> None:
        raise NotFound(f"no API route /api/{path}")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        index = root / "index.html"
        if not index.is_file():
            raise NotFound("frontend is not built; run scripts/serve.py")
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            immutable = candidate.is_relative_to(root / "assets")
            headers = {"Cache-Control": "public, max-age=31536000, immutable"} if immutable else {}
            return FileResponse(candidate, headers=headers)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


def create_app_from_env() -> FastAPI:
    """App factory for uvicorn (``--factory``): mode from ``PLANBOX_MODE``."""
    return create_app(load_settings(mode_from_env()))
