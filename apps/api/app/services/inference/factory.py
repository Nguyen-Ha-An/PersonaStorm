"""Provider factory — the single place that maps INFERENCE_PROVIDER to code."""

from __future__ import annotations

from ...config import Settings
from .base import PersonaInferenceProvider
from .fireworks_provider import FireworksProvider
from .mock_provider import MockPersonaProvider
from .nim_provider import NIMProvider
from .vllm_provider import VLLMProvider


def get_provider(settings: Settings) -> PersonaInferenceProvider:
    match settings.inference_provider:
        case "mock":
            return MockPersonaProvider(seed=settings.persona_seed)
        case "fireworks":
            return FireworksProvider(
                api_key=settings.fireworks_api_key,
                base_url=settings.fireworks_base_url,
                model=settings.fireworks_model,
            )
        case "vllm":
            return VLLMProvider(
                base_url=settings.vllm_base_url,
                model=settings.vllm_model,
                api_key=settings.vllm_api_key,
            )
        case "nim":
            return NIMProvider(
                api_key=settings.nim_api_key,
                base_url=settings.nim_base_url,
                model=settings.nim_model,
                use_guided_json=settings.nim_use_guided_json,
                max_tokens=settings.nim_max_tokens,
            )
        case other:  # pragma: no cover — pydantic Literal blocks this earlier
            raise ValueError(f"Unknown INFERENCE_PROVIDER: {other}")
