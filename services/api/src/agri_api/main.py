"""FastAPI application factory.

PHASE 0 SCAFFOLD: only health endpoints exist. REST, the WebSocket gateway,
MQTT ingest and the command service arrive in Phase 2 (see docs/PLAN.md).
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agri_api import __version__
from agri_api.logging import configure_logging
from agri_api.settings import Settings, get_settings

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    log.info("api.start", env=settings.env, version=__version__)
    yield
    log.info("api.stop")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="Agri Robot App Store API",
        version=__version__,
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/v1/docs",
        lifespan=lifespan,
    )
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz", tags=["health"])
    async def healthz() -> dict[str, str]:
        """Liveness: the process is up. No dependencies are checked."""
        return {"status": "ok", "version": __version__}

    @app.get("/readyz", tags=["health"])
    async def readyz() -> dict[str, object]:
        """Readiness. Phase 0 reports every dependency as 'unchecked'; Phase 2 wires real probes."""
        return {
            "status": "scaffold",
            "checks": {"postgres": "unchecked", "redis": "unchecked", "mqtt": "unchecked"},
        }

    return app


app = create_app()
