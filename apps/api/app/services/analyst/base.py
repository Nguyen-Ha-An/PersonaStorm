"""Analyst provider abstraction.

The analyst layer sits AFTER the calibrated engine has already computed every
number in the report (market_fit, criteria scores, counts, curves). It only
ever re-narrates TEXT fields (executive summary, recommendations,
top-objection labels, kill quote) from those aggregates — it must NEVER
change a number.

Contract: `enhance_report` MUST NOT raise. Any failure (missing key, network
error, invalid JSON) is caught internally, logged server-side (no secrets),
and the method returns the original deterministic report unchanged (plus a
note) so a storm can never crash because of the analyst.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from ...schemas.report import StormReport


class AnalystProvider(ABC):
    """Re-narrates a StormReport's text fields from its (already-final) aggregates."""

    name: str = "base"

    @abstractmethod
    async def enhance_report(
        self, report: StormReport, context: dict | None = None
    ) -> StormReport:
        """Return a (possibly enhanced) report. Never raises."""
