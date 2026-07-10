# Persona priors — curation guide

This directory holds the trait priors used to sample persona populations:
`_base.json` (global base traits) plus one file per named preset
(`budget.json`, `early_adopters.json`, `enterprise.json`, `parents.json`,
`sea_genz.json`, `us_smb.json`). They are read at runtime by
`apps/web/lib/server/engine/persona/priorsLoader.ts` — **there is nothing to
build or compile**; editing a JSON file here changes the next run
immediately.

See [`docs/criteria-system.md`](../../docs/criteria-system.md) §8 ("Persona
priors & assumptions") for how these values flow into scoring, the honesty
widening/shrinking rules, and the assumptions registry. This file is about
*curating* the numbers themselves.

## Evidence statuses

Every trait (and every entry in `trait_correlations`) carries an
`evidence.status`:

- **`sourced`** — the `mean`/`std` (or correlation `r`) is backed by a cited,
  checkable external source and a documented rule for how that source's
  numbers map onto our 0..1 trait scale. This is the only status that is
  used as-authored, with no honesty penalty applied at load time.
- **`derived`** — computed or inferred deterministically from other already-
  scored/known quantities, not an independent empirical claim. No honesty
  widening/shrinking is applied, but it is not treated as externally
  verified either.
- **`unverified`** — a design estimate with no cited source. This is the
  default and is expected to be the status of most trait values today. The
  loader automatically:
  - widens `std` by ×1.5 (capped at 0.20), and
  - shrinks any `trait_correlations` pair's `r` by ×0.5,

  so an unverified guess never produces a falsely tight or falsely
  structured persona distribution. **Do not try to work around this by
  inflating an unverified `std`/`r` to compensate** — if you want the
  as-authored number to survive unshrunk, it needs to become `sourced` or
  `derived` with real justification, not a bigger unverified number.

## Promoting a trait to `sourced`

Marking a trait `"sourced"` is a claim readers will trust. Before doing it,
all three of the following must be true, and the loader enforces the last
two at load time (it throws otherwise):

1. **Source(s)** — cite where the number comes from. Put the citation in the
   trait's own comment/notes if the JSON schema allows free text, or track
   it alongside the file in your PR description; at minimum the
   `mapping_rule` below should reference the source by name.
2. **`evidence.mapping_rule`** (required by the loader) — a string
   explaining precisely how the source's number was converted onto our 0..1
   scale (e.g. "68% of respondents cited price as top purchase factor in
   [source] → mapped to price_sensitivity mean 0.68 using the linear scale
   in trait_definitions").
3. **A `trait_definitions` entry** (required by the loader) — the
   operational definition of what `0.9` / `0.5` / `0.1` mean behaviorally
   for that trait, so the mapping in (2) is checkable against a fixed
   reference point rather than vibes.

Missing (2) or (3) for a trait claiming `sourced` status is a hard load
error (`priorsLoader.ts` throws `... is sourced but has no mapping_rule`
/ `... has no operational definition in trait_definitions`) — the app will
not start with a half-sourced trait.

### Realistic anchor sources

When curating, prefer sources that are plausible for the trait and the
target population, for example:

- **Pew Research Center** — attitudes, technology adoption, trust in
  institutions, generational splits (skepticism, brand_trust,
  social_influence).
- **Eurostat** — EU consumer/household survey data (income bands, price
  sensitivity by region, digital adoption).
- **e-Conomy SEA** (Google/Temasek/Bain) — Southeast Asia digital economy
  and consumer behavior, directly relevant to `sea_genz.json`.
- **EIU (Economist Intelligence Unit) consumer research** — cross-market
  consumer sentiment, risk tolerance, spending behavior.

These are starting points, not a whitelist — any checkable, citable source
with a defensible mapping rule is acceptable. Avoid citing a source that
only loosely gestures at the trait; if the mapping rule would be a stretch,
leave the trait `unverified` rather than mis-labeling it `sourced`.

### Personality-like traits stay `derived`/`unverified`

Traits that are closer to stable personality dimensions than to measurable
market behavior — e.g. `novelty_seeking`, `risk_tolerance` — are much harder
to anchor to a specific external number without importing a full
psychometric instrument (e.g. Big Five / BFI item mappings) we don't
currently administer. **Expect these to remain `derived` or `unverified`**
rather than forcing a `sourced` label onto a loosely-related market-research
statistic. It is fine, and expected, for a preset file to have some
`sourced` traits (typically the more behavioral/economic ones like
`price_sensitivity`) alongside `derived`/`unverified` personality traits.

## WARNING: the exporter overwrites curation

`npm run export:priors` (run from `apps/web`) regenerates every file in this
directory from the hardcoded fallback presets in
`apps/web/lib/server/engine/persona/presets.ts`, with **every trait reset to
`evidence.status: "unverified"`** and no `trait_correlations`. It is meant
to be run **once**, to bootstrap this directory from code.

**Once curation has begun (any file here has a `sourced` or hand-tuned
`derived` trait, or custom `trait_correlations`), do not re-run the exporter
blindly.** Doing so silently discards all curated evidence status,
`mapping_rule` strings, and correlation data, replacing them with the
original unverified code defaults. If the embedded presets in `presets.ts`
change and you need to pick up new sub-segments/fields, do it by hand-editing
the affected JSON file(s), or by re-running the exporter into a scratch
directory and diffing/merging structural changes back in manually — never by
overwriting `data/persona_priors/*.json` in place.
