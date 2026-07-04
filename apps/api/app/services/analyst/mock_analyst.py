"""MockAnalyst — default, no-op analyst.

The deterministic report builder already writes good text (summary,
recommendations, objection labels, kill quote), so the mock analyst simply
returns the report unchanged. This is the default (ANALYST_PROVIDER=mock) and
keeps the local demo identical to today.
"""

from __future__ import annotations

from ...schemas.report import StormReport
from .base import AnalystProvider


class MockAnalyst(AnalystProvider):
    name = "mock"

    async def enhance_report(
        self, report: StormReport, context: dict | None = None
    ) -> StormReport:
        return report
