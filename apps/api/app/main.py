"""PersonaStorm API entrypoint.

Run locally:
    cd apps/api
    uvicorn app.main:app --reload --port 8000

OpenAPI docs: http://localhost:8000/docs
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import get_settings
from .routers import account, admin, billing, health, storm
from .services.storm_runner import StormManager
from .services.supabase_gateway import build_gateway

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("personastorm")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.runs_dir.mkdir(parents=True, exist_ok=True)
    gateway = build_gateway(settings)
    app.state.gateway = gateway
    app.state.manager = StormManager(settings, gateway=gateway)
    logger.info(
        "PersonaStorm API up — provider=%s seed=%s supabase=%s",
        settings.inference_provider,
        settings.persona_seed,
        "configured" if settings.supabase_configured else "in-memory (dev)",
    )
    yield
    # Close the httpx client when using the real Supabase gateway.
    aclose = getattr(gateway, "aclose", None)
    if aclose is not None:
        await aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="PersonaStorm API",
        version=__version__,
        description=(
            "The product wind tunnel — calibrated synthetic persona swarms for "
            "pre-research validation. Synthetic hypothesis generation, not a "
            "replacement for human research."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=settings.cors_origin_regex,
        # Auth uses a Bearer token in the Authorization header (not cookies), so
        # we keep credentials off — that also keeps us safe from the browser rule
        # that forbids `Access-Control-Allow-Origin: *` together with credentials.
        # `allow_headers=["*"]` covers the Authorization header.
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix="/api")
    app.include_router(account.router, prefix="/api")
    app.include_router(billing.router, prefix="/api")
    app.include_router(admin.router, prefix="/api")
    app.include_router(storm.router, prefix="/api")
    return app


app = create_app()
