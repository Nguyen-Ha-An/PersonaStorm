"""GET /api/health"""

from datetime import datetime, timezone

from fastapi import APIRouter, Request

from .. import __version__

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request) -> dict:
    manager = request.app.state.manager
    return {
        "status": "ok",
        "service": "personastorm-api",
        "version": __version__,
        "inference_provider": manager.provider.name,
        "active_storms": sum(
            1 for r in manager.runs.values() if r.status.value in ("running", "generating_personas")
        ),
        "time": datetime.now(timezone.utc).isoformat(),
    }
