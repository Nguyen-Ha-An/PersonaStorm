"""Storm endpoints (auth + billing aware).

POST /api/storm/create           -> price, charge, then start a run
GET  /api/storm/{id}             -> lightweight status (owner/admin only)
GET  /api/storm/{id}/stream      -> SSE (owner/admin only; token via header or ?access_token=)
GET  /api/storm/{id}/report      -> final report (owner/admin only; durable via DB fallback)
GET  /api/storm/history          -> the caller's own runs

Design decision — SSE over WebSocket: reaction streaming is strictly
server->client, SSE works through proxies/CDNs with zero handshake code, and
the browser EventSource API gives reconnection for free.

Billing: the run is charged atomically at create time (adjust_wallet_balance
RPC). A refresh, SSE reconnect, or report view never creates a new run, so a
user is never double-charged. If the pipeline fails, the storm runner refunds.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, StreamingResponse

from ..auth import CurrentUser, get_current_user, get_gateway
from ..schemas.billing import StormHistoryItem
from ..schemas.storm import StormCreateRequest, StormCreateResponse, StormMeta
from ..services.billing import quote_price
from ..services.errors import InsufficientCreditsError, SupabaseError
from ..services.storm_runner import StormManager, StormRun, new_storm_id
from ..services.supabase_gateway import SupabaseGateway, get_pricing_rule

logger = logging.getLogger("personastorm.storm")

router = APIRouter(prefix="/storm", tags=["storm"])


def _manager(request: Request) -> StormManager:
    return request.app.state.manager


def _owned_run_or_404(request: Request, storm_id: str, user: CurrentUser) -> StormRun:
    """Fetch a live run, enforcing ownership. A non-owner gets 404 (never a 403)
    so we don't leak which storm IDs exist for other users."""
    run = _manager(request).get(storm_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"storm '{storm_id}' not found")
    if run.owner_id is not None and run.owner_id != user.id and not user.is_admin:
        raise HTTPException(status_code=404, detail=f"storm '{storm_id}' not found")
    return run


@router.post("/create", response_model=StormCreateResponse)
async def create_storm(
    payload: StormCreateRequest,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> StormCreateResponse:
    manager = _manager(request)

    # 1) price the run against the active pricing rule (analyst report included)
    rule = await get_pricing_rule(gateway)
    quote = quote_price(rule, payload.persona_count, include_analyst_report=True)

    # 2) pre-generate the id so the charge transaction references the storm
    storm_id = new_storm_id()

    # 3) charge atomically — the RPC rejects an over-draw, so this is our
    #    balance check too (no TOCTOU race between check and deduct).
    try:
        balance_after = await gateway.adjust_wallet(
            user.id,
            -quote.total_credits,
            "storm_charge",
            description=f"Storm run: {payload.title} ({payload.persona_count} personas)",
            storm_id=storm_id,
            actor_user_id=user.id,
        )
    except InsufficientCreditsError:
        wallet = await gateway.get_wallet(user.id)
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Insufficient credits: this run costs {quote.total_credits} credits "
                f"but your balance is {wallet['balance_credits']}. "
                f"Ask an admin for a top-up."
            ),
        )
    except SupabaseError as exc:
        logger.exception("charge failed for %s", user.id)
        raise HTTPException(status_code=502, detail="Billing backend unavailable.") from exc

    # 4) record the run + start the pipeline; refund if we can't even start it
    try:
        await gateway.record_storm(
            {
                "id": storm_id,
                "user_id": user.id,
                "title": payload.title,
                "stimulus_type": payload.stimulus_type.value,
                "target_market": payload.target_market.value,
                "product_category": payload.product_category,
                "persona_count": payload.persona_count,
                "status": "running",
                "price_credits": quote.total_credits,
            }
        )
        manager.create(
            payload,
            storm_id=storm_id,
            owner_id=user.id,
            price_credits=quote.total_credits,
        )
    except Exception as exc:  # noqa: BLE001 — must refund on any start failure
        logger.exception("failed to start storm %s, refunding", storm_id)
        try:
            balance_after = await gateway.adjust_wallet(
                user.id,
                quote.total_credits,
                "refund",
                description=f"Refund — storm {storm_id} failed to start",
                storm_id=storm_id,
                actor_user_id=user.id,
            )
            await gateway.update_storm(storm_id, {"status": "failed", "error": str(exc)[:1000]})
        except Exception:  # noqa: BLE001
            logger.exception("refund after failed start also failed for %s", storm_id)
        raise HTTPException(status_code=500, detail="Could not start the storm.") from exc

    return StormCreateResponse(
        storm_id=storm_id,
        status="running",
        price_credits=quote.total_credits,
        wallet_balance_after=balance_after,
    )


@router.get("/history", response_model=list[StormHistoryItem])
async def storm_history(
    user: CurrentUser = Depends(get_current_user),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> list[StormHistoryItem]:
    rows = await gateway.list_user_storms(user.id, limit=50)
    return [StormHistoryItem(**_history_fields(r)) for r in rows]


def _history_fields(r: dict) -> dict:
    return {
        "id": r["id"],
        "title": r.get("title", ""),
        "status": r.get("status", "running"),
        "stimulus_type": r.get("stimulus_type", ""),
        "target_market": r.get("target_market", ""),
        "persona_count": r.get("persona_count", 0),
        "price_credits": r.get("price_credits", 0),
        "created_at": r.get("created_at"),
        "completed_at": r.get("completed_at"),
    }


@router.get("/{storm_id}", response_model=StormMeta)
async def storm_meta(
    storm_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> StormMeta:
    return _owned_run_or_404(request, storm_id, user).meta()


@router.get("/{storm_id}/stream")
async def storm_stream(
    storm_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> StreamingResponse:
    run = _owned_run_or_404(request, storm_id, user)
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
async def storm_report(
    storm_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    gateway: SupabaseGateway = Depends(get_gateway),
):
    run = _manager(request).get(storm_id)
    if run is not None:
        if run.owner_id is not None and run.owner_id != user.id and not user.is_admin:
            raise HTTPException(status_code=404, detail=f"storm '{storm_id}' not found")
        if run.report is None:
            if run.error:
                raise HTTPException(status_code=500, detail=run.error)
            return JSONResponse(status_code=202, content=run.meta().model_dump(mode="json"))
        return run.report

    # Live run is gone (e.g. API restarted) — fall back to the durable DB copy.
    row = await gateway.get_storm(storm_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"storm '{storm_id}' not found")
    if row.get("user_id") != user.id and not user.is_admin:
        raise HTTPException(status_code=404, detail=f"storm '{storm_id}' not found")
    if row.get("report_json"):
        return row["report_json"]
    if row.get("status") == "failed":
        raise HTTPException(status_code=500, detail=row.get("error") or "storm failed")
    return JSONResponse(status_code=202, content={"storm_id": storm_id, "status": row.get("status")})
