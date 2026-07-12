"""Semantic assessor (spec §7). ONE LLM call per storm. The mock assessor is
a deterministic, seeded, trait-free stand-in that fully populates the matrix
so the blend engages offline. The LLM assessor calls the shared chat
transport at temperature 0, sanitizes, and — on any failure after one
repair — returns an empty-but-valid matrix tagged fallback_formulas (blend
degrades to formulas).

Mirror of apps/web/lib/server/engine/semantic/assessor.ts.
"""

from __future__ import annotations

import json
import logging
import random
from abc import ABC, abstractmethod

import httpx

from ...config import Settings
from ..inference.llm_common import post_with_retry
from .prompt import SegmentBrief, build_semantic_system_prompt, build_semantic_user_prompt
from .types import GROUNDED_CRITERIA, SemanticMatrix, SemanticSource, sanitize_semantic

logger = logging.getLogger(__name__)


class SemanticAssessor(ABC):
    """Assigns per-segment grounded scores for a stimulus."""

    name: str = "base"

    @abstractmethod
    async def assess(
        self, stimulus: str, category: str, segments: list[SegmentBrief]
    ) -> SemanticMatrix:
        """Produce a full segment x grounded-criterion matrix. Never raises."""


def _empty_matrix(segments: list[SegmentBrief], source: SemanticSource) -> SemanticMatrix:
    return {
        "segments": {s.name: {"scores": {}, "rationales": {}} for s in segments},
        "real_alternatives_considered": [],
        "source": source,
    }


class MockSemanticAssessor(SemanticAssessor):
    """Deterministic offline assessor — a hash of (stimulus, category, segment, criterion)."""

    name = "mock"

    def __init__(self, seed: int = 1337):
        self.seed = seed

    async def assess(
        self, stimulus: str, category: str, segments: list[SegmentBrief]
    ) -> SemanticMatrix:
        m = _empty_matrix(segments, "fallback_formulas")
        for s in segments:
            for c in GROUNDED_CRITERIA:
                rng = random.Random(f"sem:{self.seed}:{category}:{s.name}:{c}:{stimulus}")
                m["segments"][s.name]["scores"][c] = round(0.3 + 0.4 * rng.random(), 4)
                m["segments"][s.name]["rationales"][c] = "deterministic offline assessment"
        return m


def _extract_json_object(content: str) -> dict:
    """Defensively extract the first JSON object from a model reply."""
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("model returned non-JSON content")
    return json.loads(text[start : end + 1])


class LlmSemanticAssessor(SemanticAssessor):
    name = "llm"

    def __init__(
        self,
        api_key: str | None,
        base_url: str,
        model: str,
        max_tokens: int,
        source: SemanticSource,
        max_retries: int = 3,
        timeout_s: float = 60.0,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.max_tokens = max_tokens
        self.source = source
        self.max_retries = max_retries
        self._client = httpx.AsyncClient(timeout=timeout_s)

    def _headers(self) -> dict[str, str]:
        if self.api_key and self.api_key != "not-needed":
            return {"Authorization": f"Bearer {self.api_key}"}
        return {}

    async def _call(self, messages: list[dict[str, str]]) -> str:
        # All throws (transient or terminal) are handled identically by the
        # outer try/except in assess(), which degrades to a fallback_formulas
        # matrix.
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": self.max_tokens,
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        resp = await post_with_retry(
            self._client,
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json_body=payload,
            max_retries=self.max_retries,
        )
        message = resp.json()["choices"][0]["message"]
        return message.get("content") or ""

    async def assess(
        self, stimulus: str, category: str, segments: list[SegmentBrief]
    ) -> SemanticMatrix:
        names = [s.name for s in segments]
        messages = [
            {"role": "system", "content": build_semantic_system_prompt()},
            {"role": "user", "content": build_semantic_user_prompt(stimulus, category, segments)},
        ]
        try:
            content = await self._call(messages)
            try:
                parsed = _extract_json_object(content)
            except ValueError:
                # one repair attempt: ask for JSON only
                repair_messages = [
                    *messages,
                    {"role": "assistant", "content": content},
                    {"role": "user", "content": "That was not valid JSON. Output ONLY the JSON object matching the schema."},
                ]
                repair = await self._call(repair_messages)
                parsed = _extract_json_object(repair)
            clean = sanitize_semantic(parsed, names)
            if clean is None:
                return _empty_matrix(segments, "fallback_formulas")
            return {**clean, "source": self.source}
        except Exception as exc:  # noqa: BLE001 — assess() must NEVER raise
            logger.warning("[personastorm semantic] assess failed, degrading to formulas: %s", exc)
            return _empty_matrix(segments, "fallback_formulas")


def get_semantic_assessor(settings: Settings) -> SemanticAssessor:
    provider = settings.effective_semantic_provider
    if provider == "fireworks":
        if "api.fireworks.ai" in settings.fireworks_base_url and not settings.fireworks_api_key:
            logger.warning(
                "[personastorm semantic] SEMANTIC_PROVIDER=fireworks but FIREWORKS_API_KEY "
                "missing; using mock assessor."
            )
            return MockSemanticAssessor(settings.persona_seed)
        return LlmSemanticAssessor(
            settings.fireworks_api_key,
            settings.fireworks_base_url,
            settings.effective_semantic_model,
            settings.semantic_max_tokens,
            "fireworks",
        )
    if provider == "nvidia":
        if "integrate.api.nvidia.com" in settings.nvidia_base_url and not settings.nvidia_api_key:
            logger.warning(
                "[personastorm semantic] SEMANTIC_PROVIDER=nvidia but NVIDIA_API_KEY missing; "
                "using mock assessor."
            )
            return MockSemanticAssessor(settings.persona_seed)
        return LlmSemanticAssessor(
            settings.nvidia_api_key,
            settings.nvidia_base_url,
            settings.effective_semantic_model,
            settings.semantic_max_tokens,
            "nvidia",
        )
    return MockSemanticAssessor(settings.persona_seed)
