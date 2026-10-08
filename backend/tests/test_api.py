"""HTTP surface: health, meta, problem+json errors and SPA serving."""

from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from planbox.config import Settings
from planbox.core.clock import FixedClock
from planbox.core.errors import Conflict
from planbox.core.module import Module
from planbox.main import create_app


def test_health_reports_ok_and_creates_the_database(client: TestClient, settings: Settings) -> None:
    """Startup migrates the database; health answers."""
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"
    assert isinstance(body["schema_versions"], dict)
    assert settings.db_path.is_file()


def test_meta_exposes_timezone_and_week_start(client: TestClient) -> None:
    """The frontend learns the zone and Monday week start from the server."""
    body = client.get("/api/meta").json()

    assert body == {
        "version": "0.1.0",
        "mode": "test",
        "timezone": "Europe/Amsterdam",
        "week_starts_on": 1,
    }


def test_unknown_api_route_is_problem_json(client: TestClient) -> None:
    """Even FastAPI's own 404s use the problem shape."""
    response = client.get("/api/nope")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "not_found"


class EchoIn(BaseModel):
    """Body for the probe route."""

    count: int


def _probe_module(tmp_path: Path) -> Module:
    router = APIRouter()

    @router.post("/echo")
    def echo(body: EchoIn) -> EchoIn:
        return body

    @router.post("/conflict")
    def conflict() -> None:
        raise Conflict("already there")

    migrations = tmp_path / "probe_migrations"
    migrations.mkdir()
    return Module("probe", router, migrations)


def test_domain_and_validation_errors_are_problem_json(
    settings: Settings, clock: FixedClock, tmp_path: Path
) -> None:
    """Service errors and bad bodies share one shape with stable codes."""
    app = create_app(settings, modules=[_probe_module(tmp_path)], clock=clock)
    with TestClient(app) as client:
        conflict = client.post("/api/probe/conflict")
        invalid = client.post("/api/probe/echo", json={"count": "many"})

    assert conflict.status_code == 409
    assert conflict.json() == {
        "type": "about:blank",
        "title": "Conflict",
        "status": 409,
        "detail": "already there",
        "code": "conflict",
    }
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "invalid_request"
    assert invalid.json()["errors"][0]["loc"] == ["body", "count"]


def test_operation_ids_are_prefixed_by_owner(app: FastAPI) -> None:
    """Generated client types get readable operation names."""
    operation = app.openapi()["paths"]["/api/health"]["get"]

    assert operation["operationId"] == "core_get_health"


def _serve_app(settings: Settings, clock: FixedClock, dist: Path) -> FastAPI:
    serve_settings = Settings(mode="serve", data_dir=settings.data_dir, frontend_dist=dist)
    return create_app(serve_settings, clock=clock)


def test_spa_serves_files_and_falls_back_to_index(
    settings: Settings, clock: FixedClock, tmp_path: Path
) -> None:
    """Assets are served immutable; unknown paths get index.html; /api stays JSON."""
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>app</html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("nope", encoding="utf-8")

    with TestClient(_serve_app(settings, clock, dist)) as client:
        asset = client.get("/assets/app.js")
        deep_link = client.get("/todos/today")
        traversal = client.get("/..%2Fsecret.txt")
        api = client.get("/api/unknown")
        health = client.get("/api/health")

    assert asset.text == "console.log(1)"
    assert "immutable" in asset.headers["cache-control"]
    assert deep_link.text == "<html>app</html>"
    assert deep_link.headers["cache-control"] == "no-cache"
    assert traversal.text == "<html>app</html>"
    assert api.status_code == 404
    assert api.json()["code"] == "not_found"
    assert health.json()["status"] == "ok"


def test_unbuilt_frontend_is_reported(
    settings: Settings, clock: FixedClock, tmp_path: Path
) -> None:
    """Serving without a build explains what to do."""
    with TestClient(_serve_app(settings, clock, tmp_path / "missing")) as client:
        response = client.get("/")

    assert response.status_code == 404
    assert "not built" in response.json()["detail"]
