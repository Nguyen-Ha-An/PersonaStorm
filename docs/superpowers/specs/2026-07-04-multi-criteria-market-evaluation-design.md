# PersonaStorm — Multi-Criteria Market Evaluation Engine (Design Spec)

Date: 2026-07-04
Status: Approved-pending-review
Owner: PersonaStorm

## 1. Summary

Upgrade PersonaStorm from a simple reaction engine (buy likelihood + max price +
objection) into a **calibrated multi-criteria market evaluation engine** with an
**age/life-stage overlay**. Each of the 1,000 synthetic personas evaluates the
stimulus across **17 core market criteria** plus a small set of **life-stage
overlay criteria**; the system computes a `market_fit_score` from category
weights + age overlay + bounded modifiers + rare hard gates (never invented by a
model), then aggregates weak points, strong points, segment- and age-cohort-level
barriers, pricing fit, trust/proof gaps, differentiation risk, virality, and the
exact next test to run with real humans.

Positioning is unchanged and load-bearing: PersonaStorm is a **pre-research
product wind tunnel**, not a replacement for human research. Outputs are
synthetic hypotheses, honestly labeled. No output claims a persona is a real
human, and no chain-of-thought is ever exposed.

### Goals
- 17 core criteria + dynamic life-stage overlay criteria, all `0..1`, for every persona.
- `market_fit_score` computed by deterministic system logic from a category
  weight preset + age overlay blend + bounded modifiers + hard gates.
- Product-category classification (10 categories) with user override.
- Age/life-stage assignment (6 stages) + age-cohort aggregation and variance.
- A diagnosing report (not a number dump): top-3 adoption blockers, weakest vs.
  strongest criteria, trust/proof gap, differentiation risk, pricing fit,
  workflow/adoption fit, virality, next human validation.
- Consistency checker + criteria-consistency quality metric.
- Premium "Market Evaluation Dashboard" frontend with progressive disclosure; no dead buttons.
- Mock inference remains fully runnable locally with zero GPU/keys; the
  LLM-provider swap point stays schema-valid.

### Non-goals (this pass)
- Live LLM calibration / fine-tuning (LoRA persona model stays a documented placeholder).
- Real survey-derived trait distributions (P0 keeps hand-tuned priors).
- Persisting analytics beyond the existing JSON run store.

## 2. Module mapping (requirement → existing → new?)

The suggested folder trees in the prompts are conceptual. We preserve the
existing `apps/api/app/` conventions (`services/<domain>/`, `schemas/`,
`routers/`, `utils/`) and add only genuinely-new files.

| Requirement module            | Existing file/module to modify                          | New file? |
|-------------------------------|---------------------------------------------------------|-----------|
| criteria/registry.py          | — (none)                                                | **new** `app/services/criteria/registry.py` |
| criteria/presets.py           | — (none)                                                | **new** `app/services/criteria/presets.py` |
| criteria/age_overlays.py      | — (none)                                                | **new** `app/services/criteria/age_overlays.py` |
| criteria/scoring.py           | — (none)                                                | **new** `app/services/criteria/scoring.py` |
| product/category classifier   | `services/stimulus_parser.py` (category guess exists)   | **new** `app/services/criteria/classifier.py` (reuses parser signals) |
| personas/generator.py         | `services/persona/generator.py`                         | modify |
| personas/validator.py         | `services/persona/diversity.py`                         | modify (keep name; add age-cohort check) |
| personas/schemas.py           | `schemas/persona.py`                                    | modify |
| inference/base.py             | `services/inference/base.py`                            | unchanged |
| inference/mock_provider.py    | `services/inference/mock_provider.py`                   | modify (major) |
| inference/*_provider.py       | `services/inference/{fireworks,vllm,nim}_provider.py` + `prompts.py` | modify |
| reaction schema               | `schemas/reaction.py`                                   | modify (major) |
| aggregation/report_builder.py | `services/aggregation/report_builder.py`                | modify |
| aggregation/objection_*       | `services/aggregation/objections.py`                    | unchanged (reused) |
| aggregation/price_analysis    | `services/aggregation/pricing.py`                       | unchanged (reused) |
| aggregation/segment_analysis  | segment logic in `report_builder.py`                    | modify in place |
| aggregation/age_analysis.py   | — (none)                                                | **new** `app/services/aggregation/age_analysis.py` |
| criteria aggregation          | — (none)                                                | **new** `app/services/aggregation/criteria_aggregation.py` |
| quality/collapse_detector.py  | `services/quality/collapse.py`                          | unchanged (keep name) |
| quality/consistency_checker.py| — (none)                                                | **new** `app/services/quality/consistency_checker.py` |
| quality/metrics.py            | `services/quality/metrics.py`                           | modify (add age_cohort_variance, criteria_consistency) |
| report schema                 | `schemas/report.py`                                     | modify (add overall, criteria, age_cohorts, panels) |
| routes/storm.py, health.py    | `routers/storm.py`, `routers/health.py`                 | unchanged / minor |
| frontend types                | `apps/web/lib/types.ts`                                 | modify |
| report UI                     | `apps/web/app/storm/[id]/report/page.tsx` + components  | modify + new components |
| live UI                       | `apps/web/app/storm/[id]/page.tsx` + storm components   | modify (add live market-fit + collapse) |
| create UI                     | `apps/web/app/page.tsx`                                 | modify (category selector) |

## 3. Architecture pipeline

```
stimulus + optional product_category override
  → Input Parser (services/stimulus_parser.py, unchanged)
  → Category Classifier (services/criteria/classifier.py) → 1 of 10 categories
  → Criteria Preset selection (category → core weights + age_overlay_lambda)
  → Persona Space Builder (services/persona/generator.py) → 1,000 personas
       · assigns life_stage from age, builds decision_context
  → Diversity + Age-cohort Validator (services/persona/diversity.py)
  → Multi-criteria Persona Evaluation (mock/LLM) → 17 core + overlay scores
  → Scoring (services/criteria/scoring.py) → market_fit_score (system-computed)
  → Segment + Age-cohort + Criteria Aggregation
  → Weakness Diagnosis (top-3 blockers, weakest/strongest)
  → Quality + Collapse + Consistency Check
  → Market Evaluation Report (extended schema)
  → Trust / Calibration Panel
```

The `PersonaInferenceProvider` interface, SSE streaming, and JSON run storage
stay structurally intact.

## 4. Criteria system

### 4.1 Core criteria registry (`services/criteria/registry.py`)

17 criteria, each: `id, label, description, score_type="0_to_1",
higher_is_better, group`. Polarity lives here only; all downstream math reads it.

| id | group | higher_is_better |
|----|-------|------------------|
| problem_awareness | problem | true |
| need_intensity | problem | true |
| urgency | problem | true |
| solution_fit | value | true |
| value_clarity | value | true |
| differentiation | value | true |
| trust | trust_risk | true |
| **proof_requirement** | trust_risk | **false (barrier)** |
| pricing_acceptance | pricing | true |
| perceived_roi | pricing | true |
| ease_of_understanding | adoption | true |
| workflow_fit | adoption | true |
| switching_willingness | adoption | true |
| activation_likelihood | adoption | true |
| repeat_usage_potential | retention | true |
| shareability | virality | true |
| retention_potential | retention | true |

Registry exposes: `CORE_CRITERIA` (ordered), `CRITERION_BY_ID`, `is_barrier(id)`,
`effective(id, score)` = `score if higher_is_better else 1 - score`.

### 4.2 Category presets (`services/criteria/presets.py`)

10 categories: `ai_tool, b2b_saas, consumer_app, ecommerce_product,
education_product, marketplace, social_product, hardware_product,
luxury_product, generic`. Each preset = `{criterion_id: raw_weight}` (need not
cover all 17) + `age_overlay_lambda`. Raw weights are **normalized to 1.0 in
code** (`resolve_preset`). Unknown → `generic`.

Representative weight vectors (illustrative; final numbers live in code and
normalize to 1.0):

```
ai_tool:        trust .14, differentiation .13, proof_requirement .12,
                value_clarity .10, perceived_roi .10, workflow_fit .09,
                pricing_acceptance .08, need_intensity .08,
                activation_likelihood .07, retention_potential .05, shareability .04
                age_overlay_lambda = 0.12
b2b_saas:       perceived_roi, workflow_fit, trust, switching_willingness,
                pricing_acceptance, proof_requirement, solution_fit weighted high
                age_overlay_lambda = 0.07
consumer_app:   ease_of_understanding, activation_likelihood, shareability,
                retention_potential, value_clarity, need_intensity weighted high
                age_overlay_lambda = 0.20
education_product: trust, proof_requirement, pricing_acceptance, perceived_roi,
                repeat_usage_potential, need_intensity weighted high
                age_overlay_lambda = 0.25
luxury_product: differentiation, trust, perceived_roi, shareability,
                need_intensity, value_clarity weighted high (status/identity/exclusivity)
                age_overlay_lambda = 0.20
ecommerce_product / marketplace / social_product / hardware_product / generic:
                defined analogously; age_overlay_lambda 0.15 / 0.15 / 0.22 / 0.15 / 0.15
```

### 4.3 Age / life-stage overlays (`services/criteria/age_overlays.py`)

6 life stages with age bands and dynamic overlay-criteria sets. Overlay criteria
also carry polarity in the registry.

| life_stage | age band | overlay criteria (barriers marked *) |
|------------|----------|--------------------------------------|
| teen_student | 13–17 | parent_approval, peer_influence, trend_alignment, school_relevance, allowance_affordability, identity_fit, attention_fit, safety_concern* |
| student_young_adult | 18–24 | budget_fit, trialability, creator_influence, identity_signal, self_improvement_value, future_benefit, social_validation |
| early_career | 25–34 | career_value, productivity_gain, time_saving, professional_credibility, subscription_fatigue*, workflow_fit |
| parent_family | 35–44 | family_value, child_safety, household_budget_fit, convenience, reliability, outcome_proof |
| established_adult | 45–60 | simplicity, brand_credibility, support_availability, risk_reduction, familiarity, low_learning_curve |
| older_adult | 60+ | ease_of_use, safety, human_support, familiarity, low_setup_friction, trust_in_provider |

`life_stage_for(age)` returns the band. `overlay_criteria_for(life_stage)`
returns the ordered criterion specs. Barriers: `safety_concern`,
`subscription_fatigue` (inverted before scoring). `age_overlay_lambda` gets a
bounded life-stage bump: `effective_lambda = clamp(category_lambda + bump, 0.05,
0.35)` with bump `+0.08` teen_student, `+0.06` older_adult, `+0.03`
parent_family, else `0`.

## 5. Scoring model (`services/criteria/scoring.py`) — the centerpiece

`compute_market_fit(core_scores, overlay_scores, category, life_stage, context)`
returns a `MarketFitBreakdown`:

```
market_fit_score, category_weighted_core_score, age_overlay_score,
age_overlay_lambda, modifier_adjustment, modifier_reasons[], gates[]
```

Algorithm (exactly as specified):

1. **category_weighted_core_score** = Σ `weight[c] * effective(c, core_scores[c])`
   over the normalized category preset, where `effective` inverts barriers
   (`proof_requirement → 1 - x`).
2. **age_overlay_score** = mean of `effective(c, overlay_scores[c])` over the
   persona's life-stage overlay criteria (barriers `safety_concern`,
   `subscription_fatigue` inverted). If no overlay criteria, overlay score = core score.
3. **effective_lambda** = `clamp(category_lambda + life_stage_bump, 0.05, 0.35)`.
4. **raw_market_fit_score** =
   `(1 - λ) * category_weighted_core_score + λ * age_overlay_score`.
5. **Bounded modifiers** — `modifier_adjustment ∈ [-0.10, +0.10]`, each rule
   appends a human-readable `modifier_reason`:
   - `trust < 0.30 and proof_requirement > 0.75` → `-0.05` ("trust gap with high proof demand")
   - `need_intensity > 0.75 and solution_fit > 0.75 and urgency > 0.60` → `+0.04` ("strong, urgent need well matched")
   - `pricing_acceptance < 0.25 and perceived_roi < 0.35` → `-0.05` ("price rejected and ROI unconvincing")
   - (additional interaction rules may be added; total clamped to ±0.10)
6. **score = raw_market_fit_score + modifier_adjustment**, clamp `[0,1]`.
7. **Rare hard gates** (multiplicative, only severe blockers), each recorded as
   `{gate_applied, gate_name, reason, score_multiplier}`:
   - teen_student + education/paid + `parent_approval < 0.20` → `×0.75`
   - high-risk product + `trust < 0.20` → `×0.60`. "High-risk" is a boolean
     flagged from the category + stimulus keywords (financial/payments/medical/
     health/safety/childcare), computed once per storm and passed into scoring.
8. **Clamp final to `[0,1]`.**

Modifiers capture interactions, never dominate; gates are rare and always
explained. This function is the single source of truth: the mock provider and
the LLM parse both call it, so `market_fit_score` is never hallucinated. The
breakdown drives `reasoning_summary`, the report's "diagnose don't dump"
narration, and the trust panel.

`status` (green/yellow/red) continues to derive from `overall_buy_likelihood`
via the existing calibrated thresholds (green = likely buyer), keeping adoption
counts comparable across runs; `market_fit_score` is the separate diagnostic headline.

## 6. Persona schema (`schemas/persona.py`)

Add: `life_stage: LifeStage` (derived from `age`), rename/confirm
`occupation` stays (spec's `occupation_or_context` → keep `occupation`), and add
`decision_context: DecisionContext`.

`DecisionContext` (optional fields, populated by life stage):
`needs_parent_approval: bool | None`, `budget_control: str | None`,
`main_influence_sources: list[str]`, `risk_owner: str | None`,
`attention_span: str | None`, `school_context: str | None`,
`decision_horizon: str | None`. Teen personas always populate the teen fields.

Generator (`services/persona/generator.py`): assign `life_stage` from sampled
age; build `decision_context` from life stage + traits (deterministic, seeded).
Diversity validator (`services/persona/diversity.py`): add an **age-cohort
spread** check — warn (not hard-fail) if the population collapses into one
cohort when the target market should span several. Seeded reproducibility preserved.

## 7. Reaction schema (`schemas/reaction.py`)

Nested, superset of today, matching the spec exactly:

- `persona_id, segment, life_stage`
- `decision`: `overall_buy_likelihood, market_fit_score, status, max_price,
  recommended_pricing_model` (enum now includes **`freemium`**:
  `one_time | subscription | usage_based | seat_based | enterprise | freemium | unknown`)
- `criteria_scores`: 17 core floats (`CoreCriteriaScores` model, all `0..1`)
- `age_specific_scores`: `dict[str, float]` (dynamic keys = life-stage overlay
  criteria; validated `0..1`)
- `qualitative_reaction`: `first_objection, top_positive_trigger,
  top_negative_trigger, dealbreaker, proof_needed, emotional_reaction,
  would_tell, quote`
- `research_recommendation`: `should_validate_with_humans, validation_question,
  best_next_test` (`survey | interview | landing_page_ab_test | pricing_test |
  ad_test | usability_test`)
- Optional `market_fit_breakdown` (compact, for eval/trust panel).

**Compatibility bridge:** read-only `@property` shims on `PersonaReaction`
(`buy_likelihood, status, max_price, first_objection, quote, positive_trigger,
segment`) proxy into the nested objects so `storm_runner`, `objections.py`,
`metrics.py`, and the SSE payload keep working with minimal edits; the
**serialized JSON is the new nested contract**.

## 8. Mock inference (`services/inference/mock_provider.py`)

Refactor the existing "factor ledger" into a per-criterion scorer:
`_score_criteria(persona, features, category, rng) → (core: dict, overlay: dict)`.
Deterministic (seeded by `run_seed:persona_id:stimulus_hash`), trait- and
feature-grounded — **not** pure random. Each criterion has an explicit formula
honoring the behavior rules, e.g.:

- `trust` ← brand_trust prior − skepticism + proof/security presence
- `proof_requirement` ← skepticism up, brand_trust down, higher when price high
- `differentiation` ← lowered by category_familiarity and AI-hype-without-proof,
  raised by clarity/unique anchors
- `pricing_acceptance` ← affordability (budget vs. detected price) × price_sensitivity
- `activation_likelihood` ← novelty_seeking (esp. AI/tech) + free-trial + low friction
- `shareability` ← social_influence × emotional positivity
- `need_intensity × solution_fit` interaction lifts buy_likelihood
- teen overlay: `peer_influence, trend_alignment, parent_approval,
  allowance_affordability, safety_concern` driven by decision_context
- B2B/early-career overlay: ROI, proof, workflow_fit, switching, price justification

Then: call `compute_market_fit(...)` for `market_fit_score` + breakdown; compute
`overall_buy_likelihood` (adoption-weighted blend + need×fit interaction −
switching inertia); `status = status_for(buy_likelihood)`; infer
`recommended_pricing_model` from category + stimulus (adds `freemium`); derive
`research_recommendation` from the persona's weakest criterion; fill qualitative
fields (grounded, low-duplication templates, incl. new `top_negative_trigger,
dealbreaker, proof_needed`). `reasoning_summary` narrates the top criterion
contributions — a truthful description of the computation, never chain-of-thought.

## 9. LLM provider path (`prompts.py`, `fireworks/vllm/nim`)

- System prompt updated to: "You are simulating this specific persona's market
  reaction. Evaluate the product through the criteria schema. Be specific,
  skeptical when appropriate, consistent with the profile. Output only valid
  JSON." Explicitly bans generic filler and chain-of-thought.
- `REACTION_JSON_SCHEMA` → nested schema (core criteria + overlay + qualitative +
  decision-lite: `buy_likelihood, max_price, recommended_pricing_model`).
- `parse_llm_reaction` builds the nested reaction, then the **server recomputes
  `market_fit_score` and `status`** via `compute_market_fit` — the total is
  derived from weights, not the model's invention, on the LLM path too.
- Providers fail gracefully when unconfigured (existing `ProviderNotConfiguredError`).
  Validated on mock this pass; live-key testing stays a documented TODO.

## 10. Aggregation & report

New `services/aggregation/criteria_aggregation.py`:
- per-criterion averages (core), per-segment × per-criterion averages
- **weakness diagnosis**: rank by `importance(category weight) × deficit`, deficit
  = `1 - effective(c, avg)`. Top 3 = biggest blockers. Registry-driven
  `interpretation` strings.
- strongest = inverse ranking.

New `services/aggregation/age_analysis.py`:
- per-life-stage cohorts: counts, adoption, avg market_fit, avg buy_likelihood,
  cohort-specific top overlay barrier + insight, `age_cohorts[]`.

`report_builder.py` extended to emit (matching the API contract in §11):
`product_category`, `summary` (diagnostic), `overall{market_fit_score,
confidence, top_blockers, top_strengths}` (where `confidence` =
`low|medium|high` derived from benchmark_confidence, collapse_risk, and
criteria_consistency — never higher than benchmark_confidence, so the panel
can't overstate trust), `adoption{green,yellow,red,
average_buy_likelihood, average_market_fit_score}`, `criteria_breakdown[]`,
`weakest_criteria[]`, `strongest_criteria[]`, `segments[]`, `age_cohorts[]`,
`top_objections[]`, `price_sensitivity[]`, panels (trust/proof gap,
differentiation risk, pricing fit, workflow/adoption fit, virality),
`kill_quote`, `recommendations[]`, `next_human_validation[]` (aggregated from
persona research recs → ranked validation questions + recommended test),
`quality{...}`. Existing objections/pricing/kill-quote/recommendations preserved.

The `summary` and panel interpretations **diagnose**: e.g. "Price is not the main
problem — trust and differentiation score below pricing acceptance; prove
credibility and differentiation before touching price."

## 11. API contract (`routers/storm.py`)

Endpoints unchanged: `POST /api/storm/create`, `GET /api/storm/{id}/stream`,
`GET /api/storm/{id}/report`, `GET /api/health`. `StormCreateRequest` gains
optional `product_category` (enum of 10 or omitted = auto-detect). Report
response shape:

```json
{
  "storm_id": "string",
  "product_category": "string",
  "summary": "string",
  "overall": { "market_fit_score": 0.0, "confidence": "low|medium|high",
               "top_blockers": [], "top_strengths": [] },
  "adoption": { "green": 0, "yellow": 0, "red": 0,
                "average_buy_likelihood": 0.0, "average_market_fit_score": 0.0 },
  "criteria_breakdown": [ { "criterion_id","label","average_score",
                            "higher_is_better","weight","segment_scores":[],
                            "interpretation" } ],
  "weakest_criteria": [], "strongest_criteria": [],
  "segments": [], "age_cohorts": [],
  "top_objections": [], "price_sensitivity": [],
  "kill_quote": "string", "recommendations": [], "next_human_validation": [],
  "quality": { "persona_adherence":0,"product_grounding":0,
    "generic_response_rate":0,"duplicate_objection_rate":0,
    "objection_entropy":"low|medium|high","segment_variance":"weak|moderate|strong",
    "age_cohort_variance":"weak|moderate|strong","criteria_consistency":0,
    "collapse_risk":"low|medium|high","benchmark_confidence":"low|medium|high" }
}
```

## 12. Quality & consistency

`services/quality/metrics.py`: keep the 8 existing metrics; add
**`age_cohort_variance`** (Strength level, like segment_variance but over life
stages) and **`criteria_consistency`** (0..1 from the consistency checker).

New `services/quality/consistency_checker.py` rules:
- `trust` very low but `buy_likelihood` very high → flag (and optionally damp buy).
- `pricing_acceptance` very low but `max_price` high → flag (and optionally damp price).
- high `proof_requirement` should co-occur with lower `trust` unless strong proof present.
- all criteria too uniform (low per-persona variance) → low-signal flag.
- too many identical objections → feeds collapse risk (existing collapse detector).

`criteria_consistency` = share of personas passing the internal-consistency
checks. The checker is **diagnostic-only** — it feeds the metric and report
notes but does **not** mutate reactions; score interactions (trust↔buy,
price↔ROI) are owned by the scoring modifiers in §5, so there is exactly one
place that adjusts scores. Collapse detector (`quality/collapse.py`) reused, not renamed.

## 13. Frontend

**Create page** (`app/page.tsx`): rename hero to **PersonaStorm — "The product
wind tunnel"**; add a **Product category** `<Select>` defaulting to "Auto-detect"
(sends `product_category` or omits). Keep stimulus type / target market / count /
Run Storm.

**Live storm page** (`app/storm/[id]/page.tsx` + storm components): add **live
average market-fit score** and a **collapse-risk indicator** alongside the
existing adoption counters, persona grid, top emerging objection.

**Report page** (`app/storm/[id]/report/page.tsx`): becomes the **Market
Evaluation Dashboard** with progressive disclosure —
1. hero **overall market-fit score** + confidence,
2. **top 3 adoption blockers**,
3. adoption forecast,
4. **criteria radar** (hand-rolled SVG) + **top-5 criteria bars** with "show all
   17" expander,
5. strengths,
6. **age cohort breakdown**, segment heatmap (extended with market-fit),
7. trust/proof gap, differentiation risk, pricing fit, workflow/adoption panels,
8. objections table, price curve, kill quote, next human validation,
9. recommendations, trust/calibration panel.

New self-contained components (no new deps): `MarketFitHero`, `BlockerCards`,
`CriteriaRadar`, `CriteriaBreakdown`, `StrengthCards`, `AgeCohortBreakdown`,
`TrustProofPanel`, `DifferentiationPanel`, `PricingFitPanel`,
`WorkflowFitPanel`, `NextValidationPanel`. Reuse `SegmentHeatmap`,
`ObjectionsTable`, `PriceCurve`, `KillQuoteCard`, `Recommendations`,
`TrustPanel`. `lib/types.ts` mirrors the new schemas. **No dead buttons**;
progressive disclosure keeps hierarchy clear.

## 14. Documentation

Create/update: `README.md`, `docs/architecture.md`, `docs/criteria-system.md`
(registry, presets, overlays, the exact scoring model), `docs/api-contract.md`,
`docs/evaluation-framework.md` (criteria-consistency checks), `docs/demo-script.md`
(2–3 min judge flow), `docs/inference-roadmap.md` + `docs/training-roadmap.md`
(Fireworks analyst, vLLM/MI300X, future LoRA persona model). README explains what
PersonaStorm is / is not, local run, the criteria engine, mock inference, provider
roadmap, and **why one calibrated model + 1,000 persona profiles, not 1,000 models**.
Add one strong **AI-SaaS demo sample input** (clear pricing) to
`data/sample_inputs/` and `apps/web/lib/samples.ts`.

## 15. Tests & verification

- `apps/api/tests/test_mock_provider.py`: 17 core criteria present + in `[0,1]`;
  overlay scores present for the persona's life stage; trait monotonicity (higher
  skepticism → lower trust, higher proof_requirement); `market_fit_score` equals
  the recomputed weighted blend; barriers inverted correctly.
- new `apps/api/tests/test_criteria.py`: registry integrity, weights normalize to
  1.0, `proof_requirement`/`safety_concern`/`subscription_fatigue` polarity,
  λ clamping, gate behavior.
- new `apps/api/tests/test_consistency.py`: consistency rules fire on crafted
  inconsistent reactions.
- `apps/api/tests/test_e2e.py`: report carries `overall`, `criteria_breakdown`,
  `weakest/strongest`, `age_cohorts`, new quality fields.
- Existing `test_quality.py`, `test_generator.py` updated for new fields.
- `scripts/evaluate_outputs.py`: add criteria-consistency + market-fit-matches-
  weights + criteria-uniformity checks.
- Verification commands: `pytest` (api), `npm run build` + `npm run lint` (web),
  uvicorn import/startup check. Report real results; fix failures or state them.

## 16. Risks / limitations
- Mock scores are calibrated priors, not learned; classifier is keyword-heuristic
  (hence override).
- LLM path is wired + schema-valid but not live-tested this pass.
- Age cohorts present depend on the target market (enterprise → no teens); report
  shows only populated cohorts.
- Hard gates are intentionally rare; mis-tuned thresholds could over/under-fire —
  they are always explained so they're auditable.

## 17. Rollout phases (for the implementation plan)
1. Criteria package (registry, presets, age_overlays, scoring) + tests.
2. Schemas (persona, reaction) + classifier + generator/diversity updates.
3. Mock provider rewrite + tests.
4. Aggregation (criteria + age + report_builder) + report schema.
5. Quality + consistency checker + metrics.
6. LLM prompts/parse update.
7. Frontend types + dashboard + live + create.
8. Docs + sample input.
9. Full verification pass (pytest + web build + startup).
```
