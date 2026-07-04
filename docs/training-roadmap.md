# Training roadmap: from prompted Gemma to a calibrated persona model

Goal: a model whose persona-conditioned reactions are (a) schema-exact,
(b) trait-faithful, (c) grounded in the stimulus, and (d) **calibrated** —
its aggregate rates track real-world outcomes within stated error bars.

## Base model

Gemma (instruction-tuned). Two sizes, two jobs:
- **Gemma small (4B/9B class)** — the swarm worker. 1,000 calls/storm means
  cost/latency dominate; a small calibrated model beats a large prompted one.
- **Gemma 27B** — the analyst/aggregator. 1 call/storm; quality dominates.

## Phase 1 — Prompted baseline (no training)

Run the eval suite (evaluation-framework.md) on prompted Gemma with guided
JSON. This is the yardstick every later phase must beat. Expected gaps:
persona adherence drift on long trait lists, "helpful assistant" tone leaking
into quotes, WTP anchoring too tightly to sticker price.

## Phase 2 — SFT LoRA for schema + persona voice

- **Data 1: synthetic instruction data for schema following.** Generate
  (persona, stimulus, reaction) triples with a strong teacher model; filter
  every sample through the quality metrics (adherence ≥ 0.7, grounding = yes,
  zero generic phrases). ~20-50k examples. The persona generator already
  exports unlimited structured personas (`scripts/seed_personas.py`).
- **Data 2: objection language from product/app reviews.** Public review
  corpora (app stores, G2-style, Reddit) are mined for *how real people
  phrase objections* per category — style transfer material, not labels.
  Cluster themes, pair with persona profiles whose traits plausibly produce
  them.
- **Recipe:** LoRA (r=16–32) on the small Gemma; loss masked to the JSON
  output; hard-negative examples where the persona demands a DIFFERENT
  reaction than the "average" one (anti-collapse pressure).
- ROCm note: PEFT/TRL fine-tuning runs on the same MI300X used for serving —
  192 GB allows LoRA on 27B without sharding if the analyst also needs tuning.

## Phase 3 — Behavior calibration from survey data

The hard, differentiating step. Sources:
- Public conjoint/survey datasets (price-sensitivity studies, tech-adoption
  surveys, e.g. Pew-style adoption data) mapped onto trait vectors.
- Purchased omnibus survey waves per target market (the first real spend).
- Every PersonaStorm customer study run alongside a real survey becomes a
  paired calibration point (flywheel).

Method: compare swarm aggregate curves (adoption %, WTP distribution,
objection mix) against survey ground truth per (category × segment) cell →
fit a post-hoc calibration layer (isotonic/Platt on buy_likelihood; WTP
quantile mapping) and/or fold into preference-tuning (DPO pairs where the
better response is the one matching observed marginals).

## Phase 4 — Optional segment LoRA adapters

Where one adapter underfits a market's voice (SEA Gen Z slang vs enterprise
procurement register), train small per-segment adapters on top of the shared
persona adapter. Served natively by vLLM `--lora-modules`; selected per
request. Only add where eval shows a gap — adapters are a maintenance cost.

## Phase 5 — Release gate (before any model reaches users)

A model version ships only if, on the frozen eval set:
1. Schema validity ≥ 99.5% (guided decoding makes this near-free)
2. Persona adherence ≥ baseline + 10 points
3. Product grounding ≥ 0.8, generic rate ≤ 2%
4. Collapse: duplicate rate ≤ 5% at n=1,000, entropy ≥ baseline
5. Top-5 objection overlap with held-out real reviews ≥ baseline
6. Calibration error (adoption MAE vs held-out surveys) ≤ previous release
7. Human expert review: 3 PM/UXR raters, majority "would inform my research
   plan" on 10 unseen storms

Regression on any gate blocks release. The trust panel's benchmark_confidence
is wired to which calibration cells the running model actually passed.
