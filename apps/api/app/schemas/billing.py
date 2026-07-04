"""Request/response schemas for wallet, pricing and billing endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class WalletOut(BaseModel):
    balance_credits: int
    lifetime_spent_credits: int


class ProfileOut(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    role: str = "user"
    created_at: str | None = None


class MeOut(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    role: str = "user"
    created_at: str | None = None
    wallet: WalletOut


class TransactionOut(BaseModel):
    id: str
    type: str
    amount_credits: int
    balance_after: int
    description: str | None = None
    storm_id: str | None = None
    created_at: str


class PricingOut(BaseModel):
    name: str = "Default"
    base_run_credits: int
    credits_per_100_personas: int
    analyst_report_credits: int


class QuoteRequest(BaseModel):
    persona_count: int = Field(..., ge=1, le=5000)
    include_analyst_report: bool = True


class QuoteResponse(BaseModel):
    persona_count: int
    base_run_credits: int
    credits_per_100_personas: int
    analyst_report_credits: int
    total_credits: int
    wallet_balance: int
    balance_after: int
    has_enough_credits: bool


class StormHistoryItem(BaseModel):
    id: str
    title: str
    status: str
    stimulus_type: str
    target_market: str
    persona_count: int
    price_credits: int
    created_at: str | None = None
    completed_at: str | None = None
