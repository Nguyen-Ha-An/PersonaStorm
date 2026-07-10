# Criteria system

The centerpiece of the multi-criteria market evaluation upgrade: every
persona's reaction is a 17-criterion report card, scored against a
category-specific weight preset and a life-stage overlay, and reduced to one
system-computed `market_fit_score`. Nothing here is invented by a model —
the scorer is deterministic Python, called identically from the mock provider
and from the LLM parse path.

Source: `apps/api/app/services/criteria/{registry,presets,age_overlays,scoring,classifier}.py`.

## 1. Core criteria registry (`registry.py`)

17 core criteria, each `0..1`, defined once as the single source of truth for
polarity (`higher_is_better`). Downstream math never hardcodes polarity — it
always calls `registry.effective(cid, score)`, which returns `score` for a
benefit criterion and `1 - score` for a **barrier**.

| id | group | higher_is_better |
|----|-------|------------------|
| `problem_awareness` | problem | true |
| `need_intensity` | problem | true |
| `urgency` | problem | true |
| `solution_fit` | value | true |
| `value_clarity` | value | true |
| `differentiation` | value | true |
| `trust` | trust_risk | true |
| `proof_requirement` | trust_risk | **false (barrier)** |
| `pricing_acceptance` | pricing | true |
| `perceived_roi` | pricing | true |
| `ease_of_understanding` | adoption | true |
| `workflow_fit` | adoption | true |
| `switching_willingness` | adoption | true |
| `activation_likelihood` | adoption | true |
| `repeat_usage_potential` | retention | true |
| `shareability` | virality | true |
| `retention_potential` | retention | true |

`proof_requirement` is the one core barrier: a HIGH raw score means the
persona demands a lot of proof before buying — that's friction, not a good
sign, so `effective("proof_requirement", 0.9)` returns `0.1`.

Registry API: `CORE_CRITERIA` (ordered tuple), `CORE_IDS`, `CRITERION_BY_ID`,
`is_barrier(id)`, `effective(id, score)`, and `register(criteria)` (used by
`age_overlays.py` to add overlay criteria into the same lookup table at
import time, so the scorer can resolve polarity for *any* criterion id,
core or overlay, through one API).

## 2. Category presets (`presets.py`)

10 product categories, each a set of raw core-criteria weights (need not
cover all 17 — omitted criteria get a small floor weight of `0.02`) plus an
`age_overlay_lambda`. Raw weights are **normalized to sum to 1.0** at
resolution time (`resolve_preset`); an unknown category falls back to
`generic` (all-floor → uniform weights).

| category | weight emphasis (raw, pre-normalization) | `age_overlay_lambda` |
|---|---|---|
| `ai_tool` | trust .14, differentiation .13, proof_requirement .12, value_clarity .10, perceived_roi .10, workflow_fit .09, pricing_acceptance .08, need_intensity .08, activation_likelihood .07, retention_potential .05, shareability .04 | 0.12 |
| `b2b_saas` | perceived_roi .15, workflow_fit .14, trust .12, switching_willingness .11, pricing_acceptance .10, proof_requirement .10, solution_fit .09, differentiation .06, activation_likelihood .05, retention_potential .04 | 0.07 |
| `consumer_app` | ease_of_understanding .15, activation_likelihood .14, shareability .12, retention_potential .11, value_clarity .10, need_intensity .09, solution_fit .08, repeat_usage_potential .07, differentiation .05 | 0.20 |
| `ecommerce_product` | perceived_roi .13, pricing_acceptance .13, trust .12, value_clarity .11, differentiation .10, need_intensity .09, solution_fit .08, proof_requirement .08, shareability .05 | 0.15 |
| `education_product` | trust .14, proof_requirement .12, perceived_roi .12, pricing_acceptance .11, need_intensity .10, repeat_usage_potential .09, solution_fit .08, value_clarity .07 | 0.25 |
| `marketplace` | trust .14, need_intensity .12, activation_likelihood .11, value_clarity .10, pricing_acceptance .09, differentiation .09, retention_potential .08, shareability .07 | 0.15 |
| `social_product` | shareability .16, activation_likelihood .13, retention_potential .12, need_intensity .10, ease_of_understanding .10, value_clarity .08, differentiation .07 | 0.22 |
| `hardware_product` | perceived_roi .13, trust .12, proof_requirement .11, differentiation .11, value_clarity .10, pricing_acceptance .10, need_intensity .09, solution_fit .08 | 0.15 |
| `luxury_product` | differentiation .16, trust .13, perceived_roi .11, shareability .11, need_intensity .10, value_clarity .09, pricing_acceptance .06, retention_potential .06 | 0.20 |
| `generic` | (empty — every criterion gets the `0.02` floor, i.e. uniform after normalization) | 0.15 |

All weights not listed for a category still receive the `0.02` floor, so
every one of the 17 criteria always contributes something to
`category_weighted_core_score`.

## 3. Category classification (`classifier.py`)

`classify_category(features) -> (category, confidence)` scores all 10
categories from the parsed `StimulusFeatures` and returns the best match
(falls back to `("generic", 0.1)` when there's no signal). Inputs:

- A **strong prior** (`_PRIOR_WEIGHT = 3.0`) from the stimulus parser's own
  coarse category guess (`saas_b2b → b2b_saas`, `ecommerce → ecommerce_product`,
  `edtech → education_product`, `health_fitness → consumer_app`,
  `fintech → b2b_saas`; `devtool → ai_tool` if AI is mentioned, else `b2b_saas`).
- An **AI-signal boost**, independent of the prior, from `mentions_ai` and
  keyword hits (`ai`, `gpt`, `llm`, `copilot`, `agent`, `model`, `genai`, `ml`).
- **Keyword sets** for categories the parser doesn't natively cover
  (`luxury_product`, `marketplace`, `social_product`, `hardware_product`),
  matched on word boundaries (not raw substrings, so `"ai"` doesn't false-hit
  inside `"maintain"`).

`is_high_risk(features)` is a separate boolean: true if the stimulus touches
finance/payments/medical/health/safety/childcare keywords. It feeds the
scorer's high-risk trust-floor gate (see below) and is computed once per
storm.

`product_category` on `StormCreateRequest` lets a caller override
auto-detection entirely (see [api-contract.md](api-contract.md)).

## 4. Age / life-stage overlays (`age_overlays.py`)

6 life stages, each with an inclusive age band and its own set of overlay
criteria (also registered into the shared registry, so they carry polarity
too). `life_stage_for(age)` maps an age to its band; ages below the youngest
band fall back to `teen_student` rather than raising.

| life_stage | age band | overlay criteria (barriers marked *) |
|------------|----------|--------------------------------------|
| `teen_student` | 13–17 | `parent_approval`, `peer_influence`, `trend_alignment`, `school_relevance`, `allowance_affordability`, `identity_fit`, `attention_fit`, `safety_concern`* |
| `student_young_adult` | 18–24 | `budget_fit`, `trialability`, `creator_influence`, `identity_signal`, `self_improvement_value`, `future_benefit`, `social_validation` |
| `early_career` | 25–34 | `career_value`, `productivity_gain`, `time_saving`, `professional_credibility`, `subscription_fatigue`*, `workflow_fit` |
| `parent_family` | 35–44 | `family_value`, `child_safety`, `household_budget_fit`, `convenience`, `reliability`, `outcome_proof` |
| `established_adult` | 45–60 | `simplicity`, `brand_credibility`, `support_availability`, `risk_reduction`, `familiarity`, `low_learning_curve` |
| `older_adult` | 61+ | `ease_of_use`, `safety`, `human_support`, `familiarity`, `low_setup_friction`, `trust_in_provider` |

The two overlay barriers are `safety_concern` (teen) and `subscription_fatigue`
(early_career) — both inverted via `registry.effective` before they feed the
age-overlay score, exactly like `proof_requirement` in the core set.

`overlay_ids_for(life_stage)` returns the ordered overlay criterion ids for a
stage (empty tuple for unknown stages). `lambda_bump(life_stage)` returns a
small additive bump applied on top of the category's `age_overlay_lambda`:
`+0.08` for `teen_student`, `+0.06` for `older_adult`, `+0.03` for
`parent_family`, `0` for the rest.

## 5. The scoring model (`scoring.py::compute_market_fit`) — the centerpiece

```python
compute_market_fit(core, overlay, category, life_stage,
                    is_high_risk=False, is_teen_paid_edu=False) -> MarketFitBreakdown
```

`MarketFitBreakdown` carries `market_fit_score`,
`category_weighted_core_score`, `age_overlay_score`, `age_overlay_lambda`,
`modifier_adjustment`, `modifier_reasons[]`, `gates[]` — the full audit trail,
optionally attached to a `PersonaReaction` as `market_fit_breakdown`.

The algorithm, exactly as implemented:

1. **`category_weighted_core_score`** = Σ over all 17 core ids of
   `preset.weights[cid] * effective(cid, core_scores[cid])`, using the
   normalized weights from `resolve_preset(category)`. Barriers
   (`proof_requirement`) are inverted here via `effective`.
2. **`age_overlay_score`** = mean of `effective(cid, overlay[cid])` over the
   persona's life-stage overlay criteria. If the persona has no overlay
   scores (empty dict — shouldn't happen for a valid life stage, but is
   handled safely), it falls back to `category_weighted_core_score`.
3. **`age_overlay_lambda`** = `clamp(preset.age_overlay_lambda +
   lambda_bump(life_stage), 0.05, 0.35)`.
4. **raw score** = `(1 - λ) * category_weighted_core_score + λ * age_overlay_score`.
5. **Bounded modifiers** (summed, then clamped to `[-0.10, +0.10]`), each
   appending a human-readable reason to `modifier_reasons`:
   - `trust < 0.30 and proof_requirement > 0.75` → **-0.05**,
     "trust gap with high proof demand"
   - `need_intensity > 0.75 and solution_fit > 0.75 and urgency > 0.60` →
     **+0.04**, "strong, urgent need well matched"
   - `pricing_acceptance < 0.25 and perceived_roi < 0.35` → **-0.05**,
     "price rejected and ROI unconvincing"
6. **score** = `clamp(raw + modifier_adjustment, 0, 1)`.
7. **Rare hard gates** (multiplicative, applied in order, each recorded in
   `gates[]` as `{gate_applied, gate_name, reason, score_multiplier}`):
   - `life_stage == "teen_student" and is_teen_paid_edu and
     overlay.get("parent_approval", 1.0) < 0.20` → **×0.75**
     ("Low parent approval" — teens can't realistically purchase without it)
   - `is_high_risk and core.get("trust", 1.0) < 0.20` → **×0.60**
     ("Trust floor for high-risk product" — finance/medical/safety/childcare
     products fail without baseline trust)
8. Final `market_fit_score` = `clamp(score, 0, 1)` after any gates.

`is_high_risk` and `is_teen_paid_edu` are computed once per storm/persona by
the caller (classifier + category check), not by the scorer itself.

This function is called identically by `MockPersonaProvider` and by the LLM
parse path (`parse_llm_reaction`) — so `market_fit_score` is **never**
hallucinated by a model on either path; only the 17 raw criteria scores +
overlay scores differ by provider.

`status` (green/yellow/red) is a **separate** signal: it's derived from
`overall_buy_likelihood` (an adoption-weighted blend of criteria, computed in
the provider, distinct from `market_fit_score`) via fixed thresholds
(`GREEN_THRESHOLD = 0.62`, `RED_THRESHOLD = 0.38`, in `schemas/reaction.py`).
`market_fit_score` is the diagnostic headline; `status`/`buy_likelihood`
drive the adoption counts and traffic-light grid, and the two are
correlated-but-distinct on purpose.

## 6. Aggregation: weakest / strongest criteria + age cohorts

`app/services/aggregation/criteria_aggregation.py`:

- `build_criteria_breakdown(reactions, category)` — one `CriterionBreakdown`
  per core criterion: raw average across all reactions, the category's
  resolved weight, a per-segment average split, and a templated
  `interpretation` string (barrier-aware: a high raw `proof_requirement`
  reads as "a real adoption barrier", not a strength).
- `diagnose_weakness(breakdowns, category)` — partitions the 17 criteria into
  two **disjoint** pools by ranking on `registry.effective` score and
  splitting at the median rank (not a fixed 0.5 cutoff, so both pools stay
  non-empty regardless of how lopsidedly strong or weak a run is). Within the
  weakness pool, criteria are ranked by `weight * (1 - effective)`
  (importance × deficit); within the strength pool, by `weight * effective`.
  Each list is capped at 5 (`weakest_criteria` / `strongest_criteria`); the
  top-3 labels of each become `top_blockers` / `top_strengths` on the
  report's `overall` block. Because the split is a strict partition, a
  criterion can never appear in both lists.

`app/services/aggregation/age_analysis.py`:

- `build_age_cohorts(personas, reactions)` — groups reactions by
  `life_stage`, and for each cohort that actually appears in the run reports
  `personas`, `adoption_rate`, `avg_buy_likelihood`, `avg_market_fit_score`,
  the cohort's **top barrier** (the life-stage overlay criterion with the
  lowest mean `effective` score across the cohort — so a high `safety_concern`
  correctly surfaces as a top barrier), and a templated `insight` string.
  Only cohorts present in the run are returned — an enterprise-market storm
  simply shows no `teen_student` row.

## 7. Consistency and quality metrics that read the criteria

`app/services/quality/consistency_checker.py::check_consistency` flags
reactions whose own numbers contradict each other (see
[evaluation-framework.md](evaluation-framework.md) for the 4 rules); it never
mutates scores. `app/services/quality/metrics.py` folds the checker's output
into `criteria_consistency` (share of personas passing all rules) and adds
`age_cohort_variance` (stddev of per-life-stage mean buy likelihood, same
weak/moderate/strong banding as `segment_variance`).

## 8. Persona priors & assumptions (Phase A calibration)

Source: `apps/web/lib/server/engine/persona/{priorsLoader,correlation,presets,featureWiring}.ts`,
`apps/web/lib/server/engine/criteria/assumptions.ts`,
`apps/web/lib/server/engine/quality/biasAudit.ts`, `data/persona_priors/*.json`.

This layer governs *how honestly* the engine claims to know things about
persona psychology — trait means/variances, cross-trait correlations, and the
directional nudges applied during scoring. Everything here is separate from
the 17-criterion registry in §1–§7; it feeds the sampling and scoring inputs
that criteria are then scored *against*.

### Priors file format (`data/persona_priors/*.json`)

Each file (`_base.json` plus one per named preset, e.g. `parents.json`,
`enterprise.json`) is loaded by `priorsLoader.ts::loadPresetWithMeta`:

- **`trait_definitions`** — a `Record<traitName, string>` giving the
  operational definition of the 0..1 scale for that trait (e.g. what `0.9`
  vs `0.5` vs `0.1` means behaviorally). Required for any trait that claims
  `evidence.status: "sourced"` (see below).
- **`sub_segments[].traits`** — a `Record<traitName, { mean, std, evidence }>`
  per sub-segment (or `base_traits` in `_base.json`):
  - `mean` — must be in `[0, 1]`.
  - `std` — must be in `(0, 0.5]`.
  - `evidence.status` — one of `sourced | derived | unverified` (see below).
    `sourced` additionally requires `evidence.mapping_rule` (a string
    explaining how the source number maps to the 0..1 trait scale).
- **`trait_correlations`** — an optional top-level array of
  `[traitA, traitB, r, evidenceStatus?]` tuples (`|r| <= 0.95`,
  `evidenceStatus` defaults to `unverified`). If omitted, the loader falls
  back to `correlation.ts::DEFAULT_CORRELATIONS` (5 pairs, all `unverified`).
  These feed a Cholesky decomposition (`correlation.ts::buildCholesky`) used
  to draw correlated trait samples instead of independent ones; a
  non-positive-definite matrix throws at load time (configuration error, not
  a runtime fallback).

Malformed files (bad JSON, out-of-range values, missing fields) throw at
load — priors are validated fail-fast, never silently coerced. A missing
priors file for a given preset key falls back to the embedded code presets
(`presets.ts`), with every trait's `std` still honesty-widened as described
below and `meta.source` set to `"embedded_unverified"`.

### Honesty rules

Because most current trait values are estimates rather than measurements,
the loader deliberately understates confidence for anything not backed by a
cited source:

- **Unverified trait std ×1.5, capped at 0.20** — `priorsLoader.ts`:
  `std = min(std * 1.5, 0.20)` when `evidence.status === "unverified"`. This
  widens the sampled distribution (more persona-to-persona variance) so an
  unverified point estimate doesn't produce artificially tight, falsely
  confident persona clustering. `sourced` and `derived` traits are used as
  authored (no widening).
- **Unverified correlations ×0.5** — `correlation.ts::UNVERIFIED_SHRINK`:
  the correlation coefficient `r` is multiplied by 0.5 before entering the
  Cholesky matrix when the pair's evidence status is `unverified`. This
  claims less cross-trait structure where there is less evidence for it.
  `DEFAULT_CORRELATIONS` (the global fallback) is 100% unverified, so it is
  always shrunk unless a preset file supplies its own `trait_correlations`
  with a better-evidenced status.

Both rules only ever *reduce* claimed confidence (wider std, weaker
correlation) — they never strengthen an estimate beyond what was authored.

### Assumptions registry (`criteria/assumptions.ts`)

Every directional modifier applied during scoring (as opposed to criteria
math itself) must be registered in `ASSUMPTION_DEFS` with an `evidence_status`,
or the engine throws in dev/test when it fires (production logs+skips
instead of crashing a live run). A per-run `AssumptionLedger` counts how
often each registered id fired so the report can surface it
(`calibration_evidence` block). The six registered ids, as of Phase A:

| id | evidence_status | what it does |
|----|------------------|---------------|
| `pricing_dealbreaker_injection` | `unverified` | Personas with `price_sensitivity > 0.72` get a pricing dealbreaker injected; rate-bounded (`max_rate: 0.4`, see below). |
| `privacy_dealbreaker_injection` | `unverified` | Personas with `privacy_sensitivity > 0.75` get a privacy dealbreaker appended. |
| `ai_skeptic_trust_penalty` | `derived` | AI mention without proof lowers trust (−0.06) for personas with `skepticism > 0.6`. |
| `ai_novelty_activation_boost` | `derived` | AI mention raises activation for personas with `novelty_seeking > 0.55`. |
| `trust_gap_high_proof_modifier` | `derived` | `scoring.ts`: `trust < 0.3` with `proof_requirement > 0.75` → −0.05. |
| `strong_urgent_need_modifier` | `derived` | `scoring.ts`: need, fit, and urgency all high → +0.04. |

`unverified` here means "the direction is a design guess, not backed by
psychometric or market research"; `derived` means "computed deterministically
from other already-scored criteria, not an independent claim about persona
psychology."

### Feature-wiring table (`persona/featureWiring.ts`)

Declares, per persona field, whether it actually influences **mock-mode**
scoring or is display-only flavor. In the LLM path the full persona JSON
enters the prompt, so every field is `"prompt"` there — the distinction only
matters for the deterministic mock provider. This table is also what the
counterfactual audit (below) uses to classify a pair as `expected_inert`
instead of reporting a false "pass" when a field can't possibly move the
mock score.

| persona field | mock role | note |
|---|---|---|
| `region` | flavor | — |
| `occupation` | flavor | — |
| `income_band` | flavor | label only; `monthly_budget_usd` is the value that actually scores |
| `research_style` | flavor | — |
| `buying_trigger` | flavor | — |
| `life_stage` | **scoring** | drives age-overlay criteria + a lambda bump |
| `decision_context.budget_control` | flavor | `needs_parent_approval` / `attention_span` score; `budget_control` itself does not |

In mock mode, only `life_stage` of the five counterfactual-audited fields
actually scores — the other four are expected to be inert, and the audit
reports that as `not_applicable` rather than a misleading "no bias found".

### Injection rate bound (40%)

`pricing_dealbreaker_injection` carries `max_rate: 0.4` in its
`AssumptionDef` — callers enforce that this nudge is applied to at most 40%
of a sub-segment's personas, even if more personas technically cross the
`price_sensitivity > 0.72` threshold. This keeps a single unverified
assumption from dominating a sub-segment's dealbreaker profile.

### Counterfactual audit — TS-only (parity exception)

The counterfactual bias/sensitivity audit (`quality/biasAudit.ts`) clones a
small, deterministic sample of personas, flips exactly one contextual field
at a time (`region`, `income_band`, `occupation`, `life_stage`,
`decision_context.budget_control`), and re-runs the same stimulus through
the same reaction provider to flag context fields that move scores more than
expected. **This audit exists only in the TS engine** (`apps/web`). The
Python reference engine (`apps/api`) has no equivalent check —
`storm_runner.py` and `schemas/report.py` both note explicitly that their
`calibration_evidence` block omits `counterfactual_audit` because "that
check does not exist in this reference engine." This is a known,
intentional parity gap for Phase A, tracked for Phase B.
