"""Central configuration.

All runtime knobs live here so that swapping inference providers, pacing the
demo stream, or pointing at a real MI300X vLLM endpoint is a pure .env change —
never a code change. See .env.example at the repo root.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# personastorm/ repo root (config.py lives at apps/api/app/config.py)
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Environment-driven settings. Every field can be overridden via env vars."""

    # --- inference -----------------------------------------------------------
    # mock   -> deterministic local provider, no GPU / network needed (P0 demo)
    # vllm   -> OpenAI-compatible vLLM server (target: AMD MI300X + ROCm)
    # nvidia -> NVIDIA NIM (hosted build.nvidia.com or self-hosted container)
    inference_provider: Literal["mock", "nvidia", "vllm"] = "mock"

    # analyst/aggregator agent (executive summary, objection cluster labeling,
    # recommendations rewriting) — separate knob from the persona swarm provider.
    analyst_provider: Literal["mock", "nvidia"] = "mock"

    vllm_base_url: str = "http://localhost:8001/v1"
    vllm_model: str = "google/gemma-3-27b-it"
    vllm_api_key: str = "not-needed"  # vLLM ignores it unless --api-key is set

    # NVIDIA NIM — OpenAI-compatible. Default targets the hosted API catalog;
    # point nvidia_base_url at a self-hosted NIM container's /v1 to run on-GPU.
    nvidia_api_key: str | None = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "z-ai/glm-5.2"
    nvidia_use_guided_json: bool = True  # nvext.guided_json; False -> json_object mode
    nvidia_max_tokens: int = 2048  # reasoning model: leave headroom so JSON isn't truncated
    # analyst report narration is longer than a single persona reaction, and GLM-5.2
    # reasoning tokens count against max_tokens, so give it more headroom than nvidia_max_tokens.
    analyst_max_tokens: int = 4096

    # --- swarm pacing --------------------------------------------------------
    # The mock provider is instant, so we pace batches to make the live grid
    # readable for a human audience. Real providers replace pacing with actual
    # inference latency (interval then acts as a floor of 0).
    storm_batch_size: int = 25
    storm_batch_interval_ms: int = 350
    storm_max_concurrency: int = 8  # parallel requests for real providers

    # --- reproducibility -----------------------------------------------------
    persona_seed: int = 1337  # seeded RNG => identical demo runs on stage

    # --- storage -------------------------------------------------------------
    # P0: in-memory + JSON persistence. StorageBackend is an interface so
    # Postgres can slot in later (see services/storage.py).
    data_dir: Path = REPO_ROOT / "data"
    runs_dir: Path = REPO_ROOT / "data" / "runs"

    # --- server --------------------------------------------------------------
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    api_env: Literal["dev", "prod"] = "dev"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
