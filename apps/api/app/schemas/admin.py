"""Request/response schemas for admin endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .billing import PricingOut, StormHistoryItem, TransactionOut


class AdminUserOut(BaseModel):
    id: str
    email: str | None = None
    full_name: str | None = None
    role: str = "user"
    created_at: str | None = None
    balance_credits: int = 0
    lifetime_spent_credits: int = 0
    total_storms: int = 0
    total_spent_credits: int = 0


class AdminUserDetail(AdminUserOut):
    recent_transactions: list[TransactionOut] = Field(default_factory=list)
    recent_storms: list[StormHistoryItem] = Field(default_factory=list)


class WalletAdjustRequest(BaseModel):
    amount_credits: int = Field(..., description="Positive to credit, negative to debit.")
    reason: str = Field(..., min_length=1, max_length=500)


class WalletAdjustResponse(BaseModel):
    user_id: str
    amount_credits: int
    new_balance: int


class RoleUpdateRequest(BaseModel):
    role: str = Field(..., pattern="^(user|admin)$")


class PricingUpdateRequest(BaseModel):
    name: str = Field(default="Default", min_length=1, max_length=100)
    base_run_credits: int = Field(..., ge=0, le=100000)
    credits_per_100_personas: int = Field(..., ge=0, le=100000)
    analyst_report_credits: int = Field(..., ge=0, le=100000)


class AdminStormRunOut(BaseModel):
    id: str
    user_id: str
    user_email: str | None = None
    title: str
    status: str
    stimulus_type: str
    target_market: str
    persona_count: int
    price_credits: int
    created_at: str | None = None
    completed_at: str | None = None
