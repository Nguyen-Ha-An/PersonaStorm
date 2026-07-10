"""Storm Runner — orchestrates the full pipeline for one run:

  request -> Input Parser -> Persona Space Builder -> Diversity Validator
          -> batched swarm inference -> live collapse monitoring
          -> quality metrics -> aggregation -> persisted report

Concurrency model: one asyncio background task per storm; SSE subscribers read
the run's reaction list with their own cursor and await a change event. This
supports N concurrent viewers per storm and reconnects (a new subscriber
replays from 0, then tails). No external queue needed at P0 scale; the
architecture doc covers the Redis/worker upgrade path.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from ..config import Settings
from ..schemas.persona import Persona
from ..schemas.reaction import PersonaReaction
from ..schemas.report import StormReport
from ..schemas.storm import StormCreateRequest, StormMeta, StormStatus
from ..utils.text import normalize_objection
from .aggregation import build_report
from .analyst import AnalystProvider, get_analyst
from .criteria.classifier import classify_category
from .inference import MockPersonaProvider, PersonaInferenceProvider, get_provider
from .persona import PersonaGenerator
from .quality import RunningCollapseMonitor, compute_quality
from .stimulus_parser import StimulusFeatures, parse_stimulus
from .storage import JSONFileStorage
from .supabase_gateway import SupabaseGateway
from collections import Counter

logger = logging.getLogger(__name__)


def new_storm_id() -> str:
    return f"storm_{uuid.uuid4().hex[:12]}"


class SwarmDropCapExceeded(RuntimeError):
    """Raised when too many persona reactions failed after retries."""


def evaluate_drop_cap(generated: int, completed: int, max_fraction: float) -> str | None:
    """Decide what to do about persona reactions dropped after retries.

    Returns None when nothing was dropped, a note string when the dropped
    fraction is within `max_fraction`, and raises SwarmDropCapExceeded when it
    exceeds the cap (a systemic failure — bad key, endpoint down, always
    truncating — should fail the storm honestly, not ship a thin report).
    """
    dropped = generated - completed
    if dropped <= 0:
        return None
    if generated > 0 and dropped / generated > max_fraction:
        raise SwarmDropCapExceeded(
            f"{dropped} of {generated} persona reactions failed after retries "
            f"({dropped / generated:.0%} > {max_fraction:.0%} cap)"
        )
    return (
        f"{dropped} of {generated} persona reactions dropped after retries "
        "(live provider) — report reflects the smaller sample."
    )


class StormRun:
    def __init__(
        self,
        request: StormCreateRequest,
        seed: int,
        *,
        storm_id: str | None = None,
        owner_id: str | None = None,
        price_credits: int = 0,
    ):
        self.id = storm_id or new_storm_id()
        self.request = request
        self.seed = seed
        # Billing / ownership metadata for the SaaS layer.
        self.owner_id = owner_id
        self.price_credits = price_credits
        self.status: StormStatus = StormStatus.created
        self.error: str | None = None
        self.created_at = time.time()

        self.personas: list[Persona] = []
        self.reactions: list[PersonaReaction] = []
        self.features: StimulusFeatures | None = None
        self.category: str = "generic"
        self.diversity: dict[str, Any] | None = None
        self.report: StormReport | None = None

        # live aggregates for progress events
        self.wtp_sum = 0.0
        self.market_fit_sum = 0.0
        self.status_counts = {"green": 0, "yellow": 0, "red": 0}
        self._objection_counts: Counter[str] = Counter()
        self._objection_raw: dict[str, str] = {}
        self.collapse = RunningCollapseMonitor()

        self._change = asyncio.Event()

    # ---------------------------------------------------------------- signaling
    def notify(self) -> None:
        """Wake all stream subscribers. Same-loop only — safe with asyncio."""
        self._change.set()
        self._change = asyncio.Event()

    async def wait_change(self, timeout: float = 5.0) -> None:
        ev = self._change
        try:
            await asyncio.wait_for(ev.wait(), timeout)
        except asyncio.TimeoutError:
            pass  # heartbeat tick

    # ---------------------------------------------------------------- mutation
    def add_reaction(self, r: PersonaReaction) -> None:
        self.reactions.append(r)
        self.status_counts[r.status] += 1
        self.wtp_sum += r.max_price
        self.market_fit_sum += r.market_fit_score
        if r.first_objection.strip():
            key = normalize_objection(r.first_objection)
            self._objection_counts[key] += 1
            self._objection_raw.setdefault(key, r.first_objection)
        self.collapse.update(r)

    # ---------------------------------------------------------------- snapshots
    def top_objection(self) -> str:
        if not self._objection_counts:
            return ""
        key = self._objection_counts.most_common(1)[0][0]
        return self._objection_raw.get(key, "")

    def progress_snapshot(self) -> dict[str, Any]:
        done = len(self.reactions)
        return {
            "status": self.status.value,
            "completed": done,
            "total": self.request.persona_count,
            "green": self.status_counts["green"],
            "yellow": self.status_counts["yellow"],
            "red": self.status_counts["red"],
            "avg_max_price": round(self.wtp_sum / done, 2) if done else 0.0,
            "avg_market_fit": round(self.market_fit_sum / done, 3) if done else 0.0,
            "top_objection": self.top_objection(),
            "collapse_risk": self.collapse.level,
            "elapsed_ms": int((time.time() - self.created_at) * 1000),
        }

    def meta(self) -> StormMeta:
        return StormMeta(
            storm_id=self.id,
            title=self.request.title,
            status=self.status,
            stimulus_type=self.request.stimulus_type,
            target_market=self.request.target_market,
            persona_count=self.request.persona_count,
            completed=len(self.reactions),
            report_ready=self.report is not None,
            price_credits=self.price_credits,
            error=self.error,
        )

    def to_persist_dict(self) -> dict[str, Any]:
        return {
            "storm_id": self.id,
            "seed": self.seed,
            "request": self.request.model_dump(mode="json"),
            "diversity": self.diversity,
            "personas": [p.model_dump() for p in self.personas],
            "reactions": [r.model_dump() for r in self.reactions],
            "report": self.report.model_dump(mode="json") if self.report else None,
        }


class StormManager:
    """Owns all runs + provider selection. Created once at app startup."""

    def __init__(self, settings: Settings, gateway: SupabaseGateway | None = None):
        self.settings = settings
        self.gateway = gateway
        self.runs: dict[str, StormRun] = {}
        self.storage = JSONFileStorage(settings.runs_dir)
        self._tasks: set[asyncio.Task] = set()
        # Fail fast on misconfiguration: build the provider at startup, not
        # mid-storm. For mock we rebuild per-run so per-request seeds work.
        self.provider: PersonaInferenceProvider = get_provider(settings)
        # Analyst is optional narration over the already-computed report;
        # get_analyst() gracefully falls back to MockAnalyst if unconfigured.
        self.analyst: AnalystProvider = get_analyst(settings)

    # ------------------------------------------------------------------ create
    def create(
        self,
        request: StormCreateRequest,
        *,
        storm_id: str | None = None,
        owner_id: str | None = None,
        price_credits: int = 0,
    ) -> StormRun:
        seed = request.seed if request.seed is not None else self.settings.persona_seed
        run = StormRun(
            request,
            seed=seed,
            storm_id=storm_id,
            owner_id=owner_id,
            price_credits=price_credits,
        )
        self.runs[run.id] = run
        task = asyncio.create_task(self._execute(run), name=f"storm-{run.id}")
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return run

    def get(self, storm_id: str) -> StormRun | None:
        return self.runs.get(storm_id)

    def _provider_for(self, run: StormRun) -> PersonaInferenceProvider:
        if isinstance(self.provider, MockPersonaProvider):
            return MockPersonaProvider(seed=run.seed)  # per-run reproducibility
        return self.provider

    # ----------------------------------------------------------------- pipeline
    async def _execute(self, run: StormRun) -> None:
        s = self.settings
        try:
            # 1) Input Parser
            run.features = parse_stimulus(
                run.request.stimulus, run.request.title, run.request.stimulus_type.value
            )
            # One product category for the whole run: explicit override wins,
            # else auto-detect from the parsed stimulus. Drives criteria weights.
            run.category = run.request.product_category or classify_category(run.features)[0]

            # 2) Persona Space Builder + 3) Diversity Validator
            run.status = StormStatus.generating_personas
            run.notify()
            generator = PersonaGenerator(seed=run.seed)
            personas, diversity, priors_meta = generator.generate(
                run.request.target_market.value,
                run.request.persona_count,
                run.request.custom_segment_description,
            )
            # priors_meta (data_files vs embedded_unverified honesty label) is
            # kept in scope for Task 12 (surfacing calibration provenance).
            run.personas = personas
            run.diversity = diversity.to_dict()
            if diversity.warnings:
                logger.warning("diversity warnings for %s: %s", run.id, diversity.warnings)

            # 4) Persona Reaction Engine — batched swarm inference
            run.status = StormStatus.running
            run.notify()
            provider = self._provider_for(run)
            batch, interval = s.storm_batch_size, s.storm_batch_interval_ms / 1000.0
            for i in range(0, len(personas), batch):
                chunk = personas[i:i + batch]
                reactions = await provider.react_batch(
                    chunk, run.request.stimulus, run.request.stimulus_type.value,
                    run.features, concurrency=s.storm_max_concurrency,
                    category=run.category,
                )
                for r in reactions:
                    run.add_reaction(r)
                run.notify()
                # Pacing exists for demo readability with the instant mock;
                # real providers are paced by actual inference latency.
                if provider.name == "mock" and interval > 0:
                    await asyncio.sleep(interval)

            # Bounded failure tolerance: react_batch drops personas that fail
            # after retries. Enforce the cap (raises -> storm fails + refund) and
            # remember the note to attach to the report below.
            drop_note = evaluate_drop_cap(
                len(run.personas), len(run.reactions), s.swarm_max_drop_fraction
            )

            # 5) Quality Checker + Collapse Detector (full-run pass)
            run.status = StormStatus.aggregating
            run.notify()
            quality = compute_quality(
                run.personas, run.reactions, run.features,
                benchmark_dir=s.data_dir / "benchmark_samples",
            )

            # 6) Aggregator -> final report, then optional Analyst re-narration
            run.report = build_report(
                run.id, run.request, run.personas, run.reactions, run.features,
                quality, run.category,
            )
            if drop_note:
                run.report.quality.notes.append(drop_note)
            # enhance_report() is contractually safe (never raises), but we
            # guard it here too: a storm must NEVER fail because of the
            # analyst, whatever goes wrong.
            try:
                run.report = await self.analyst.enhance_report(run.report)
            except Exception as exc:  # noqa: BLE001 — analyst is best-effort only
                logger.warning(
                    "analyst.enhance_report raised unexpectedly for %s, keeping "
                    "deterministic report: %s", run.id, exc,
                )
            run.status = StormStatus.complete
            run.notify()

            # 7) Persist (best-effort)
            self.storage.save_run(run.id, run.to_persist_dict())
            await self._record_completion(run)
            logger.info("storm %s complete: %s", run.id, run.progress_snapshot())

        except Exception as exc:  # noqa: BLE001 — surface any failure to clients
            logger.exception("storm %s failed", run.id)
            run.status = StormStatus.failed
            run.error = str(exc)
            run.notify()
            await self._record_failure(run, exc)

    # -------------------------------------------------------- billing / DB sync
    async def _record_completion(self, run: StormRun) -> None:
        """Mark the storm_runs row complete and store the final report JSON.
        Best-effort: a DB hiccup must never fail a storm the user already paid
        for and saw finish."""
        if self.gateway is None or run.owner_id is None:
            return
        try:
            report_json = run.report.model_dump(mode="json") if run.report else None
            await self.gateway.update_storm(
                run.id,
                {
                    "status": "complete",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "report_json": report_json,
                },
            )
        except Exception:  # noqa: BLE001
            logger.exception("failed to record completion for %s", run.id)

    async def _record_failure(self, run: StormRun, exc: Exception) -> None:
        """Mark the storm failed and refund the credits the user was charged.
        The charge happens up-front at create time; a run that never produced a
        report should not cost the user anything."""
        if self.gateway is None or run.owner_id is None:
            return
        try:
            await self.gateway.update_storm(
                run.id, {"status": "failed", "error": str(exc)[:1000]}
            )
        except Exception:  # noqa: BLE001
            logger.exception("failed to mark storm %s failed", run.id)
        if run.price_credits and run.price_credits > 0:
            try:
                await self.gateway.adjust_wallet(
                    run.owner_id,
                    run.price_credits,
                    "refund",
                    description=f"Refund — storm {run.id} failed",
                    storm_id=run.id,
                    actor_user_id=run.owner_id,
                )
                logger.info("refunded %s credits for failed storm %s", run.price_credits, run.id)
            except Exception:  # noqa: BLE001
                logger.exception("failed to refund credits for storm %s", run.id)

    # ------------------------------------------------------------------ stream
    async def event_stream(self, run: StormRun) -> AsyncGenerator[tuple[str, dict], None]:
        """Yields (event_name, payload). Route layer turns these into SSE.
        New subscribers replay history first, then tail — reconnect-safe."""
        yield "init", {
            "storm_id": run.id,
            "title": run.request.title,
            "persona_count": run.request.persona_count,
            "target_market": run.request.target_market.value,
            "status": run.status.value,
        }
        cursor = 0
        while True:
            drained = False
            while cursor < len(run.reactions):
                r = run.reactions[cursor]
                yield "reaction", {
                    "persona_id": r.persona_id,
                    "index": cursor,
                    "segment": r.segment,
                    "buy_likelihood": r.buy_likelihood,
                    "max_price": r.max_price,
                    "status": r.status,
                    "first_objection": r.first_objection,
                    "quote": r.quote,
                }
                cursor += 1
                drained = True
            if drained or run.status in (StormStatus.complete, StormStatus.failed):
                yield "progress", run.progress_snapshot()
            if run.status == StormStatus.complete:
                yield "complete", {
                    "storm_id": run.id,
                    "report_ready": True,
                    "adoption": run.status_counts,
                }
                return
            if run.status == StormStatus.failed:
                yield "error", {"message": run.error or "storm failed"}
                return
            await run.wait_change(timeout=5.0)
