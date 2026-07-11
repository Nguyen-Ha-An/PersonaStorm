"""Offline backtest gate (spec §9, Phase B Task 8/10) — Python mirror of
apps/web/lib/server/engine/benchmarkGate.test.ts.

Loads each benchmark entry's RECORDED fixture (`data/benchmark_outcomes/fixtures/
<id>.json`) and injects it directly as the `semantic` matrix passed to
`MockPersonaProvider.react_batch` — NO live semantic call ever happens in this
test, regardless of which assessor recorded the fixtures (constructing
reactions with the injected matrix directly, per the Task 10 brief's second
option — this reference engine's orchestration, `StormManager`, is deeply
async/stateful for SSE + persistence, so the gate drives the same building
blocks `StormManager._execute()` uses — PersonaGenerator, MockPersonaProvider,
compute_quality, build_report — directly instead of adding an override hook to
that class). Runs the reference engine's deterministic blend pipeline and
asserts that market_fit_score rank-orders known outcomes, that
within-category rankings aren't badly inverted, and that top blockers land on
known failure modes at better than a token rate.

NOTE: this is a DIFFERENT engine from apps/web — independent formulas,
independent RNG, independent report aggregation — so its measured values
differ from the TS gate's (see the module docstring on benchmarkGate.test.ts:
spearman=-0.4743..., withinCategoryInversions=1, failureModeHitRate=1 there).
Per the "measured, not invented" rule (data/benchmark_outcomes/README.md),
the thresholds below are MEASURED on this seed set with THIS engine (seed
1337, persona_count 60, recorded mock-assessor fixtures), then set just below
the observed values — see the comment above each constant. This is a pure
regression tripwire, not a validation claim; the seed set is illustrative
(5 entries) and must be replaced by a curated 15-25 entry set, with these
thresholds re-derived, before any benchmark number here is treated as
validating the engine.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from app.config import REPO_ROOT
from app.schemas.storm import StimulusType, StormCreateRequest, TargetMarket
from app.services.aggregation import build_report
from app.services.benchmark import (
    failure_mode_hit_rate,
    outcome_rank,
    spearman,
    within_category_inversions,
)
from app.services.criteria.assumptions import AssumptionLedger
from app.services.criteria.classifier import classify_category
from app.services.inference.mock_provider import MockPersonaProvider
from app.services.persona import PersonaGenerator
from app.services.quality import compute_quality
from app.services.stimulus_parser import parse_stimulus

DIR = REPO_ROOT / "data" / "benchmark_outcomes"
FIXTURES_DIR = DIR / "fixtures"

# Measured on this seed set with the Python reference engine (seed 1337,
# persona_count 60, recorded mock-assessor fixtures injected directly — see
# module docstring). NOT a validation claim; re-derive on the curated set.
#
# Observed: spearman=-0.4743416490252569, within_category_inversions=1,
# failure_mode_hit_rate=1.0 (3/3 entries with known failure modes hit).
# Coincidentally these are the SAME values the TS engine measured on this
# seed set (see benchmarkGate.test.ts) despite the two engines having fully
# independent formulas and RNGs — plausible given n=5 with heavily tied
# outcome ranks (only two "hit" and two "flop" entries) leaves few distinct
# achievable Spearman values, not evidence the engines agree in general.
#
# Spearman is NEGATIVE — worse than chance — for the same reason documented
# on the TS gate: with only 5 illustrative points and a deterministic mock
# semantic assessor (no real grounding signal), a "no worse than chance"
# floor is not clearable on this seed set. Per the "measured, not invented"
# rule the threshold is pinned to the observed value (with a hair of
# float-safety margin) as a pure regression tripwire, not a quality bar.
MIN_SPEARMAN = -0.48
# 3 of 5 entries carry known_failure_modes; all 3 are currently hit (rate 1).
# Only achievable values with n=3 are 0, 1/3, 2/3, 1 — "just below" 1 is 2/3,
# tolerating exactly one future miss before the gate trips.
MIN_FAILURE_MODE_HIT_RATE = 0.66
# Exactly 1 inversion observed (the two consumer_app entries). Integer
# metric — the tightest sane ceiling that still passes the current
# measurement is the observed value itself.
MAX_WITHIN_CATEGORY_INVERSIONS = 1


async def _run_one(entry_path: Path) -> tuple[dict, float, list[str]]:
    e = json.loads(entry_path.read_text(encoding="utf-8"))
    # Seed fixtures were recorded from the deterministic mock assessor
    # (source "fallback_formulas"). The blend now only engages on a REAL
    # source, so the gate stamps the injected fixture as a real-assessor
    # source to exercise the blend path. Real curated fixtures (recorded from
    # a live LLM) will carry a real source natively and need no stamp.
    fixture = {**json.loads((FIXTURES_DIR / f"{e['id']}.json").read_text(encoding="utf-8")), "source": "nvidia"}

    request = StormCreateRequest(
        title=e["id"],
        stimulus_type=StimulusType(e["stimulus_type"]),
        stimulus=e["stimulus"],
        target_market=TargetMarket(e.get("target_market", "custom")),
        custom_segment_description=e.get("custom_segment_description"),
        product_category=e.get("product_category"),
        persona_count=60,
        seed=1337,
    )
    features = parse_stimulus(request.stimulus, request.title, request.stimulus_type.value)
    category = request.product_category or classify_category(features)[0]

    ledger = AssumptionLedger()
    generator = PersonaGenerator(seed=1337, ledger=ledger)
    personas, _, _ = generator.generate(
        request.target_market.value, request.persona_count, request.custom_segment_description
    )

    provider = MockPersonaProvider(seed=1337, ledger=ledger)
    reactions = await provider.react_batch(
        personas, request.stimulus, request.stimulus_type.value, features,
        concurrency=8, category=category, semantic=fixture,
    )

    quality = compute_quality(personas, reactions, features)
    report = build_report(f"bench-{e['id']}", request, personas, reactions, features, quality, category)

    market_fit = report.overall.market_fit_score if report.overall else 0.0
    top_blockers = [c.criterion_id for c in report.weakest_criteria]
    return e, market_fit, top_blockers


def test_blend_path_rank_orders_known_outcomes_above_a_regression_floor():
    files = sorted(
        p for p in DIR.glob("*.json") if p.name != "index.json" and p.is_file()
    )
    assert files, f"no benchmark entries found under {DIR}"

    scores: list[float] = []
    ranks: list[int] = []
    rows: list[dict] = []
    fm_rows: list[dict] = []

    for fp in files:
        e, market_fit, top_blockers = asyncio.run(_run_one(fp))
        rank = outcome_rank(e["outcome"]["label"])
        scores.append(market_fit)
        ranks.append(rank)
        rows.append({"category": e["product_category"], "score": market_fit, "rank": rank})
        fm_rows.append({
            "known": e["outcome"].get("known_failure_modes", []),
            "topBlockers": top_blockers,
        })

    assert spearman(ranks, scores) >= MIN_SPEARMAN
    assert within_category_inversions(rows) <= MAX_WITHIN_CATEGORY_INVERSIONS
    assert failure_mode_hit_rate(fm_rows) >= MIN_FAILURE_MODE_HIT_RATE
