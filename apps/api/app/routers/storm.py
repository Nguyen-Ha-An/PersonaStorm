"""Storm endpoints.

POST /api/storm/create           -> start a run (returns storm_id immediately)
GET  /api/storm/{id}             -> lightweight status (polling / refresh)
GET  /api/storm/{id}/stream      -> SSE: init / reaction / progress / complete / error
GET  /api/storm/{id}/report      -> final report (202 + meta while still running)

Design decision — SSE over WebSocket: reaction streaming is strictly
server->client, SSE works through proxies/CDNs with zero handshake code, and
the browser EventSource API gives reconnection for free. WebSocket buys us
nothing here (see docs/architecture.md#streaming).
"""

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from ..schemas.storm import StormCreateRequest, StormCreateResponse, StormMeta
from ..services.storm_runner import StormManager, StormRun

router = APIRouter(prefix="/storm", tags=["storm"])


def _manager(request: Request) -> StormManager:
    return request.app.state.manager


def _run_or_404(request: Request, storm_id: str) -> StormRun:
    run = _manager(request).get(storm_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"storm '{storm_id}' not found")
    return run


@router.post("/create", response_model=StormCreateResponse)
async def create_storm(payload: StormCreateRequest, request: Request) -> StormCreateResponse:
    run = _manager(request).create(payload)
    return StormCreateResponse(storm_id=run.id, status="created")


@router.get("/{storm_id}", response_model=StormMeta)
async def storm_meta(storm_id: str, request: Request) -> StormMeta:
    return _run_or_404(request, storm_id).meta()


@router.get("/{storm_id}/stream")
async def storm_stream(storm_id: str, request: Request) -> StreamingResponse:
    run = _run_or_404(request, storm_id)
    manager = _manager(request)

    async def sse() -> "AsyncGenerator[str, None]":  # noqa: F821 — doc type
        yield "retry: 3000\n\n"
        async for event, data in manager.event_stream(run):
            yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
            if await request.is_disconnected():
                return

    return StreamingResponse(
        sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable proxy buffering (nginx)
        },
    )


@router.get("/{storm_id}/report")
async def storm_report(storm_id: str, request: Request):
    run = _run_or_404(request, storm_id)
    if run.report is None:
        if run.error:
            raise HTTPException(status_code=500, detail=run.error)
        # Not ready yet: 202 + meta so clients can poll without special-casing
        return JSONResponse(status_code=202, content=run.meta().model_dump(mode="json"))
    return run.report
