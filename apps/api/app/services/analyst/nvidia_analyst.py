"""NvidiaAnalyst — NVIDIA GLM-5.2 re-narration of the deterministic report.

Design principle (critical): the calibrated engine computes ALL numbers
(market_fit, criteria scores, counts, curves). This analyst ONLY re-narrates
TEXT fields (executive summary, recommendations, top-objection labels, kill
quote) from those aggregates. It MUST NEVER change any number. On any failure
(missing key, network error, invalid JSON) it logs server-side (no secrets)
and returns the ORIGINAL deterministic report unchanged, plus a note. A storm
must NEVER crash because of the analyst — enhance_report never raises.
"""

from __future__ import annotations

import json
import logging

import httpx

from ...schemas.report import ObjectionCluster, Recommendation, StormReport
from ..inference.base import ProviderNotConfiguredError
from .base import AnalystProvider
from .prompts import ANALYST_SYSTEM_PROMPT, build_analyst_user_prompt

logger = logging.getLogger(__name__)

_VALID_PRIORITIES = {"now", "next", "later"}

_FALLBACK_NOTE = "NVIDIA analyst unavailable — local report builder used."


class NvidiaAnalyst(AnalystProvider):
    name = "nvidia"

    def __init__(
        self,
        api_key: str | None,
        base_url: str,
        model: str,
        max_tokens: int = 4096,
        timeout_s: float = 60.0,
    ):
        if not base_url:
            raise ProviderNotConfiguredError(
                "ANALYST_PROVIDER=nvidia but NVIDIA_BASE_URL is not set. Point it "
                "at https://integrate.api.nvidia.com/v1 (hosted) or your NIM "
                "container's /v1 endpoint, or use ANALYST_PROVIDER=mock."
            )
        if "integrate.api.nvidia.com" in base_url and not api_key:
            raise ProviderNotConfiguredError(
                "ANALYST_PROVIDER=nvidia targets the hosted NVIDIA endpoint but "
                "NVIDIA_API_KEY is not set. Generate an 'nvapi-' key at "
                "build.nvidia.com, set NVIDIA_API_KEY in .env, or switch to mock."
            )
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.max_tokens = max_tokens
        self._client = httpx.AsyncClient(timeout=timeout_s)

    def _headers(self) -> dict[str, str]:
        if self.api_key and self.api_key != "not-needed":
            return {"Authorization": f"Bearer {self.api_key}"}
        return {}

    @staticmethod
    def _extract_json(content: str) -> dict:
        text = content.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.startswith("json"):
                text = text[4:]
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("analyst returned non-JSON content")
        return json.loads(text[start : end + 1])

    @staticmethod
    def _validate_payload(data: dict) -> dict:
        if not isinstance(data.get("executive_summary"), str):
            raise ValueError("analyst payload missing executive_summary")
        recs = data.get("recommendations")
        if not isinstance(recs, list) or not recs:
            raise ValueError("analyst payload missing recommendations")
        for r in recs:
            if not isinstance(r, dict):
                raise ValueError("analyst recommendation is not an object")
            if not isinstance(r.get("title"), str) or not isinstance(r.get("detail"), str):
                raise ValueError("analyst recommendation missing title/detail")
            if r.get("priority") not in _VALID_PRIORITIES:
                r["priority"] = "next"
        labels = data.get("top_objection_labels", [])
        if not isinstance(labels, list) or not all(isinstance(x, str) for x in labels):
            raise ValueError("analyst payload has invalid top_objection_labels")
        kill_quote = data.get("kill_quote", "")
        if not isinstance(kill_quote, str):
            raise ValueError("analyst payload has invalid kill_quote")
        return data

    async def enhance_report(
        self, report: StormReport, context: dict | None = None
    ) -> StormReport:
        # Entire body wrapped in try/except: enhance_report must NEVER raise.
        try:
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": ANALYST_SYSTEM_PROMPT},
                    {"role": "user", "content": build_analyst_user_prompt(report)},
                ],
                "temperature": 0.2,
                "top_p": 0.9,
                "max_tokens": self.max_tokens,
            }
            resp = await self._client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            message = resp.json()["choices"][0]["message"]
            content = message.get("content") or ""
            data = self._extract_json(content)
            data = self._validate_payload(data)

            enhanced = report.model_copy(deep=True)
            enhanced.summary = data["executive_summary"]
            enhanced.recommendations = [
                Recommendation(
                    title=r["title"], detail=r["detail"], priority=r["priority"]
                )
                for r in data["recommendations"]
            ]
            labels = data.get("top_objection_labels", [])
            new_objections = list(enhanced.top_objections)
            for i in range(min(len(labels), len(new_objections))):
                old = new_objections[i]
                new_objections[i] = ObjectionCluster(
                    label=labels[i],
                    count=old.count,
                    share=old.share,
                    example_quote=old.example_quote,
                    top_segments=old.top_segments,
                )
            enhanced.top_objections = new_objections
            kill_quote = data.get("kill_quote", "")
            if kill_quote:
                enhanced.kill_quote = kill_quote
            enhanced.quality.notes = [
                *enhanced.quality.notes,
                "Report narrated by NVIDIA GLM-5.2 analyst.",
            ]
            return enhanced
        except Exception as exc:  # noqa: BLE001 — analyst must never crash a storm
            # Never log api_key or any secret — only the exception message.
            logger.warning(
                "NVIDIA analyst unavailable, using local report builder: %s", exc
            )
            report = report.model_copy(deep=True)
            report.quality.notes = [*report.quality.notes, _FALLBACK_NOTE]
            return report
