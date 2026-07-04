"""Billing / pricing service.

Single source of truth for how a storm run is priced in credits. The formula
lives here (not duplicated across routers) so the quote endpoint, the storm
create endpoint, and the tests all agree.

    total_credits = base_run_credits
                  + ceil(persona_count / 100) * credits_per_100_personas
                  + (analyst_report_credits if include_analyst_report else 0)

Reference points with the default rule (10 / 5 / 5), analyst report included:
    100 personas  -> 20 credits
    250 personas  -> 30 credits
    500 personas  -> 40 credits
    1000 personas -> 65 credits
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class PricingRule:
    """Snapshot of the active pricing rule used to price a run."""

    base_run_credits: int = 10
    credits_per_100_personas: int = 5
    analyst_report_credits: int = 5
    name: str = "Default"
    id: str | None = None

    @classmethod
    def from_row(cls, row: dict | None) -> "PricingRule":
        if not row:
            return cls()
        return cls(
            base_run_credits=int(row.get("base_run_credits", 10)),
            credits_per_100_personas=int(row.get("credits_per_100_personas", 5)),
            analyst_report_credits=int(row.get("analyst_report_credits", 5)),
            name=str(row.get("name", "Default")),
            id=row.get("id"),
        )


@dataclass(frozen=True)
class PriceQuote:
    persona_count: int
    include_analyst_report: bool
    base_run_credits: int
    credits_per_100_personas: int
    analyst_report_credits: int
    total_credits: int


def quote_price(
    rule: PricingRule,
    persona_count: int,
    include_analyst_report: bool = True,
) -> PriceQuote:
    """Compute the credit cost of a run. Pure function, no I/O."""
    if persona_count <= 0:
        raise ValueError("persona_count must be positive")

    persona_component = math.ceil(persona_count / 100) * rule.credits_per_100_personas
    analyst_component = rule.analyst_report_credits if include_analyst_report else 0
    total = rule.base_run_credits + persona_component + analyst_component

    return PriceQuote(
        persona_count=persona_count,
        include_analyst_report=include_analyst_report,
        base_run_credits=rule.base_run_credits,
        credits_per_100_personas=rule.credits_per_100_personas,
        analyst_report_credits=rule.analyst_report_credits if include_analyst_report else 0,
        total_credits=total,
    )
