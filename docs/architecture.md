# PersonaStorm architecture

```
User input + optional product_category override
   │
   ▼
Input Parser ──────────────── apps/api/app/services/stimulus_parser.py
   │   prices, proof/trial/AI/security signals, salient anchors, coarse category
   ▼
Category Classifier ────────── services/criteria/classifier.py
   │   1 of 10 preset categories (ai_tool, b2b_saas, consumer_app, ecommerce_product,
   │   education_product, marketplace, social_product, hardware_product,
   │   luxury_product, generic) + is_high_risk flag (finance/medical/health/
   │   safety/childcare keywords, feeds the scorer's hard gate)
   ▼
Criteria Preset Selection ──── services/criteria/presets.py
   │   category → normalized core-criteria weights + age_overlay_lambda
   ▼
Persona Space Builder ─────── services/persona/presets.py + generator.py
   │   1,000 structured personas sampled from trait DISTRIBUTIONS; each persona
   │   gets a derived life_stage (services/criteria/age_overlays.py) and a
   │   deterministic decision_context (parent approval, budget control, ...)
   ▼
Persona Diversity Validator ─ services/persona/diversity.py
   │   trait spread, sub-segment coverage, dealbreaker uniqueness, age spread,
   │   AND age-cohort spread (warn-only — a narrow market may legitimately
   │   collapse to 1-2 life stages)
   ▼
Multi-Criteria Persona Evaluation ─ services/inference/ (mock | fireworks | vllm | nim)
   │   batched swarm inference behind PersonaInferenceProvider; every reaction
   │   carries 17 core criteria_scores + life-stage age_specific_scores
   ▼
Market-Fit Scoring ─────────── services/criteria/scoring.py::compute_market_fit
   │   category_weighted_core_score (barrier-aware) blended with age_overlay_score
   │   by a clamped λ, + bounded modifiers (±0.10) + rare hard gates → market_fit_score
   │   ALWAYS system-computed — mock and LLM paths both call this, never invented
   ▼
Batched Swarm Inference ───── services/storm_runner.py
   │   asyncio batches → SSE fan-out to any number of live viewers
   ▼
Response Quality Checker ──── services/quality/metrics.py
Consistency Checker ────────── services/quality/consistency_checker.py (diagnostic-only,
   │                            never mutates a reaction: trust_vs_buy, price_vs_wtp,
   │                            proof_vs_trust, uniform_criteria rules)
Collapse Detector ─────────── services/quality/collapse.py (live) + metrics (final)
   │
   ▼
Segment + Age-Cohort + Criteria Aggregation ─ services/aggregation/
   │   criteria_aggregation.py (per-criterion + per-segment averages, disjoint
   │   weakest/strongest diagnosis) · age_analysis.py (per-life-stage cohorts)
   ▼
Weakness Diagnosis ─────────── top-3 blockers / top-3 strengths (criteria_aggregation.py)
   ▼
Aggregator / Report Builder ── services/aggregation/report_builder.py
   │   (objections, pricing, kill-quote, recommendations, next_human_validation)
   ▼
Final Report + Trust/Calibration Panel ── GET /api/storm/{id}/report → apps/web report page
```

The 10-category classifier, criteria presets, age/life-stage overlays, and the
exact scoring algorithm are documented in full in
[docs/criteria-system.md](criteria-system.md).

## Why 1 calibrated model + 1,000 persona profiles, not 1,000 models

This is the central design decision.

1. **Economics & latency.** One model with continuous batching (vLLM) turns
   1,000 reactions into a throughput problem. A thousand fine-tuned models is
   a thousand cold starts and a memory bill nobody can pay. On an AMD MI300X,
   192 GB HBM3 holds one Gemma-27B *plus* a massive KV cache — the entire
   swarm runs on a single device.
2. **Persona fidelity lives in the prompt + criteria schema, calibration lives
   in the weights.** A persona is *data* (traits, budget, dealbreakers, life
   stage, decision context — see `schemas/persona.py`), not *weights*. The
   model's job is a single skill: "react consistently AS the persona
   described, scored against the 17-criterion + overlay schema." That skill
   is trained/calibrated once and reused across every persona, market, and
   product category — and the final `market_fit_score` is deterministic
   system logic (`compute_market_fit`), not model output, so quality never
   depends on 1,000 models agreeing on arithmetic.
3. **Measurability.** Because personas are structured data, persona adherence
   is checkable: price-sensitive personas must state lower max prices,
   skeptics must demand more proof (`proof_requirement` up, `trust` down).
   With 1,000 opaque models, drift is invisible.
4. **Iteration speed.** Fixing a bias means one LoRA update, not a thousand
   retrains. Segment nuance can still be added later via small per-segment
   LoRA adapters (see training-roadmap.md) — adapters, not full models.

## Component responsibilities

| Layer | Location | Notes |
|---|---|---|
| Frontend UI | `apps/web` | Next.js 14 App Router, SSE client, no server state |
| Backend API | `apps/api/app/routers` | thin handlers; zero business logic |
| Persona generation | `apps/api/app/services/persona` | seeded, preset-driven; `generator.py` derives `life_stage` + `decision_context`, `diversity.py` validates spread |
| Criteria engine | `apps/api/app/services/criteria` | `registry.py` (17 criteria + polarity), `presets.py` (10 category weight presets), `age_overlays.py` (6 life stages), `scoring.py` (`compute_market_fit`), `classifier.py` (category + high-risk detection) |
| Inference abstraction | `apps/api/app/services/inference` | THE swap point (`mock_provider.py`, `fireworks_provider.py`, `vllm_provider.py`, `nim_provider.py`, `prompts.py`) |
| Quality / collapse | `apps/api/app/services/quality` | `metrics.py` (trust panel source of truth, incl. `age_cohort_variance`/`criteria_consistency`), `consistency_checker.py` (diagnostic-only per-reaction rules), `collapse.py` (live monitor) |
| Aggregation | `apps/api/app/services/aggregation` | `criteria_aggregation.py` (per-criterion + weakness/strength diagnosis), `age_analysis.py` (life-stage cohorts), `report_builder.py` (final report), `objections.py`, `pricing.py` — numbers computed, never generated |
| Shared schemas | `packages/schemas` + Pydantic + TS mirrors | strict, versioned together |
| Storage | `apps/api/app/services/storage.py` | JSON docs now, Postgres later |

## Streaming

SSE over WebSocket, deliberately: reaction flow is strictly server→client,
EventSource gives auto-reconnect for free, and SSE traverses proxies without
upgrade handshakes. Each subscriber holds its own cursor into the run's
reaction list, so N viewers and mid-run reconnects replay history then tail.
Events: `init`, `reaction` (one per persona), `progress` (running aggregates +
live collapse risk), `complete`, `error`.

The frontend batches renders (120 ms flush) so the 1,000-cell grid stays at a
smooth ~8 fps regardless of event rate.

## Aggregation honesty rule

The LLM analyst (future Fireworks Gemma 27B) only ever **narrates** aggregates
computed in Python — adoption counts, cluster shares, curve points. Numbers
are never generated by a language model. This keeps the report auditable: every
figure traces to `data/runs/{id}.json`. The same rule applies one layer down:
`market_fit_score` is always the output of `compute_market_fit` — on the mock
path the provider calls it directly, and on the LLM path
(`parse_llm_reaction`) the server recomputes it from the model's raw criteria
scores rather than trusting any total the model emits.

## Storage

P0: in-memory during the run (SSE reads hot state), then one immutable JSON
document per finished storm in `data/runs/`. `StorageBackend` is a 3-method
protocol; Postgres (per-reaction rows for cross-run analytics) slots in behind
it without touching the runner. SQLite was skipped: a finished storm is a
single document, and we need no cross-run queries yet.

## Scaling path (post-P0)

- Storm execution moves from in-process asyncio task to a worker (arq/Celery)
  with Redis pub/sub fanning out SSE — the `event_stream` contract is unchanged.
- Multiple API replicas behind a load balancer; sticky routing only for /stream.
- vLLM serving pool on MI300X nodes; the provider already batches with bounded
  concurrency, so scale = more replicas in VLLM_BASE_URL's load balancer.
