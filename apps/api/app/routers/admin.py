"""Admin endpoints — all gated by require_admin (checks the authoritative
profiles.role via the gateway, never a client-supplied claim).

GET  /api/admin/users
GET  /api/admin/users/{user_id}
POST /api/admin/users/{user_id}/wallet-adjust
POST /api/admin/users/{user_id}/role
GET  /api/admin/storm-runs
GET  /api/admin/pricing
POST /api/admin/pricing
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import CurrentUser, get_gateway, require_admin
from ..schemas.admin import (
    AdminStormRunOut,
    AdminUserDetail,
    AdminUserOut,
    PricingUpdateRequest,
    RoleUpdateRequest,
    WalletAdjustRequest,
    WalletAdjustResponse,
)
from ..schemas.billing import PricingOut
from ..services.errors import InsufficientCreditsError, SupabaseError
from ..services.supabase_gateway import SupabaseGateway, get_pricing_rule

logger = logging.getLogger("personastorm.admin")

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    search: str | None = None,
    _: CurrentUser = Depends(require_admin),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> list[AdminUserOut]:
    rows = await gateway.admin_list_users(search)
    return [AdminUserOut(**r) for r in rows]


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user(
    user_id: str,
    _: CurrentUser = Depends(require_admin),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> AdminUserDetail:
    detail = await gateway.admin_get_user(user_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="user not found")
    return AdminUserDetail(**detail)


@router.post("/users/{user_id}/wallet-adjust", response_model=WalletAdjustResponse)
async def wallet_adjust(
    user_id: str,
    payload: WalletAdjustRequest,
    admin: CurrentUser = Depends(require_admin),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> WalletAdjustResponse:
    if payload.amount_credits == 0:
        raise HTTPException(status_code=400, detail="amount_credits cannot be zero")
    target = await gateway.get_profile(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    try:
        new_balance = await gateway.adjust_wallet(
            user_id,
            payload.amount_credits,
            "admin_adjustment",
            description=payload.reason,
            actor_user_id=admin.id,
        )
    except InsufficientCreditsError:
        raise HTTPException(
            status_code=400,
            detail="Adjustment would drive the balance below zero.",
        )
    except SupabaseError as exc:
        raise HTTPException(status_code=502, detail="Billing backend unavailable.") from exc
    return WalletAdjustResponse(
        user_id=user_id, amount_credits=payload.amount_credits, new_balance=new_balance
    )


@router.post("/users/{user_id}/role", response_model=AdminUserOut)
async def set_role(
    user_id: str,
    payload: RoleUpdateRequest,
    admin: CurrentUser = Depends(require_admin),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> AdminUserOut:
    target = await gateway.get_profile(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")

    # Guard: never remove the last admin (would lock everyone out of admin).
    if target.get("role") == "admin" and payload.role != "admin":
        admin_count = await gateway.count_admins()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot demote the last remaining admin.",
            )

    await gateway.set_role(user_id, payload.role)
    detail = await gateway.admin_get_user(user_id)
    if detail is None:
        # fall back to a minimal representation
        return AdminUserOut(id=user_id, role=payload.role, email=target.get("email"))
    return AdminUserOut(**{k: v for k, v in detail.items()
                           if k not in ("recent_transactions", "recent_storms")})


@router.get("/storm-runs", response_model=list[AdminStormRunOut])
async def storm_runs(
    limit: int = 100,
    _: CurrentUser = Depends(require_admin),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> list[AdminStormRunOut]:
    rows = await gateway.admin_list_storms(limit=min(limit, 500))
    out = []
    for r in rows:
        out.append(
            AdminStormRunOut(
                id=r["id"],
                user_id=r["user_id"],
                user_email=r.get("user_email"),
                title=r.get("title", ""),
                status=r.get("status", "running"),
                stimulus_type=r.get("stimulus_type", ""),
                target_market=r.get("target_market", ""),
                persona_count=r.get("persona_count", 0),
                price_credits=r.get("price_credits", 0),
                created_at=r.get("created_at"),
                completed_at=r.get("completed_at"),
            )
        )
    return out


@router.get("/pricing", response_model=PricingOut)
async def get_pricing(
    _: CurrentUser = Depends(require_admin),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> PricingOut:
    rule = await get_pricing_rule(gateway)
    return PricingOut(
        name=rule.name,
        base_run_credits=rule.base_run_credits,
        credits_per_100_personas=rule.credits_per_100_personas,
        analyst_report_credits=rule.analyst_report_credits,
    )


@router.post("/pricing", response_model=PricingOut)
async def update_pricing(
    payload: PricingUpdateRequest,
    _: CurrentUser = Depends(require_admin),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> PricingOut:
    row = await gateway.update_active_pricing(
        base_run_credits=payload.base_run_credits,
        credits_per_100_personas=payload.credits_per_100_personas,
        analyst_report_credits=payload.analyst_report_credits,
        name=payload.name,
    )
    return PricingOut(
        name=row.get("name", payload.name),
        base_run_credits=row.get("base_run_credits", payload.base_run_credits),
        credits_per_100_personas=row.get("credits_per_100_personas", payload.credits_per_100_personas),
        analyst_report_credits=row.get("analyst_report_credits", payload.analyst_report_credits),
    )
