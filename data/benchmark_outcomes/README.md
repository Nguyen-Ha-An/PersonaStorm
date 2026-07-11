# Benchmark outcomes — known-outcome backtest data

This directory is the engine's **reality anchor** (spec §8): a set of
product pitches with a publicly-documented outcome (`hit` / `moderate` /
`flop`), used by the backtest gate (Task 9,
`apps/web/lib/server/engine/benchmark.ts` +
`apps/web/lib/server/engine/benchmark.test.ts` /
`apps/api/tests/test_benchmark_backtest.py`) to check that
`market_fit_score` correlates with real-world outcomes and that the
top adoption blockers the engine surfaces line up with each product's
documented failure mode.

It replaces `data/benchmark_samples/` (illustrative objection-distribution
samples used elsewhere in the codebase) as the engine's calibration
ground truth. `benchmark_samples/` stays until the code that reads it is
migrated separately — it is unrelated to this directory.

## ⚠️ Current status: illustrative seed set only

The 5 entries currently in this directory are **illustrative seed data**,
authored by an agent from general public knowledge of well-known
product-outcome *patterns* — not a curated, provenance-tracked benchmark.
Every seed entry carries `"illustrative": true`, and `index.json` carries a
top-level `"illustrative_only": true` flag while this remains true.

**A human must curate a real 15–25 entry set — disguised, provenance-tracked,
sourced from specific public material — before any benchmark number
(Spearman correlation, failure-mode hit rate, pass/fail gate result) is
treated as a validation claim.** Illustrative entries are excluded from any
published validation claim; they exist only so the recorder script, the
fixture format, and the Task 9 gate machinery have something real to run
against during development.

**Thresholds are measured, not assumed.** Task 9 does not hardcode a
"good" Spearman correlation or failure-mode hit rate up front. The process
is: curate the real set → run the backtest against it → record the
baseline the blend path actually achieves → set gate thresholds just below
that baseline (named constants in the test files) → ratchet the thresholds
upward in later PRs as the engine improves. Until the real set exists, the
gate thresholds (if any run against the illustrative set) are placeholders,
not calibration targets.

## Entry schema

One JSON file per entry, `data/benchmark_outcomes/<id>.json`:

```jsonc
{
  // Must match the filename (`<id>.json`) — the fixture recorder uses this
  // to name the recorded semantic fixture (`fixtures/<id>.json`).
  "id": "quibi_2020",

  // true for seed/illustrative entries; omit (or false) once an entry is a
  // properly curated, sourced, disguised real-world entry.
  "illustrative": true,

  // The DISGUISED pitch text — see "Disguise rule" below. This is what gets
  // fed into parseStimulus() / the semantic assessor, exactly as if it were
  // a live storm's stimulus.
  "stimulus": "…disguised pitch text…",

  // Same free-text values accepted by the live stimulus parser, e.g.
  // "landing_page", "product_concept", "pitch_deck", "app_description".
  "stimulus_type": "landing_page",

  // One of the engine's known product_category values: ai_tool, b2b_saas,
  // consumer_app, ecommerce_product, education_product, marketplace,
  // social_product, hardware_product, luxury_product, generic.
  "product_category": "consumer_app",

  // Persona preset key. "custom" + custom_segment_description is the norm
  // for benchmark entries so the audience matches the real launch audience
  // rather than a generic named preset.
  "target_market": "custom",
  "custom_segment_description": "US mobile-first entertainment consumers 18-35",

  "outcome": {
    "label": "hit", // "hit" | "moderate" | "flop" — see definitions below
    "evidence": "…publicly documented outcome, or (for illustrative entries) the named public pattern this composite draws on…",
    // Optional for illustrative composites (there is no single real source
    // to cite); required for real curated entries.
    "sources": [{ "title": "…", "url": "…" }],
    // Criteria-registry ids (see apps/web/lib/server/engine/criteria/registry.ts)
    // that the real/patterned outcome is publicly attributed to. Drives the
    // backtest's failure-mode hit-rate gate. Omit or leave empty for hits
    // with no documented failure mode.
    "known_failure_modes": ["pricing_acceptance", "differentiation"]
  },

  "provenance": {
    // For real curated entries: the actual product name, e.g. "Quibi".
    // For illustrative seed entries: the literal string
    // "(disguised composite)" — these are not modeled on one specific
    // company, only on a publicly-known pattern.
    "original": "(disguised composite)",
    "disguise_notes": "names/brands removed; value prop, pricing, evidence structure, and audience preserved"
  }
}
```

`outcome.label` definitions:

- **hit** — the product achieved durable market success (sustained
  adoption/revenue/retention as publicly reported).
- **moderate** — the product survived and found some traction but did not
  clearly succeed (niche adoption, got acquired for the team, plateaued,
  pivoted).
- **flop** — the product was publicly discontinued, shut down, or
  widely reported as a market failure.

## Curation rules

These rules apply to every entry — illustrative seed entries included —
and are mandatory for any real entry a human adds later.

### 1. Outcomes must be publicly documented

Only use outcomes that are a matter of public record (news coverage,
company announcements, well-known industry post-mortems). For real
entries, `outcome.sources` must cite them. Illustrative entries instead
name the public **pattern** being drawn on (e.g. "publicly-known
premium short-form video failure pattern") rather than a specific
citable source, because they are composites, not single real products.

### 2. Disguise rule (anti-leakage)

Product names, brands, and other identifying surface details (exact
pricing copy, logos, taglines, founder names, etc.) must be **rewritten**
before the pitch goes into `stimulus`. What must be **preserved**: the
value proposition, the pricing structure/tier logic, the evidence
structure (what proof points the original pitch leaned on), and the
target audience.

This exists to limit the assessor LLM "predicting" the outcome from its
own training-data memory of the real product, rather than actually
reasoning about the pitch. Residual leakage cannot be reduced to zero —
a sufficiently distinctive pattern (e.g. "$2,000 juicer that requires a
subscription to activate packets you could squeeze by hand") may still
be recognizable even fully disguised. This is a known, accepted
limitation, not something the disguise rule claims to eliminate.

Every entry must carry `provenance.original` (the real product name for
curated entries, or the literal string `"(disguised composite)"` for
illustrative entries) plus `disguise_notes` describing what was changed.

Illustrative seed entries in this directory go one step further than
disguising a single real product: they are **disguised composites**
drawn from a publicly-known outcome *pattern* across multiple examples
in a category, not modeled on any one identifiable company. Do not name
real companies anywhere in an illustrative entry's `stimulus` or
`outcome`, and do not fabricate specific private figures (exact revenue,
user counts, funding amounts) — illustrative entries describe the
*shape* of a known outcome pattern only.

### 3. Within-category pair rule

The full curated set (target: 15–25 entries) must include **at least 3
hit/flop pairs sharing the same `product_category`**. This exists so the
backtest can't be passed on category priors alone (e.g. "all consumer
apps score high" would fail a within-category pair where one consumer
app was a hit and another a flop). The illustrative seed set (5 entries)
includes one such pair as a placeholder demonstrating the shape Task 9's
`withinCategoryInversions` gate needs to test against; it does not by
itself satisfy the ≥3-pair requirement for a validation claim.

### 4. Spread across categories

Entries should span the engine's known `product_category` values
(`ai_tool`, `b2b_saas`, `consumer_app`, `ecommerce_product`,
`education_product`, `marketplace`, `social_product`,
`hardware_product`, `luxury_product`, `generic`) and should include
obscure/lesser-known products, not only famous flops — famous cases are
easy for an LLM to recognize regardless of disguising.

### 5. Hindsight-bias rule

Reconstruct each pitch from **pre-outcome** material where possible —
the original landing page, pitch deck, launch announcement, or press
coverage from before the outcome was known — not from post-mortems or
retrospectives written after the fact with the benefit of hindsight.
Post-mortems tend to cherry-pick the framing that makes the eventual
outcome look inevitable, which would bias the benchmark toward being
"easy" in a way that doesn't reflect the engine's real predictive task
(assessing a pitch before the outcome is known).

## Recorded semantic fixtures

`fixtures/<id>.json` holds the **committed assessor output** for every
benchmark entry's stimulus — the full semantic matrix that
`getSemanticAssessor(cfg).assess(...)` produced when the fixture was last
recorded. This lets CI run the full blend path (formulas + semantic
grounding) against the benchmark set **offline and deterministically**,
without a live LLM call, so:

- the accuracy layer itself (not just the formula layer) is gated, and
- changes to the semantic prompt, sanitizer, or blend weight are
  regression-visible in the backtest.

Fixtures are regenerated with `npm run record:fixtures` (from `apps/web`),
which runs `apps/web/scripts/recordBenchmarkFixtures.ts`. **Regenerating
fixtures is a reviewed act** — commit the resulting diff like any other
code change, and look at what changed. With `SEMANTIC_PROVIDER=mock`
(the default), the recorder records the deterministic mock assessor's
matrices, which is what's committed today. Pointing the recorder at a
real provider (e.g. `SEMANTIC_PROVIDER=nvidia`) snapshots true semantic
outputs instead — useful once real credentials and a curated set exist,
but not required for the mock-path illustrative fixtures committed here.

## index.json

Lists every entry `id` present in this directory, plus a top-level
`"illustrative_only": true` flag while the set is seed-only. A human
curating the real set should flip that flag to `false` (or remove it)
once real, sourced, disguised entries make up the set — and should keep
`illustrative: true` seed entries either removed or clearly separated
from entries counted toward a validation claim.
