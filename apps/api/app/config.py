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
    # mock      -> deterministic local provider, no GPU / network needed (P0 demo)
    # fireworks -> Fireworks AI (OpenAI-compatible) — the real prototype's API
    # vllm      -> OpenAI-compatible vLLM server (target: AMD MI300X + ROCm)
    # nvidia    -> NVIDIA NIM (hosted build.nvidia.com or self-hosted container);
    #              kept as a reference/testing path
    inference_provider: Literal["mock", "nvidia", "vllm", "fireworks"] = "mock"

    # analyst/aggregator agent (executive summary, objection cluster labeling,
    # recommendations rewriting) — separate knob from the persona swarm provider.
    analyst_provider: Literal["mock", "nvidia", "fireworks"] = "mock"

    vllm_base_url: str = "http://localhost:8001/v1"
    vllm_model: str = "google/gemma-3-27b-it"
    vllm_api_key: str = "not-needed"  # vLLM ignores it unless --api-key is set

    # Fireworks AI — OpenAI-compatible; the real prototype's inference API.
    # Mirrors apps/web/lib/server/env.ts (FIREWORKS_* env vars).
    fireworks_api_key: str | None = None
    fireworks_base_url: str = "https://api.fireworks.ai/inference/v1"
    fireworks_model: str = "accounts/fireworks/models/deepseek-v4-flash"
    fireworks_max_tokens: int = 2048
    fireworks_max_retries: int = 3  # 429/5xx backoff attempts

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

    # --- live reasoning-model inference (nemotron) ---------------------------
    # Opt-in reasoning: send chat_template_kwargs.enable_thinking + reasoning_budget.
    # OFF by default so GLM-5.2 / mock / vllm paths are unchanged.
    nvidia_enable_thinking: bool = False
    nvidia_reasoning_budget: int | None = None
    # Swarm structured-output mode. None -> fall back to the legacy
    # nvidia_use_guided_json bool (True->guided_json, False->json_object).
    # "none" sends no structured-output field (matches nemotron's verified call).
    nvidia_structured_output: Literal["guided_json", "json_object", "none"] | None = None
    # Retry attempts on 429/5xx/transport errors for real providers.
    nvidia_max_retries: int = 3
    # Max fraction of persona reactions allowed to fail-after-retry before the
    # storm fails honestly rather than shipping a thin report.
    swarm_max_drop_fraction: float = 0.10
    # Optional analyst-only model override; falls back to nvidia_model.
    analyst_model: str | None = None

    # Semantic grounding assessor (spec §7) — separate knob from the persona
    # swarm and analyst providers. None -> defaults to the analyst provider
    # (mirrors env.ts's SEMANTIC_PROVIDER fallback chain); see
    # effective_semantic_provider / effective_semantic_model below.
    semantic_provider: Literal["mock", "nvidia", "fireworks"] | None = None
    semantic_model: str | None = None
    semantic_max_tokens: int = 2048

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

    # --- Supabase (auth + database) ------------------------------------------
    # All optional so the API still boots (and the test suite runs) without a
    # live Supabase. When these are unset the backend uses an in-memory gateway
    # + in-memory auth so local development and CI work end-to-end; production
    # MUST set them. See docs/deployment.md.
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    # HS256 secret used to verify Supabase-issued access tokens. Found in the
    # Supabase dashboard under Project Settings -> API -> JWT Secret.
    supabase_jwt_secret: str = ""
    # Starter credits granted to a brand-new user. Kept in sync with the
    # handle_new_user() SQL trigger (which is authoritative in production); this
    # value is only used by the in-memory dev/test gateway.
    starter_credits: int = 100

    # --- server --------------------------------------------------------------
    # Comma-separated exact origins allowed to call the API from a browser.
    # In production, add your deployed Vercel domain, e.g.
    #   CORS_ORIGINS=http://localhost:3000,https://personastorm.vercel.app
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Optional regex to match dynamic origins (e.g. Vercel preview deploys whose
    # subdomain changes per branch/commit). Example that covers all previews of
    # a project:  CORS_ORIGIN_REGEX=https://.*\\.vercel\\.app
    cors_origin_regex: str | None = None
    api_env: Literal["dev", "prod"] = "dev"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def supabase_configured(self) -> bool:
        """True when we have enough to talk to a real Supabase project."""
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def effective_structured_output(self) -> str:
        """Swarm structured-output mode. Explicit nvidia_structured_output wins;
        otherwise map the legacy nvidia_use_guided_json bool."""
        if self.nvidia_structured_output is not None:
            return self.nvidia_structured_output
        return "guided_json" if self.nvidia_use_guided_json else "json_object"

    @property
    def effective_semantic_provider(self) -> Literal["mock", "nvidia", "fireworks"]:
        """Explicit SEMANTIC_PROVIDER wins; otherwise mirror the analyst provider."""
        if self.semantic_provider is not None:
            return self.semantic_provider
        return self.analyst_provider if self.analyst_provider in ("nvidia", "fireworks") else "mock"

    @property
    def effective_semantic_model(self) -> str:
        """Model fallback ends at the provider actually making the call, so a
        bare SEMANTIC_PROVIDER=fireworks never sends an NVIDIA model id to
        Fireworks (mirrors env.ts's semanticModel resolution)."""
        default = (
            self.fireworks_model
            if self.effective_semantic_provider == "fireworks"
            else self.nvidia_model
        )
        return self.semantic_model or self.analyst_model or default


@lru_cache
def get_settings() -> Settings:
    return Settings()
