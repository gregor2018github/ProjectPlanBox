"""Composition root: builds the FastAPI app from core and the enabled modules."""

import asyncio
import mimetypes
from collections.abc import AsyncGenerator, Sequence
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute
from starlette.middleware.trustedhost import TrustedHostMiddleware

from planbox import __version__
from planbox.config import Settings, load_settings, mode_from_env
from planbox.core.auth.middleware import SessionGuard
from planbox.core.auth.router import router as auth_router
from planbox.core.auth.service import AuthState
from planbox.core.clock import Clock, SystemClock
from planbox.core.data.backups import BackupState
from planbox.core.data.router import router as data_router
from planbox.core.data.scheduler import backup_loop
from planbox.core.db import connect, init_database
from planbox.core.db.migrations import Migration, MigrationSource, migrate
from planbox.core.entities import EntityRegistry
from planbox.core.errors import NotFound, Problem, install_error_handlers
from planbox.core.insights.router import router as insights_router
from planbox.core.lifecycle.router import router as lifecycle_router
from planbox.core.lifecycle.service import ShutdownHook
from planbox.core.links.router import router as links_router
from planbox.core.meta.router import router as meta_router
from planbox.core.module import Module
from planbox.core.preferences.router import router as preferences_router
from planbox.core.search.router import router as search_router
from planbox.core.tags.router import router as tags_router
from planbox.modules import ENABLED_MODULES

CORE_MIGRATIONS_DIR = Path(__file__).parent / "core" / "migrations"

# Windows' registry rarely knows the web app manifest's type.
mimetypes.add_type("application/manifest+json", ".webmanifest")

NO_CACHE_FILES = frozenset({"sw.js", "manifest.webmanifest"})
"""Revalidated on every load, so a new version reaches installed phones at once."""

LOOPBACK_HOSTS = ["127.0.0.1", "localhost"]
"""Accepted Host headers. Rejecting others blocks DNS-rebinding attacks, where a
website points its own domain at 127.0.0.1 to read or change local data."""


def allowed_hosts(settings: Settings) -> list[str]:
    """Accepted Host headers: loopback, plus the phone-access address and name when on."""
    hosts = list(LOOPBACK_HOSTS)
    if settings.network is not None:
        hosts.append(settings.network.address)
        if settings.network.hostname:
            hosts.append(settings.network.hostname)
    if settings.mode == "test":
        hosts.append("testserver")
    return hosts


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

    backup_state = BackupState()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
        run_migrations(settings, modules, clock)
        if not settings.scheduled_backups:
            yield
            return
        backups = asyncio.create_task(backup_loop(settings, clock, backup_state))
        try:
            yield
        finally:
            backups.cancel()
            with suppress(asyncio.CancelledError):
                await backups

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
    app.state.backup_state = backup_state
    app.state.auth = AuthState()
    app.state.entity_registry = EntityRegistry(t for m in modules for t in m.entity_types)
    install_error_handlers(app)
    # Starlette runs the last added middleware first: Host check, then sessions.
    app.add_middleware(SessionGuard)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts(settings))

    app.include_router(meta_router, prefix="/api")
    app.include_router(lifecycle_router, prefix="/api")
    app.include_router(auth_router, prefix="/api")
    app.include_router(preferences_router, prefix="/api")
    app.include_router(tags_router, prefix="/api")
    app.include_router(links_router, prefix="/api")
    app.include_router(search_router, prefix="/api")
    app.include_router(insights_router, prefix="/api")
    app.include_router(data_router, prefix="/api")
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
            headers: dict[str, str] = {}
            if candidate.is_relative_to(root / "assets"):
                headers["Cache-Control"] = "public, max-age=31536000, immutable"
            elif path in NO_CACHE_FILES:
                headers["Cache-Control"] = "no-cache"
            return FileResponse(candidate, headers=headers)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


def create_app_from_env() -> FastAPI:
    """App factory for uvicorn (``--factory``): mode from ``PLANBOX_MODE``."""
    return create_app(load_settings(mode_from_env()))
