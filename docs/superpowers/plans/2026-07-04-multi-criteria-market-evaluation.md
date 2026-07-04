# Multi-Criteria Market Evaluation Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn PersonaStorm's single-scorecard reaction engine into a calibrated multi-criteria market evaluation engine with an age/life-stage overlay, a system-computed `market_fit_score`, and a diagnosing report dashboard.

**Architecture:** New `app/services/criteria/` package owns the criteria registry, category presets, age overlays, category classifier, and the one authoritative `compute_market_fit` scorer. The mock provider (and the LLM parse path) produce 17 core + dynamic overlay criterion scores per persona; scoring blends category-weighted core with an age overlay, applies bounded modifiers and rare explained hard gates, and clamps. Aggregation adds criteria/age-cohort breakdowns and weakness diagnosis; quality adds a consistency checker. The Next.js frontend gains a progressive-disclosure "Market Evaluation Dashboard." Existing structure, SSE streaming, and mock-only local run are preserved.

**Tech Stack:** Python 3.10, FastAPI, Pydantic v2, pytest; Next.js 14 (App Router), React, TypeScript, Tailwind; zero new runtime dependencies (hand-rolled SVG charts).

## Global Constraints

- Full design spec: `docs/superpowers/specs/2026-07-04-multi-criteria-market-evaluation-design.md`. Every task's requirements implicitly include it.
- Preserve existing folder conventions: business logic under `apps/api/app/services/<domain>/`; no module renames. New criteria code lives in `app/services/criteria/`.
- Mock inference MUST stay fully runnable locally with no GPU and no API keys. `INFERENCE_PROVIDER=mock` is the default and the demo path.
- All criterion scores (core + overlay) are floats in `[0,1]`. `market_fit_score` is computed by `compute_market_fit`, never invented by a model.
- Barrier criteria (`proof_requirement`, `safety_concern`, `subscription_fatigue`) are inverted (`1 - x`) before contributing to any weighted score.
- Never claim a persona is a real human. Never expose chain-of-thought; `reasoning_summary` is a one-sentence public rationale (≤400 chars, no newlines).
- No dead buttons in the UI. Progressive disclosure: top-3 blockers and top-5 criteria first, expandable to all 17.
- Determinism: mock RNG seeded by `run_seed:persona_id:stimulus_hash`; identical inputs → identical outputs.
- Keep `reasoning_summary` as a top-level reaction field (existing tests + product rule #4 depend on it).
- Backward-compat bridge: `PersonaReaction` exposes read-only `@property` shims (`buy_likelihood`, `status`, `max_price`, `first_objection`, `quote`, `positive_trigger`, `segment`) proxying into nested objects, so `storm_runner`, `objections.py`, `metrics.py`, and the SSE payload keep working.
- This project is not a git repo. Before the first commit, run `git init` (Task 0). Commit after each task.

---

## File Structure

**New backend files**
- `apps/api/app/services/criteria/__init__.py` — package exports
- `apps/api/app/services/criteria/registry.py` — 17 core criteria + polarity/groups
- `apps/api/app/services/criteria/presets.py` — 10 category weight vectors + `age_overlay_lambda`
- `apps/api/app/services/criteria/age_overlays.py` — 6 life stages, overlay criteria, age bands
- `apps/api/app/services/criteria/classifier.py` — stimulus → category
- `apps/api/app/services/criteria/scoring.py` — `compute_market_fit`, `MarketFitBreakdown`
- `apps/api/app/services/aggregation/criteria_aggregation.py` — criteria breakdown + weakness diagnosis
- `apps/api/app/services/aggregation/age_analysis.py` — age-cohort reports
- `apps/api/app/services/quality/consistency_checker.py` — internal-consistency rules
- `apps/api/tests/test_criteria.py`, `test_scoring.py`, `test_consistency.py`, `test_age.py`

**Modified backend files**
- `schemas/persona.py` (life_stage, decision_context), `schemas/reaction.py` (nested), `schemas/report.py` (overall, criteria, age_cohorts, panels), `schemas/storm.py` (product_category)
- `services/persona/generator.py`, `services/persona/diversity.py`
- `services/inference/mock_provider.py` (major), `services/inference/prompts.py`, `services/inference/fireworks_provider.py` (shared `parse_llm_reaction`)
- `services/aggregation/report_builder.py`, `services/quality/metrics.py`
- `services/stimulus_parser.py` (add high-risk + AI-tool signals if needed)

**Modified frontend files**
- `apps/web/lib/types.ts`, `apps/web/lib/samples.ts`
- `apps/web/app/page.tsx` (category selector, rename)
- `apps/web/app/storm/[id]/page.tsx` + `components/storm/*` (live market-fit + collapse)
- `apps/web/app/storm/[id]/report/page.tsx` + new `components/report/*`

**Docs:** `README.md`, `docs/{architecture,criteria-system,api-contract,evaluation-framework,inference-roadmap,training-roadmap,demo-script}.md`, `data/sample_inputs/ai_saas_*.md`

---

## Task 0: Initialize git

- [ ] **Step 1:** From `personastorm/`, run `git init` and add a `.gitignore` entry check (repo already has `.gitignore`).
- [ ] **Step 2:** Stage and make the baseline commit.

```bash
cd personastorm
git init
git add -A
git commit -m "chore: baseline before multi-criteria upgrade"
```

Expected: repo initialized, one commit.

---

## Task 1: Core criteria registry

**Files:**
- Create: `apps/api/app/services/criteria/__init__.py`
- Create: `apps/api/app/services/criteria/registry.py`
- Test: `apps/api/tests/test_criteria.py`

**Interfaces:**
- Produces:
  - `Criterion` dataclass: `id: str, label: str, description: str, score_type: str, higher_is_better: bool, group: str`
  - `CORE_CRITERIA: tuple[Criterion, ...]` (17, ordered)
  - `CORE_IDS: tuple[str, ...]`
  - `CRITERION_BY_ID: dict[str, Criterion]` (includes overlay criteria registered in Task 3)
  - `register(criteria)` — used by age_overlays to add overlay criteria
  - `is_barrier(cid: str) -> bool` (= `not higher_is_better`)
  - `effective(cid: str, score: float) -> float` (= `score if higher_is_better else 1 - score`)

- [ ] **Step 1: Write the failing test**

```python
# apps/api/tests/test_criteria.py
from app.services.criteria import registry as reg

def test_core_has_17_criteria():
    assert len(reg.CORE_CRITERIA) == 17
    assert len(reg.CORE_IDS) == 17
    assert len(set(reg.CORE_IDS)) == 17

def test_proof_requirement_is_barrier():
    assert reg.is_barrier("proof_requirement") is True
    assert reg.CRITERION_BY_ID["proof_requirement"].higher_is_better is False

def test_trust_is_positive():
    assert reg.is_barrier("trust") is False

def test_effective_inverts_barriers():
    assert reg.effective("trust", 0.8) == 0.8
    assert abs(reg.effective("proof_requirement", 0.8) - 0.2) < 1e-9
```

- [ ] **Step 2: Run — expect fail** `cd apps/api && python -m pytest tests/test_criteria.py -q` → ImportError.

- [ ] **Step 3: Implement `registry.py`**

```python
"""Core criteria registry — single source of truth for criterion polarity."""
from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class Criterion:
    id: str
    label: str
    description: str
    higher_is_better: bool
    group: str
    score_type: str = "0_to_1"

_CORE = [
    Criterion("problem_awareness", "Problem Awareness", "Does the persona recognize the problem?", True, "problem"),
    Criterion("need_intensity", "Need Intensity", "How painful/important is the problem for this persona?", True, "problem"),
    Criterion("urgency", "Urgency", "How soon would this persona want a solution?", True, "problem"),
    Criterion("solution_fit", "Solution Fit", "How well does the product match the persona's actual need?", True, "value"),
    Criterion("value_clarity", "Value Clarity", "How clearly does the persona understand the value?", True, "value"),
    Criterion("differentiation", "Differentiation", "How different does it feel from existing alternatives?", True, "value"),
    Criterion("trust", "Trust", "How much does the persona trust the product's claims?", True, "trust_risk"),
    Criterion("proof_requirement", "Proof Requirement", "How much proof this persona needs before believing/buying (barrier).", False, "trust_risk"),
    Criterion("pricing_acceptance", "Pricing Acceptance", "How acceptable is the current/implied price?", True, "pricing"),
    Criterion("perceived_roi", "Perceived ROI", "Does the persona believe it's worth the cost?", True, "pricing"),
    Criterion("ease_of_understanding", "Ease of Understanding", "How easy is it to understand what the product does?", True, "adoption"),
    Criterion("workflow_fit", "Workflow Fit", "How naturally does it fit current habits/workflow?", True, "adoption"),
    Criterion("switching_willingness", "Switching Willingness", "How willing to change from current alternatives?", True, "adoption"),
    Criterion("activation_likelihood", "Activation Likelihood", "How likely to try it soon?", True, "adoption"),
    Criterion("repeat_usage_potential", "Repeat Usage", "How likely to use it repeatedly?", True, "retention"),
    Criterion("shareability", "Shareability", "How likely to tell others about it?", True, "virality"),
    Criterion("retention_potential", "Retention Potential", "How likely to keep using/paying?", True, "retention"),
]

CORE_CRITERIA: tuple[Criterion, ...] = tuple(_CORE)
CORE_IDS: tuple[str, ...] = tuple(c.id for c in _CORE)
CRITERION_BY_ID: dict[str, Criterion] = {c.id: c for c in _CORE}

def register(criteria: list[Criterion]) -> None:
    for c in criteria:
        CRITERION_BY_ID.setdefault(c.id, c)

def is_barrier(cid: str) -> bool:
    c = CRITERION_BY_ID.get(cid)
    return c is not None and not c.higher_is_better

def effective(cid: str, score: float) -> float:
    return (1.0 - score) if is_barrier(cid) else score
```

```python
# apps/api/app/services/criteria/__init__.py
from . import registry, presets, age_overlays, classifier, scoring  # noqa: F401
```

Note: `__init__.py` imports are added incrementally as later tasks create those modules; for Task 1 include only `from . import registry`.

- [ ] **Step 4: Run — expect pass** `python -m pytest tests/test_criteria.py -q`.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(criteria): core criteria registry with polarity"`

---

## Task 2: Category presets

**Files:**
- Create: `apps/api/app/services/criteria/presets.py`
- Test: `apps/api/tests/test_criteria.py` (extend)

**Interfaces:**
- Produces:
  - `CATEGORY_IDS: tuple[str, ...]` (the 10)
  - `resolve_preset(category: str) -> Preset` where `Preset` has `category: str`, `weights: dict[str,float]` (normalized to 1.0 over CORE_IDS present), `age_overlay_lambda: float`
  - unknown category → `generic`

- [ ] **Step 1: Write the failing test**

```python
from app.services.criteria import presets as pre

def test_ten_categories():
    assert set(pre.CATEGORY_IDS) == {
        "ai_tool","b2b_saas","consumer_app","ecommerce_product","education_product",
        "marketplace","social_product","hardware_product","luxury_product","generic"}

def test_weights_normalize_to_one():
    for cat in pre.CATEGORY_IDS:
        p = pre.resolve_preset(cat)
        assert abs(sum(p.weights.values()) - 1.0) < 1e-6

def test_unknown_falls_back_to_generic():
    assert pre.resolve_preset("nonsense").category == "generic"

def test_lambda_in_range():
    for cat in pre.CATEGORY_IDS:
        assert 0.0 <= pre.resolve_preset(cat).age_overlay_lambda <= 0.35
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement `presets.py`** — raw weight dicts per category (only the criteria that matter, others default to a small floor so every CORE_ID is present), normalized in `resolve_preset`. Include `age_overlay_lambda` per §4.2 (ai_tool .12, b2b_saas .07, consumer_app .20, ecommerce_product .15, education_product .25, marketplace .15, social_product .22, hardware_product .15, luxury_product .20, generic .15).

```python
from __future__ import annotations
from dataclasses import dataclass
from .registry import CORE_IDS

@dataclass(frozen=True)
class Preset:
    category: str
    weights: dict
    age_overlay_lambda: float

_FLOOR = 0.02  # every core criterion keeps a small non-zero weight

_RAW: dict[str, dict] = {
    "ai_tool": {"trust":.14,"differentiation":.13,"proof_requirement":.12,"value_clarity":.10,
                "perceived_roi":.10,"workflow_fit":.09,"pricing_acceptance":.08,"need_intensity":.08,
                "activation_likelihood":.07,"retention_potential":.05,"shareability":.04},
    "b2b_saas": {"perceived_roi":.15,"workflow_fit":.14,"trust":.12,"switching_willingness":.11,
                 "pricing_acceptance":.10,"proof_requirement":.10,"solution_fit":.09,"differentiation":.06,
                 "activation_likelihood":.05,"retention_potential":.04},
    "consumer_app": {"ease_of_understanding":.15,"activation_likelihood":.14,"shareability":.12,
                     "retention_potential":.11,"value_clarity":.10,"need_intensity":.09,"solution_fit":.08,
                     "repeat_usage_potential":.07,"differentiation":.05},
    "ecommerce_product": {"perceived_roi":.13,"pricing_acceptance":.13,"trust":.12,"value_clarity":.11,
                          "differentiation":.10,"need_intensity":.09,"solution_fit":.08,"proof_requirement":.08,
                          "shareability":.05},
    "education_product": {"trust":.14,"proof_requirement":.12,"perceived_roi":.12,"pricing_acceptance":.11,
                          "need_intensity":.10,"repeat_usage_potential":.09,"solution_fit":.08,"value_clarity":.07},
    "marketplace": {"trust":.14,"need_intensity":.12,"activation_likelihood":.11,"value_clarity":.10,
                    "pricing_acceptance":.09,"differentiation":.09,"retention_potential":.08,"shareability":.07},
    "social_product": {"shareability":.16,"activation_likelihood":.13,"retention_potential":.12,
                       "need_intensity":.10,"ease_of_understanding":.10,"value_clarity":.08,"differentiation":.07},
    "hardware_product": {"perceived_roi":.13,"trust":.12,"proof_requirement":.11,"differentiation":.11,
                         "value_clarity":.10,"pricing_acceptance":.10,"need_intensity":.09,"solution_fit":.08},
    "luxury_product": {"differentiation":.16,"trust":.13,"perceived_roi":.11,"shareability":.11,
                       "need_intensity":.10,"value_clarity":.09,"pricing_acceptance":.06,"retention_potential":.06},
    "generic": {},  # all-floor => uniform
}
_LAMBDA = {"ai_tool":.12,"b2b_saas":.07,"consumer_app":.20,"ecommerce_product":.15,"education_product":.25,
           "marketplace":.15,"social_product":.22,"hardware_product":.15,"luxury_product":.20,"generic":.15}
CATEGORY_IDS = tuple(_RAW.keys())

def resolve_preset(category: str) -> Preset:
    cat = category if category in _RAW else "generic"
    raw = {cid: _RAW[cat].get(cid, _FLOOR) for cid in CORE_IDS}
    total = sum(raw.values())
    weights = {cid: w / total for cid, w in raw.items()}
    return Preset(category=cat, weights=weights, age_overlay_lambda=_LAMBDA[cat])
```

- [ ] **Step 4: Run — expect pass.**
- [ ] **Step 5: Commit** `git commit -am "feat(criteria): 10 category weight presets"`

---

## Task 3: Age/life-stage overlays

**Files:**
- Create: `apps/api/app/services/criteria/age_overlays.py`
- Test: `apps/api/tests/test_age.py`

**Interfaces:**
- Produces:
  - `LIFE_STAGES: tuple[str, ...]` (`teen_student, student_young_adult, early_career, parent_family, established_adult, older_adult`)
  - `life_stage_for(age: int) -> str`
  - `overlay_ids_for(life_stage: str) -> tuple[str, ...]`
  - `lambda_bump(life_stage: str) -> float`
  - registers overlay `Criterion`s (with polarity) into `registry.CRITERION_BY_ID` on import

- [ ] **Step 1: Write the failing test**

```python
from app.services.criteria import age_overlays as ao
from app.services.criteria import registry as reg

def test_life_stage_bands():
    assert ao.life_stage_for(15) == "teen_student"
    assert ao.life_stage_for(21) == "student_young_adult"
    assert ao.life_stage_for(30) == "early_career"
    assert ao.life_stage_for(40) == "parent_family"
    assert ao.life_stage_for(52) == "established_adult"
    assert ao.life_stage_for(70) == "older_adult"

def test_teen_overlay_criteria():
    ids = ao.overlay_ids_for("teen_student")
    assert "parent_approval" in ids and "safety_concern" in ids

def test_barrier_overlays_registered():
    assert reg.is_barrier("safety_concern") is True
    assert reg.is_barrier("subscription_fatigue") is True
    assert reg.is_barrier("parent_approval") is False
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement `age_overlays.py`** — define the 6 stages with age bands and overlay criteria per §4.3; build `Criterion` objects (barriers: `safety_concern`, `subscription_fatigue`) and call `registry.register(...)`. `lambda_bump`: teen_student +0.08, older_adult +0.06, parent_family +0.03, else 0.0. Add `from . import age_overlays` to `criteria/__init__.py`.

- [ ] **Step 4: Run — expect pass.**
- [ ] **Step 5: Commit** `git commit -am "feat(criteria): age/life-stage overlays"`

---

## Task 4: Scoring function (`compute_market_fit`)

**Files:**
- Create: `apps/api/app/services/criteria/scoring.py`
- Test: `apps/api/tests/test_scoring.py`

**Interfaces:**
- Consumes: `registry.effective`, `presets.resolve_preset`, `age_overlays.lambda_bump`
- Produces:
  - `MarketFitBreakdown` (pydantic BaseModel): `market_fit_score, category_weighted_core_score, age_overlay_score, age_overlay_lambda, modifier_adjustment, modifier_reasons: list[str], gates: list[dict]`
  - `compute_market_fit(core: dict[str,float], overlay: dict[str,float], category: str, life_stage: str, *, is_high_risk: bool=False, is_teen_paid_edu: bool=False) -> MarketFitBreakdown`

- [ ] **Step 1: Write the failing tests**

```python
from app.services.criteria.scoring import compute_market_fit
from app.services.criteria.registry import CORE_IDS

def _flat(v): return {c: v for c in CORE_IDS}

def test_market_fit_in_range_and_barrier_inverted():
    # proof_requirement high should LOWER fit vs low, all else equal
    hi = compute_market_fit({**_flat(0.6), "proof_requirement":0.9}, {}, "ai_tool", "early_career")
    lo = compute_market_fit({**_flat(0.6), "proof_requirement":0.1}, {}, "ai_tool", "early_career")
    assert 0.0 <= hi.market_fit_score <= 1.0
    assert hi.market_fit_score < lo.market_fit_score

def test_blend_uses_lambda():
    b = compute_market_fit(_flat(0.8), {"career_value":0.2,"productivity_gain":0.2}, "consumer_app", "early_career")
    assert b.age_overlay_lambda > 0
    assert b.age_overlay_score < b.category_weighted_core_score

def test_modifier_bounds():
    b = compute_market_fit({**_flat(0.5),"trust":0.1,"proof_requirement":0.9}, {}, "generic", "early_career")
    assert -0.10 <= b.modifier_adjustment <= 0.10
    assert any("trust" in r.lower() for r in b.modifier_reasons)

def test_hard_gate_teen_parent_approval():
    b = compute_market_fit(_flat(0.7), {"parent_approval":0.1}, "education_product", "teen_student", is_teen_paid_edu=True)
    assert b.gates and b.gates[0]["score_multiplier"] == 0.75
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement `scoring.py`** per §5 exactly:
  1. `category_weighted_core_score = Σ weight[c]·effective(c, core[c])`
  2. `age_overlay_score = mean(effective(c, overlay[c]))` (fallback to core score if overlay empty)
  3. `age_overlay_lambda = clamp(preset.age_overlay_lambda + lambda_bump(life_stage), 0.05, 0.35)`
  4. `raw = (1-λ)·core + λ·overlay`
  5. bounded modifiers (rules in §5), collect reasons, clamp adjustment to ±0.10
  6. `score = clamp(raw + adj, 0,1)`
  7. hard gates (teen paid-edu parent_approval<0.20 → ×0.75; high-risk trust<0.20 → ×0.60), append gate dicts
  8. clamp final `[0,1]`

- [ ] **Step 4: Run — expect pass.**
- [ ] **Step 5: Commit** `git commit -am "feat(criteria): compute_market_fit blend+modifiers+gates"`

---

## Task 5: Category classifier

**Files:**
- Create: `apps/api/app/services/criteria/classifier.py`
- Test: `apps/api/tests/test_criteria.py` (extend)

**Interfaces:**
- Consumes: `StimulusFeatures` from `services.stimulus_parser`
- Produces: `classify_category(features) -> tuple[str, float]` (category in `CATEGORY_IDS`, confidence 0..1); `is_high_risk(features) -> bool`

- [ ] **Step 1: Test**

```python
from app.services.criteria.classifier import classify_category, is_high_risk
from app.services.stimulus_parser import parse_stimulus

def test_ai_saas_classifies_reasonably():
    f = parse_stimulus("AI copilot for sales teams. CRM integration, SSO, $40/seat/mo.","X","product_concept")
    cat, conf = classify_category(f)
    assert cat in {"ai_tool","b2b_saas"} and conf > 0

def test_high_risk_flag():
    f = parse_stimulus("A telehealth app that stores your medical records and payment data.","X","product_concept")
    assert is_high_risk(f) is True
```

- [ ] **Step 2–4:** Implement keyword+signal scoring mapping the parser's existing `category` and flags to the 10 preset categories, plus keyword sets for luxury/marketplace/social/hardware/ai_tool; `is_high_risk` from finance/medical/health/safety/childcare/payments keywords. Run tests to pass.
- [ ] **Step 5: Commit** `git commit -am "feat(criteria): stimulus category classifier + high-risk flag"`

---

## Task 6: Persona schema — life_stage + decision_context

**Files:**
- Modify: `apps/api/app/schemas/persona.py`
- Modify: `apps/api/app/services/persona/generator.py`
- Modify: `apps/api/app/services/persona/diversity.py`
- Test: `apps/api/tests/test_generator.py` (extend), `apps/api/tests/test_age.py` (extend)

**Interfaces:**
- Produces: `Persona.life_stage: str` (auto-derived from `age` via `model_validator` if not supplied), `Persona.decision_context: DecisionContext` (default empty). `DecisionContext` fields per §6, all optional.
- Generator sets `life_stage` + populates `decision_context` (teen fields when teen). Diversity validator adds `age_cohort_spread` warning.

- [ ] **Step 1: Test** — construct a `Persona` without `life_stage` → it derives from age; generate `parents`/`sea_genz` populations and assert ≥2 distinct life stages appear; teens carry `needs_parent_approval`.
- [ ] **Step 2: Run — expect fail.**
- [ ] **Step 3: Implement** — add `DecisionContext` model + fields; `@model_validator(mode="after")` fills `life_stage` from `age` via `age_overlays.life_stage_for`; generator builds context deterministically; diversity adds cohort check (warn only).
- [ ] **Step 4: Run — expect pass**; also run existing `test_generator.py`.
- [ ] **Step 5: Commit** `git commit -am "feat(persona): life_stage + decision_context"`

---

## Task 7: Reaction schema — nested multi-criteria

**Files:**
- Modify: `apps/api/app/schemas/reaction.py`
- Test: `apps/api/tests/test_criteria.py` (extend with a schema round-trip test)

**Interfaces:**
- Produces nested `PersonaReaction`:
  - `persona_id, segment, sub_segment, life_stage`
  - `decision: Decision` (`overall_buy_likelihood, market_fit_score, status, max_price, currency, recommended_pricing_model`) — pricing enum adds `freemium`
  - `criteria_scores: CoreCriteriaScores` (17 fields, `0..1`), `.as_dict()`
  - `age_specific_scores: dict[str,float]`
  - `qualitative: Qualitative` (`first_objection, top_positive_trigger, top_negative_trigger, dealbreaker, proof_needed, emotional_reaction, would_tell, quote`)
  - `research_recommendation: ResearchRecommendation`
  - `reasoning_summary: str` (top-level, ≤400)
  - optional `market_fit_breakdown: MarketFitBreakdown | None`
  - `@property` shims: `buy_likelihood, status, max_price, first_objection, quote, positive_trigger` (→ `top_positive_trigger`); keep `status_for`, thresholds.

- [ ] **Step 1: Test** — build a `PersonaReaction` from nested pieces; assert `r.buy_likelihood == r.decision.overall_buy_likelihood`, `r.first_objection == r.qualitative.first_objection`, `r.max_price` works, and `model_dump()` contains `criteria_scores` + `age_specific_scores` + `decision.market_fit_score`.
- [ ] **Step 2: Run — expect fail.**
- [ ] **Step 3: Implement** the nested models + property shims; keep `CRITERIA`/`status_for`/thresholds for compat (or re-export). Ensure all 17 fields validate `[0,1]`.
- [ ] **Step 4: Run — expect pass.**
- [ ] **Step 5: Commit** `git commit -am "feat(reaction): nested multi-criteria schema + compat shims"`

---

## Task 8: Mock provider rewrite

**Files:**
- Modify: `apps/api/app/services/inference/mock_provider.py`
- Test: `apps/api/tests/test_mock_provider.py` (update + extend)

**Interfaces:**
- Consumes: `compute_market_fit`, `classify_category`/`is_high_risk` (category passed in from runner via features; provider re-derives if absent), `age_overlays.overlay_ids_for`
- Produces: nested `PersonaReaction` for each persona with all 17 core + life-stage overlay scores, `market_fit_score` from `compute_market_fit`, `overall_buy_likelihood` (adoption blend + need×fit − inertia), `status = status_for(buy_likelihood)`, `recommended_pricing_model`, `research_recommendation`, full qualitative fields, `reasoning_summary` narrating top criterion contributions.

- [ ] **Step 1: Update tests** — keep determinism/variety/price-sensitivity tests (they use `.max_price/.status/.quote/.first_objection/.reasoning_summary` via shims). Add:
  - all 17 `criteria_scores` present and in `[0,1]`
  - `age_specific_scores` non-empty and keys == `overlay_ids_for(life_stage)`
  - higher skepticism → lower mean `trust` and higher mean `proof_requirement`
  - `market_fit_score` equals `compute_market_fit(...)` recomputation for a sampled persona
  - `decision.market_fit_score` in `[0,1]`
- [ ] **Step 2: Run — expect fail.**
- [ ] **Step 3: Implement** `_score_criteria(persona, features, category, rng)` producing core+overlay dicts via the §8 formulas; assemble nested reaction; keep grounded low-duplication templates for qualitative (extend to new fields).
- [ ] **Step 4: Run — expect pass**; run full `python -m pytest -q`.
- [ ] **Step 5: Commit** `git commit -am "feat(inference): multi-criteria mock provider"`

---

## Task 9: LLM prompt + parse update

**Files:**
- Modify: `apps/api/app/services/inference/prompts.py`
- Modify: `apps/api/app/services/inference/fireworks_provider.py` (shared `parse_llm_reaction`)
- Test: `apps/api/tests/test_consistency.py` (add a `parse_llm_reaction` unit test with a canned JSON string)

**Interfaces:**
- Produces: updated `REACTION_JSON_SCHEMA` (nested), updated system/user prompts (§9 wording, no CoT, no generic filler), `parse_llm_reaction(content, persona, category, features)` that builds the nested reaction and calls `compute_market_fit` server-side for `market_fit_score`+`status`.

- [ ] **Step 1: Test** — feed a valid JSON string with 17 criteria to `parse_llm_reaction`; assert `market_fit_score` equals the recomputed blend (not the model's number if one were present).
- [ ] **Step 2–4:** Implement; ensure vllm/nim providers still import `parse_llm_reaction` and pass category/features. Providers still fail gracefully if unconfigured.
- [ ] **Step 5: Commit** `git commit -am "feat(inference): criteria-aware prompts + server-computed market fit on LLM path"`

---

## Task 10: Criteria + age aggregation and report builder

**Files:**
- Create: `apps/api/app/services/aggregation/criteria_aggregation.py`
- Create: `apps/api/app/services/aggregation/age_analysis.py`
- Modify: `apps/api/app/services/aggregation/report_builder.py`
- Modify: `apps/api/app/schemas/report.py`
- Modify: `apps/api/app/schemas/storm.py` (add `product_category: str | None`)
- Test: `apps/api/tests/test_e2e.py` (extend `REPORT_KEYS`/`QUALITY_KEYS`)

**Interfaces:**
- Produces:
  - `build_criteria_breakdown(reactions) -> list[CriterionBreakdown]`, `diagnose_weakness(breakdowns, preset) -> (weakest, strongest, top_blockers, top_strengths)`
  - `build_age_cohorts(personas, reactions) -> list[AgeCohortReport]`
  - report schema additions: `product_category`, `overall{market_fit_score,confidence,top_blockers,top_strengths}`, `adoption{+average_buy_likelihood,+average_market_fit_score}`, `criteria_breakdown[]`, `weakest_criteria[]`, `strongest_criteria[]`, `age_cohorts[]`, panel fields, `next_human_validation[]`.

- [ ] **Step 1: Test** — extend e2e: assert report has `overall`, `criteria_breakdown` (17), `weakest_criteria`, `strongest_criteria`, `age_cohorts`, `product_category`, and `adoption.average_market_fit_score`. Keep existing assertions passing.
- [ ] **Step 2: Run — expect fail.**
- [ ] **Step 3: Implement** aggregation modules + wire into `report_builder` + storm_runner (pass classified category into features/report; runner computes category once). `confidence` derived per §11 (≤ benchmark_confidence). Diagnostic `summary`.
- [ ] **Step 4: Run — expect pass** (`python -m pytest -q`).
- [ ] **Step 5: Commit** `git commit -am "feat(report): criteria + age-cohort aggregation and diagnosis"`

---

## Task 11: Quality — consistency checker + new metrics

**Files:**
- Create: `apps/api/app/services/quality/consistency_checker.py`
- Modify: `apps/api/app/services/quality/metrics.py`
- Modify: `apps/api/app/schemas/quality.py` (add `age_cohort_variance: Strength`, `criteria_consistency: float`)
- Test: `apps/api/tests/test_consistency.py`, `apps/api/tests/test_quality.py` (extend)

**Interfaces:**
- Produces: `check_consistency(persona, reaction) -> list[str]` (violated-rule labels, §12), `criteria_consistency_score(personas, reactions) -> float` (share passing); `metrics.compute_quality` adds `age_cohort_variance` + `criteria_consistency`.

- [ ] **Step 1: Test** — craft a reaction with `trust=0.05` + `buy_likelihood=0.95` → checker returns a `trust_vs_buy` violation; a consistent reaction returns `[]`; `compute_quality` output includes the two new fields with valid values.
- [ ] **Step 2: Run — expect fail.**
- [ ] **Step 3: Implement** checker (diagnostic-only, no mutation) + metrics additions; QUALITY_KEYS in e2e updated to include the two new fields.
- [ ] **Step 4: Run — expect pass** (`python -m pytest -q` — full suite green).
- [ ] **Step 5: Commit** `git commit -am "feat(quality): consistency checker + age-cohort variance + criteria consistency"`

---

## Task 12: Frontend types + create page

**Files:**
- Modify: `apps/web/lib/types.ts`, `apps/web/lib/samples.ts`
- Modify: `apps/web/app/page.tsx`
- Create: `data/sample_inputs/ai_saas_personapilot.md`

**Interfaces:**
- Produces: TS interfaces mirroring the new report/reaction schemas; `StormReport` extended; `StormCreateRequest.product_category?`. Create page: rename hero to "PersonaStorm — The product wind tunnel", add a Product-category `<Select>` defaulting to `auto` (omit when auto), add the AI-SaaS sample.

- [ ] **Step 1:** Update `types.ts` to match Task 7/10/11 schemas exactly (Overall, CriterionBreakdown, AgeCohortReport, new quality fields, `age_specific_scores`, `market_fit_score`).
- [ ] **Step 2:** Add category selector + sample; wire into `createStorm` payload (omit `product_category` when `auto`).
- [ ] **Step 3: Verify build** `cd apps/web && npm run build` → passes (no type errors).
- [ ] **Step 4: Commit** `git commit -am "feat(web): types + category selector + AI-SaaS sample"`

---

## Task 13: Frontend live storm page

**Files:**
- Modify: `apps/web/app/storm/[id]/page.tsx`, `apps/web/components/storm/LiveCounters.tsx` (+ new small components if needed)

**Interfaces:** Live page shows live **average market-fit score** (from progress/report) and a **collapse-risk indicator** alongside existing adoption counters, persona grid, top emerging objection. No SSE payload change required beyond what already streams; average market-fit read from `progress` if added, else computed on `complete`.

- [ ] **Step 1:** Add live market-fit + collapse indicator to counters. If needed, add `avg_market_fit` to `progress_snapshot()` in `storm_runner.py` (and to `ProgressEvent` type).
- [ ] **Step 2: Verify** `npm run build` passes; `npm run lint` clean.
- [ ] **Step 3: Commit** `git commit -am "feat(web): live market-fit + collapse indicator"`

---

## Task 14: Frontend report dashboard

**Files:**
- Modify: `apps/web/app/storm/[id]/report/page.tsx`
- Create: `components/report/{MarketFitHero,BlockerCards,CriteriaRadar,CriteriaBreakdown,StrengthCards,AgeCohortBreakdown,TrustProofPanel,DifferentiationPanel,PricingFitPanel,WorkflowFitPanel,NextValidationPanel}.tsx`
- Modify: `components/report/SegmentHeatmap.tsx` (add market-fit column)

**Interfaces:** Progressive-disclosure dashboard per §13; hand-rolled SVG radar (no deps); top-3 blockers + top-5 criteria first with "show all 17" expander. Reuse existing ObjectionsTable/PriceCurve/KillQuoteCard/Recommendations/TrustPanel. No dead buttons.

- [ ] **Step 1:** Build `CriteriaRadar` (SVG polygon over 17 axes) and `MarketFitHero` first (novel pieces); then the panel components (each a small card reading its report slice).
- [ ] **Step 2:** Recompose `report/page.tsx` in dashboard order; wire the expander state for full criteria.
- [ ] **Step 3: Verify** `npm run build` + `npm run lint` pass; manually confirm every button/link has an action.
- [ ] **Step 4: Commit** `git commit -am "feat(web): market evaluation dashboard"`

---

## Task 15: Docs + demo script

**Files:**
- Modify: `README.md`, `docs/{architecture,criteria-system,api-contract,evaluation-framework,inference-roadmap,training-roadmap,demo-script}.md`

**Interfaces:** Docs describe the actual final structure (not the proposed tree). `criteria-system.md` documents registry, presets, overlays, and the exact scoring model (§5). README covers what it is / is not, local run, criteria engine, mock inference, provider roadmap, and "one calibrated model + 1,000 persona profiles, not 1,000 models". `demo-script.md` = the 2–3 min judge flow.

- [ ] **Step 1:** Write/update each doc.
- [ ] **Step 2: Commit** `git commit -am "docs: multi-criteria system, API, demo script, roadmaps"`

---

## Task 16: Full verification pass

- [ ] **Step 1:** `cd apps/api && python -m pytest -q` → all green. Fix failures.
- [ ] **Step 2:** Uvicorn import/startup check: `python -c "from app.main import create_app; create_app()"` → no error.
- [ ] **Step 3:** `cd apps/web && npm run build` and `npm run lint` → pass.
- [ ] **Step 4:** Local smoke: start API + web (or run the e2e via `scripts/run_local_demo.py` if present), create a storm with the AI-SaaS sample, confirm report renders with market-fit + blockers.
- [ ] **Step 5:** `scripts/evaluate_outputs.py` gains criteria-consistency + market-fit-matches-weights + uniformity checks; run it.
- [ ] **Step 6: Commit** `git commit -am "test: full verification pass"`

---

## Self-Review notes (author)

- **Spec coverage:** every spec section maps to a task — criteria system (T1–T4), classifier/high-risk (T5), personas+age (T6), reaction schema (T7), mock (T8), LLM path (T9), aggregation/report/API (T10), quality/consistency (T11), frontend create/live/report (T12–T14), docs+sample (T15), verification (T16).
- **Compat:** property shims (T7) keep `storm_runner`/`objections`/`metrics`/SSE working; `reasoning_summary` stays top-level; `life_stage` auto-derives so existing `Persona(...)` construction in tests still works.
- **Single source of truth:** `compute_market_fit` (T4) is the only place scores are combined; consistency checker (T11) is diagnostic-only.
- **No new deps:** SVG radar hand-rolled (T14).
