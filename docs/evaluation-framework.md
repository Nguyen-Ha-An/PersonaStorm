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
| Collapse risk | 0.35·dup + 0.35·(1−entropy) + 0.30·likelihood-concentration; live sliding-window monitor during the run | sequential changepoint detection; auto-abort + re-temperature |
| Benchmark confidence | category detected + reference data present (capped "medium" at P0) | per-cell calibration coverage from real studies |

Design rule embedded in the metrics: **theme convergence is signal, verbatim
convergence is collapse.** Many personas raising "no pricing shown" is the
product insight; many personas saying the same *sentence* is model failure.

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
