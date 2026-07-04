# Evaluation framework

Two loops: an **inner loop** that runs on every storm and feeds the Trust
Panel (shipped, `services/quality/`), and an **outer loop** that gates model
and prompt releases (P0: `scripts/evaluate_outputs.py`; grows into CI).

## Inner loop — per-storm trust metrics (shipped)

| Metric | P0 implementation | Upgrade path |
|---|---|---|
| Schema validity | Pydantic validation at ingest; invalid = provider error | vLLM guided_json makes it structural |
| Persona adherence | Spearman correlations: price_sensitivity ↔ WTP/budget (−), skepticism ↔ intent (−), brand_trust ↔ intent (+), novelty ↔ intent when AI-framed (+) | learned probe per trait; per-persona (not just population) checks |
| Product grounding | anchor-token / price references in reaction text | NLI: "does this reaction entail content of the stimulus?" |
| Generic response rate | phrase blacklist + no-anchor test | perplexity-under-template + embedding distance to known filler |
| Duplicate rate | 1 − distinct/N normalized quotes, fixed 300 subsample | MinHash/SimHash near-dup at scale |
| Objection entropy | normalized Shannon over objection themes | entropy over embedding clusters |
| Segment variance | stddev of segment mean intent | ANOVA F-stat + effect size |
| **Age-cohort variance** | stddev of per-life-stage mean intent (same weak/moderate/strong banding as segment variance) — do teens, parents, and early-career personas actually diverge? | ANOVA across life-stage cells; interaction effects with segment |
| **Criteria consistency** | share of personas passing all 4 internal-consistency rules below (`services/quality/consistency_checker.py`) | per-rule pass rates surfaced individually; learned anomaly detector over the 17-dim vector |
| Collapse risk | 0.35·dup + 0.35·(1−entropy) + 0.30·likelihood-concentration; live sliding-window monitor during the run | sequential changepoint detection; auto-abort + re-temperature |
| Benchmark confidence | category detected + reference data present (capped "medium" at P0) | per-cell calibration coverage from real studies |

Design rule embedded in the metrics: **theme convergence is signal, verbatim
convergence is collapse.** Many personas raising "no pricing shown" is the
product insight; many personas saying the same *sentence* is model failure.

### Criteria-consistency rules (`check_consistency`)

Diagnostic-only — flags contradictions inside a single reaction's own
numbers, never mutates scores (score interactions are the scoring
modifiers' job, see [criteria-system.md](criteria-system.md) §5, so there is
exactly one place that adjusts a score). Four rules, all tuned so a coherent,
moderate reaction never trips any of them:

| rule | condition | why it's a contradiction |
|---|---|---|
| `trust_vs_buy` | `trust < 0.25` and `overall_buy_likelihood > 0.75` | distrust and near-certain purchase intent shouldn't co-occur |
| `price_vs_wtp` | `pricing_acceptance < 0.25` and `max_price > 0.4 × monthly_budget_usd` | rejecting the price as unacceptable, yet stating high willingness to pay |
| `proof_vs_trust` | `proof_requirement > 0.70` and `trust > 0.70` | demanding heavy proof and already being highly trusting are inversely related |
| `uniform_criteria` | stddev of all 17 criteria `< 0.05` | a real report card varies; near-flat scores carry ~no signal |

`criteria_consistency_score(personas, reactions)` = share of persona/reaction
pairs with zero violations, `[0,1]`, higher is better; feeds
`quality.criteria_consistency` and the report's consistency notes.

### market_fit-matches-weights + criteria-uniformity (planned, not yet in the harness)

Because `market_fit_score` is always the output of `compute_market_fit`
(never a model invention — see criteria-system.md §5), it is possible to
recompute the expected `category_weighted_core_score` from a run's reported
per-criterion averages and the resolved category weights, and assert it
matches what `overall`/`criteria_breakdown` implies — a regression test
against silent drift between the scorer and the aggregation layer. A
population-level **criteria-uniformity** check (too many personas tripping
`uniform_criteria` across the whole run, not just the per-persona
`criteria_consistency` share) is the natural companion. **Status: this
document describes the intended design; `scripts/evaluate_outputs.py`
currently recomputes `compute_quality` end-to-end (which already includes
`criteria_consistency`) and diffs it against the stored report, but does not
yet add these two checks as separate, explicitly-named assertions — tracked
as a follow-up on the eval harness, not the scoring engine itself.**

## Outer loop — release evaluation

1. **Frozen stimulus set**: ~50 stimuli across categories × 7 markets ×
   fixed seeds. Every candidate (model, prompt, provider) runs the identical
   set; metrics diffed against the incumbent.
2. **Top-k objection overlap with reality**: for products with public review
   corpora, compare swarm top-5 objection themes vs themes mined from real
   reviews (Jaccard@5). This is the cheapest strong signal that the swarm
   predicts *actual* complaints.
3. **Calibration score**: where paired real-survey data exists (training
   roadmap phase 3), report MAE between swarm adoption/WTP and survey
   marginals per cell + reliability diagrams. Cells without data stay
   `benchmark_confidence: low` in the product — uncertainty is surfaced,
   never hidden.
4. **Human expert review**: structured rubric (usefulness, plausibility,
   harmful-nonsense rate) on 10 unseen storms, 3 raters; majority approval
   required (release gate #7 in training-roadmap.md).
5. **Anti-collapse stress tests**: adversarial stimuli (empty-ish copy,
   duplicate sentences, extreme prices) must degrade *gracefully* — collapse
   detector fires, report carries the warning, recommendations say "re-run".
   `tests/test_quality.py::test_collapsed_run_is_detected` is the seed of
   this suite and runs in CI today.

## Honest limitations (P0)

- All inner-loop estimators are heuristics; they measure *internal
  consistency*, not real-world accuracy. Real accuracy requires phase-3
  calibration data.
- The mock provider inherits the biases of its hand-tuned rules; its numbers
  demonstrate the *pipeline*, not market truth. The UI disclaimer and report
  `disclaimer` field state this everywhere.
- Benchmark samples shipped in `data/benchmark_samples/` are illustrative
  composites, clearly labeled, and cap confidence at "medium".
