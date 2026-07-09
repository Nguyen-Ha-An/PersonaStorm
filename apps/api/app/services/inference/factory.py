"""Provider factory — the single place that maps INFERENCE_PROVIDER to code."""

from __future__ import annotations

from ...config import Settings
from .base import PersonaInferenceProvider
from .mock_provider import MockPersonaProvider
from .nvidia_provider import NvidiaProvider
from .vllm_provider import VLLMProvider


def get_provider(settings: Settings) -> PersonaInferenceProvider:
    match settings.inference_provider:
        case "mock":
            return MockPersonaProvider(seed=settings.persona_seed)
        case "vllm":
            return VLLMProvider(
                base_url=settings.vllm_base_url,
                model=settings.vllm_model,
                api_key=settings.vllm_api_key,
            )
        case "nvidia":
            return NvidiaProvider(
                api_key=settings.nvidia_api_key,
                base_url=settings.nvidia_base_url,
                model=settings.nvidia_model,
                structured_output=settings.effective_structured_output,
                max_tokens=settings.nvidia_max_tokens,
                enable_thinking=settings.nvidia_enable_thinking,
                reasoning_budget=settings.nvidia_reasoning_budget,
                max_retries=settings.nvidia_max_retries,
            )
        case other:  # pragma: no cover — pydantic Literal blocks this earlier
            raise ValueError(f"Unknown INFERENCE_PROVIDER: {other}")
