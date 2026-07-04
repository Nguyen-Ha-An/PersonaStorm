"""Pricing & quote endpoints.

GET  /api/pricing         -> the active pricing rule (for showing the formula)
POST /api/billing/quote   -> price a prospective run + affordability against the
                             caller's wallet
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, get_current_user, get_gateway
from ..schemas.billing import PricingOut, QuoteRequest, QuoteResponse
from ..services.billing import quote_price
from ..services.supabase_gateway import SupabaseGateway, get_pricing_rule

router = APIRouter(tags=["billing"])


@router.get("/pricing", response_model=PricingOut)
async def pricing(
    user: CurrentUser = Depends(get_current_user),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> PricingOut:
    rule = await get_pricing_rule(gateway)
    return PricingOut(
        name=rule.name,
        base_run_credits=rule.base_run_credits,
        credits_per_100_personas=rule.credits_per_100_personas,
        analyst_report_credits=rule.analyst_report_credits,
    )


@router.post("/billing/quote", response_model=QuoteResponse)
async def quote(
    payload: QuoteRequest,
    user: CurrentUser = Depends(get_current_user),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> QuoteResponse:
    rule = await get_pricing_rule(gateway)
    q = quote_price(rule, payload.persona_count, payload.include_analyst_report)
    wallet = await gateway.get_wallet(user.id)
    balance = wallet.get("balance_credits", 0)
    return QuoteResponse(
        persona_count=q.persona_count,
        base_run_credits=q.base_run_credits,
        credits_per_100_personas=q.credits_per_100_personas,
        analyst_report_credits=q.analyst_report_credits,
        total_credits=q.total_credits,
        wallet_balance=balance,
        balance_after=balance - q.total_credits,
        has_enough_credits=balance >= q.total_credits,
    )
