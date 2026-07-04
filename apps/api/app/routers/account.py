"""Account & wallet endpoints for the signed-in user.

GET /api/me                    -> profile + wallet snapshot
GET /api/wallet                -> wallet balance
GET /api/wallet/transactions   -> the caller's transaction history
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, get_current_user, get_gateway
from ..schemas.billing import MeOut, TransactionOut, WalletOut
from ..services.supabase_gateway import SupabaseGateway

router = APIRouter(tags=["account"])


@router.get("/me", response_model=MeOut)
async def me(
    user: CurrentUser = Depends(get_current_user),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> MeOut:
    profile = await gateway.get_profile(user.id) or {}
    wallet = await gateway.get_wallet(user.id)
    return MeOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        created_at=profile.get("created_at"),
        wallet=WalletOut(
            balance_credits=wallet.get("balance_credits", 0),
            lifetime_spent_credits=wallet.get("lifetime_spent_credits", 0),
        ),
    )


@router.get("/wallet", response_model=WalletOut)
async def wallet(
    user: CurrentUser = Depends(get_current_user),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> WalletOut:
    w = await gateway.get_wallet(user.id)
    return WalletOut(
        balance_credits=w.get("balance_credits", 0),
        lifetime_spent_credits=w.get("lifetime_spent_credits", 0),
    )


@router.get("/wallet/transactions", response_model=list[TransactionOut])
async def transactions(
    user: CurrentUser = Depends(get_current_user),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> list[TransactionOut]:
    rows = await gateway.list_transactions(user.id, limit=100)
    return [
        TransactionOut(
            id=str(r.get("id")),
            type=r.get("type", ""),
            amount_credits=r.get("amount_credits", 0),
            balance_after=r.get("balance_after", 0),
            description=r.get("description"),
            storm_id=r.get("storm_id"),
            created_at=str(r.get("created_at")),
        )
        for r in rows
    ]
