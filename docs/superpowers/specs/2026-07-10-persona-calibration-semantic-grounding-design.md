# Design — Persona calibration & semantic grounding

Date: 2026-07-10
Status: approved design (not yet implemented)
Owner: engine / persona + criteria
Delivery: two phases (Phase A: calibration & feature integrity · Phase B: semantic grounding & benchmark gate)

## 1. Problem

The persona swarm's results feel biased and untrue, and the causes are
structural, not cosmetic:

1. **Hand-guessed presets.** Every trait distribution in
   `apps/web/lib/server/engine/persona/presets.ts` (and the Python mirror) is a
   developer's stereotype encoded as a Gaussian — e.g. SEA Gen Z students get
   `price_sensitivity: T(0.86)` with no data behind the number.
2. **One shared scoring formula.** `mockProvider.scoreCriteria` computes all 17
   criteria with identical hand-picked linear coefficients for every persona.
   Personas differ only through 7 trait values + budget, so 1,000 "opinions"
   are structurally one opinion with noise, and any formula error biases the
   whole swarm the same direction.
3. **Baked-in directional nudges.** e.g. mentioning "AI" always adds +0.1
   `differentiation`; intercepts pull most criteria toward 0.4–0.55 regardless
   of product.
4. **Shallow stimulus understanding (the accuracy ceiling).** `solution_fit`,
   `need_intensity`, `differentiation`, `workflow_fit`, `problem_awareness`
   are computed from copywriting surface features (clarity, jargon,
   has-proof). The engine never understands what the product *is* or whether a
   segment *needs* it — the swarm reacts to the shape of the pitch, not the
   substance of the product.
5. **Persona feature defects.**
   - `region`, `occupation`, `income_band` (label), `research_style`,
     `buying_trigger` are scoring-inert in the mock provider (flavor only) —
     and the counterfactual bias audit perturbs exactly those inert fields
     while preserving `persona_id` (the RNG key), so its deltas are
     mathematically guaranteed to be 0.000 in mock mode. The trust panel
     reports "no counterfactual sensitivity" — false reassurance.
   - `pickObjection` gates almost every objection on the persona's
     hand-authored dealbreaker pool, so the headline "top adoption blockers"
     output is substantially predetermined by pool composition, not the
     product. The generator's trait-consistency pass force-injects
     `"unclear pricing"` for any persona with `price_sensitivity > 0.72` —
     consumer presets have means 0.80–0.92, so pricing objections dominate
     for almost any product.
   - Traits are sampled from independent Gaussians: real trait correlations
     (price sensitivity ↔ budget, skepticism ↔ brand trust) are absent, and
     incoherent tail personas pollute distributions. The diversity validator
     checks spread only, not coherence.
   - `differentiation = 0.55 − 0.3·familiarity + …` forces familiar personas
     to see any product as undifferentiated regardless of the product.

Goal: make swarm predictions **more accurate** (rank-order hits above flops,
surface real failure modes) and **honest about remaining uncertainty**, while
preserving the engine's core invariants.

## 2. Invariants (unchanged)

- Deterministic given a seed. LLM outputs are cached per storm and treated as
  fixed inputs; replay reproduces identical results.
- `market_fit_score` is only ever produced by `computeMarketFit`. No LLM
  invents a number; all LLM-derived values are schema-validated, clamped, and
  sanitized server-side (same pattern as `sanitizeSynthesis`).
- TS engine (`apps/web/lib/server/engine/`) is production; Python
  (`apps/api`) is the mirrored reference + test oracle. Shared JSON data files
  prevent parameter drift by construction.
- Offline/mock mode continues to work with no keys; every degradation is a
  visible label, never silent.

## 3. Architecture overview

```
                     ┌─ data/persona_priors/*.json       (NEW — cited trait priors)
                     │
input ─ parseStimulus┼─ SemanticAssessor                 (NEW — 1 LLM call/storm:
        (unchanged)  │    segment × criteria matrix        "does this product actually
                     │    + rationales; formula fallback)   fit this segment?")
                     ▼
           PersonaGenerator                              (CHANGED — correlated sampling;
                     ▼                                     wider std on unverified priors)
           MockPersonaProvider                           (CHANGED — semantic blend for 5
              · criteria = f(semantic, traits, jitter)     grounded criteria; objections
              · nudges → assumptions registry              decoupled from dealbreaker gate;
                     ▼                                     per-persona coefficient jitter)
           computeMarketFit / aggregation                (UNCHANGED — numeric truth)
                     ▼
           report + trust panel                          (CHANGED — calibration evidence
                                                           block)

data/benchmark_outcomes/*.json + recorded semantic       (NEW — 15–25 disguised real
fixtures + backtest suite (pytest + vitest, CI gate)       products with known outcomes)
```

Criteria change from `f(keyword features, traits, noise)` to
`f(semantic assessment, traits, jitter)` for the five semantically grounded
criteria; the other 12 remain formula-driven (they genuinely are functions of
surface features + traits).

## 4. Component: evidence-backed persona priors (Phase A)

New directory `data/persona_priors/` — one JSON file per preset
(`sea_genz.json`, `us_smb.json`, `parents.json`, `enterprise.json`,
`budget.json`, `early_adopters.json`) plus `_base.json` for the custom-preset
base traits and `CUSTOM_MODIFIERS` shifts.

Per-trait format:

```jsonc
"price_sensitivity": {
  "mean": 0.86, "std": 0.08,
  "operational_definition": "0.9 ≈ abandons purchase at +10% price delta; 0.5 ≈ tolerates +30%",
  "evidence": {
    "status": "sourced",              // "sourced" | "derived" | "unverified"
    "sources": [{ "title": "…", "url": "…", "claim": "…" }],
    "mapping_rule": "how the source statistic was mapped to this value"
  }
}
```

Rules (new module `engine/persona/priorsLoader.ts` + Python mirror):

1. Schema-validated at startup (schema added to `packages/schemas/`); invalid
   file → startup error, never silent fallback.
2. **Unverified honesty penalty:** `status: "unverified"` widens std ×1.5
   (capped at 0.20) before sampling.
3. `priors_coverage = sourced traits / total traits` computed at load; flows
   to trust panel.
4. Missing data directory → embedded current presets as fallback, run labeled
   `priors_source: "embedded_unverified"`.
5. `operational_definition` and `mapping_rule` are **required** for
   `status: "sourced"` — a bare citation without a mapping rule does not
   qualify (anti-citation-washing rule).
6. `familiarity` moves into this format as a categorical distribution with
   evidence status.
7. `presets.ts` / `presets.py` shrink to loader + types + custom-preset
   builder; each `CUSTOM_MODIFIERS` keyword shift also carries evidence.

Curation expectation (recorded in the data README): population-level anchors
exist for price sensitivity, privacy attitudes, social influence by
age/region (e.g. Pew, Eurostat, e-Conomy SEA, EIU); personality-like traits
(novelty_seeking, skepticism) will often stay `derived`/`unverified` — the
system then *says so* and widens spread instead of hiding it.

## 5. Component: correlated, coherent sampling (Phase A)

- Priors JSON gains optional `trait_correlations`
  (`["price_sensitivity","risk_tolerance",-0.35]`, …) with a documented
  global default matrix. Correlations carry the same evidence format as
  means; **unverified correlations are shrunk toward 0** (the honesty penalty
  analogue — less claimed structure where there is less evidence).
- Generator validates the matrix (symmetric, positive semi-definite),
  Cholesky-decomposes it, and transforms the independent Gaussian draws.
  Seeded → same personas for the same seed. Mirrored in Python.
- Diversity validator gains a coherence check (flag personas beyond a
  Mahalanobis-style bound) and reports `coherence` alongside `trait_std`.

## 6. Component: assumptions registry + de-nudged formulas (Phase A)

New module `engine/criteria/assumptions.ts` (+ mirror): every directional
modifier in the providers and generator must be registered with
`{ id, description, evidence status, bounds }` or be deleted.

- Unregistered modifier → throws in dev/test; logged + skipped in prod.
- Includes at launch: the AI-mention differentiation nudge (delete unless
  evidence found), the trust/proof modifiers, the semantic blend weight
  (see §7), and the pricing dealbreaker force-injection (bounded: applied to
  at most 40% of a sub-segment; beyond that expressed as objection weight,
  not dealbreaker overwrite).
- Fired assumptions per run are counted and surfaced in the report
  (`assumptions_fired`, with personas_affected).

**Per-persona coefficient jitter:** formula coefficients receive a small
seeded perturbation per persona (drawn once from the persona RNG), so swarm
disagreement becomes structural rather than pure noise. Same seed → identical
swarm.

## 7. Component: semantic grounding layer (Phase B — the accuracy driver)

New module `engine/semantic/assessor.ts` (+ Python mirror
`services/semantic/assessor.py`).

- **One LLM call per storm**, after persona generation, before the swarm.
  Input: stimulus, product category, and the preset's sub-segment
  descriptions. Temperature 0.
- Output (strict JSON, schema-validated): per sub-segment scores + short
  rationales for the five grounded criteria — `solution_fit`,
  `need_intensity`, `differentiation`, `workflow_fit`, `problem_awareness` —
  plus `real_alternatives_considered`.
- **Anti-optimism prompt design:** the assessor must (a) rank the segments
  against each other (forced contrast — uniform optimism is structurally
  discouraged), and (b) justify `differentiation` against named real
  alternatives. The stimulus is presented as untrusted data; instructions in
  the stimulus are to be evaluated as marketing copy, not followed.
- **Blend:** for the five grounded criteria,
  `score = w·semantic + (1−w)·(current formula)`, `w = 0.7` initially — `w`
  lives in the assumptions registry and is tuned only via the benchmark
  ratchet, never ad hoc. Per-persona traits and jitter still individualize
  every persona within a segment.
- **Sanitization (`sanitizeSemantic`):** clamp to [0,1] per field; malformed
  or missing field → that field falls back to formula; whole-response failure
  after one JSON-repair retry → full formula fallback.
- **Caching & determinism:** assessment stored on the storm record (inside
  the existing storm_runs JSON payload — no migration); replay and all 1,000
  reactions read the cache. Report records
  `semantic_source: "nvidia" | "fireworks" | "fallback_formulas"`.
- Provider knob: `SEMANTIC_PROVIDER`, defaulting to the analyst provider;
  reuses the existing `chatClient` retry/budget behavior.

Known residual risk (accepted, documented): the semantic layer injects the
assessor LLM's own product-opinion biases, correlated across a whole segment.
Mitigated by forced contrast, temperature 0, the registry-tracked blend
weight, and the benchmark suite (which measures exactly this failure mode);
not eliminable within this spec.

## 8. Component: known-outcome benchmark & backtest gate (Phase B)

New directory `data/benchmark_outcomes/` (replaces the illustrative
`data/benchmark_samples` as the engine's reality anchor; the old samples stay
until the aggregation code that reads them is migrated).

Per product (15–25 at launch):

```jsonc
{
  "id": "quibi_2020",
  "stimulus": "…DISGUISED pitch text (see curation rules)…",
  "stimulus_type": "landing_page",
  "product_category": "consumer_app",
  "target_market": "custom",
  "custom_segment_description": "US mobile-first entertainment consumers 18-35",
  "outcome": {
    "label": "hit" | "moderate" | "flop",
    "evidence": "…publicly documented outcome…",
    "sources": [{ "title": "…", "url": "…" }],
    "known_failure_modes": ["pricing_acceptance", "differentiation"]
  },
  "provenance": { "original_product": "Quibi", "disguise_notes": "…" }
}
```

**Curation rules (required, in the data README):**

- Outcomes must be publicly documented.
- **Disguise rule (anti-leakage):** product names, brands, and identifying
  surface details are rewritten; value proposition, pricing, evidence
  structure, and audience are preserved. This limits the assessor LLM
  "predicting" from memory of the real outcome. Residual leakage cannot be
  zero; stated in Limitations.
- ≥3 hit/flop pairs within the same category (so the suite cannot be passed
  on category priors alone).
- Spread across the 10 product categories; include obscure products, not only
  famous flops.
- Hindsight-bias warning: reconstruct pitches from archived pre-outcome
  material where possible, not post-mortems.

**Recorded semantic fixtures:** `data/benchmark_outcomes/fixtures/` holds the
committed assessor outputs for every benchmark stimulus, generated by a
script (`scripts/record_benchmark_fixtures.*`) and reviewed in PR diffs. CI
runs the **full blend path** against fixtures — deterministic and offline —
so the accuracy layer itself is gated, and semantic-prompt changes are
regression-visible.

**Gates** (new `apps/api/tests/test_benchmark_backtest.py` +
`apps/web/lib/server/engine/benchmark.test.ts`):

1. **Rank order:** Spearman correlation between `market_fit_score` and
   outcome rank (hit=2, moderate=1, flop=0) above threshold; no flop
   outscores a hit within the same category.
2. **Failure-mode hit rate:** for products with `known_failure_modes`, the
   run's top-3 adoption blockers include a documented failure mode for at
   least the threshold share.

**Thresholds are set empirically, not a priori:** measure the baseline on the
initial benchmark set, set thresholds just below the blend path's initial
performance, then ratchet upward in later PRs. Thresholds are named constants
in the tests. Any PR touching coefficients, priors, nudges, blend weight, or
the assessor prompt must keep the backtest green.

## 9. Component: persona feature integrity (Phase A)

- **Feature-wiring declaration** (`engine/persona/featureWiring.ts`): declared
  map `personaField → { mock: "scoring" | "flavor", llm: "prompt" }`.
- **Honest counterfactual audit:** in mock mode, audit pairs built on
  flavor-only fields report status `"not_applicable"` (with reason) instead
  of counting as "pass"; the audit summary distinguishes "tested and clean"
  from "cannot move in this provider." Wiring-consistency test: perturbing a
  declared-flavor field must produce delta 0; each declared-scoring field
  must be capable of a nonzero delta.
- **Objection decoupling:** every evidence-justified objection (no pricing,
  no proof, no trial, subscription, no security docs, unclear value, …) is a
  candidate for every persona, weighted by the relevant trait; a matching
  dealbreaker multiplies weight ×1.5 instead of gating inclusion. Backtest
  Gate 2 is the safety net for blocker quality.

## 10. Reporting & trust panel

Additive report fields only (no breaking schema changes):

```jsonc
"calibration_evidence": {
  "priors_coverage": 0.43,
  "priors_source": "data_files" | "embedded_unverified",
  "semantic_source": "nvidia" | "fireworks" | "fallback_formulas",
  "assumptions_fired": [
    { "id": "pricing_dealbreaker_injection", "evidence_status": "unverified",
      "personas_affected": 412 }
  ],
  "benchmark_suite": { "version": 1, "spearman": 0.61, "passed": true },
  "confidence_downgrades": ["semantic layer unavailable — keyword formulas used"]
}
```

`benchmark_suite` values are not computed per run: the backtest writes a small
result JSON when it passes (`data/benchmark_outcomes/last_result.json`,
committed alongside threshold changes), and the report embeds that build-time
snapshot. Absent file → the block reports `"benchmark_suite": null` and adds a
confidence downgrade.

Runs with `fallback_formulas` + low priors coverage cap the hero confidence
label at "medium". The existing disclaimer stays.

## 11. Error handling (consolidated)

| Failure | Behavior |
| --- | --- |
| Priors file invalid | Startup error (fail fast, dev-visible) |
| Priors directory missing | Embedded fallback + `embedded_unverified` label |
| Correlation matrix not PSD | Startup error naming the preset |
| Semantic call fails / bad JSON | One repair retry → formula fallback + labeled downgrade |
| Semantic value out of range | Per-field clamp/discard, never propagated |
| Unregistered nudge | Throws in dev/test; logged + skipped in prod |
| Benchmark fixture missing | Backtest fails loudly (no silent skip) |

Nothing degrades silently; every degradation is a visible report label.

## 12. Testing

- Priors loader: schema rejection, std widening, coverage math, embedded
  fallback, sourced-requires-mapping-rule.
- Correlated sampling: PSD validation, sampled ≈ declared correlation within
  tolerance at n=1,000, determinism, coherence flagging.
- Assumptions registry: unregistered modifier throws (dev); fired-count
  accounting; injection rate bound.
- Jitter: same seed → identical swarm; coefficients decorrelated across
  personas.
- Semantic: sanitization/clamping, malformed → fallback, cache reuse,
  prompt-injection stimulus cannot bypass clamps.
- Feature wiring: consistency test (flavor fields delta-0, scoring fields
  movable); audit reports `not_applicable` correctly.
- Objections: skeptical persona without a "proof" dealbreaker can still raise
  `no_proof`.
- Backtest: both gates, fixture-missing failure, threshold constants.
- Python mirror runs the same suites via pytest; parity is part of each
  phase's definition of done.

## 13. Phases

- **Phase A — calibration & feature integrity (no LLM):** priors files +
  loader + std widening, correlated sampling + coherence check, assumptions
  registry + de-nudging + jitter, feature wiring + honest audit, objection
  decoupling, trust-panel fields for priors/assumptions. Fully offline;
  immediately improves honesty and removes systematic distortions.
- **Phase B — semantic grounding & benchmark gate:** assessor + blend +
  sanitization + caching, benchmark set curation + disguise + fixtures +
  backtest CI gates, `semantic_source` surfacing + confidence caps.
  Delivers the accuracy gain and the measurement that proves it.

Each phase gets its own implementation plan; TS first, Python mirror in the
same plan.

## 14. Explicitly out of scope (later phases)

- Retrieval grounding of category facts (real competitor price anchors fed
  into pricing logic).
- LLM-swarm debiasing for the nvidia/fireworks reaction path (sycophancy
  correction, adherence checks beyond the current consistency checker).
- Micro human-calibration survey (~100–200 real respondents on 2–3 stimuli)
  to calibrate swarm distributions against real ones.
- MiroFish-style persona generation from seed data (deriving populations from
  real source material instead of preset files).

## 15. Limitations (honest ceiling)

Even fully implemented, this produces **directionally correct, well-ranked,
honestly-uncertain** predictions — good for objection discovery and concept
comparison, never survey-grade point estimates. Benchmark leakage cannot be
fully eliminated (assessor LLMs have world knowledge); disguising reduces it.
The semantic layer's own biases are measured and bounded, not removed. Priors
for personality-like traits will remain partly unverified; the system
compensates with honesty (wider spread, visible coverage), not false
precision.
