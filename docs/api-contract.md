# API contract

Live, always-current version: run the API and open **http://localhost:8000/docs**
(OpenAPI, generated from the Pydantic schemas). This file is the human summary.

Base URL: `http://localhost:8000`

## POST /api/storm/create

Creates a storm and starts it immediately (background task).

Request body:
```json
{
  "title": "PersonaPilot",
  "stimulus_type": "product_concept | landing_page | ad | pricing_table",
  "stimulus": "string (20..20000 chars)",
  "target_market": "sea_genz | us_smb | parents | enterprise | budget | early_adopters | custom",
  "custom_segment_description": "required iff target_market=custom (≥12 chars)",
  "product_category": "ai_tool | b2b_saas | consumer_app | ecommerce_product | education_product | marketplace | social_product | hardware_product | luxury_product | generic | null",
  "persona_count": 1000,
  "seed": 1337
}
```

`persona_count`: 50–1200, default 1000. `seed` optional — same seed ⇒
identical run. **`product_category`** is optional and new: omit it (or send
`null`) to auto-detect the category from the stimulus via the classifier
(`app/services/criteria/classifier.py`); pass one of the 10 category ids to
override the classifier's guess and force which criteria weight preset +
age-overlay lambda the whole storm scores against.

Response `200`:
```json
{ "storm_id": "storm_ab12cd34ef56", "status": "created" }
```
`422` on validation failure (missing custom description, short stimulus, …).

## GET /api/storm/{storm_id}

Lightweight status for polling/refresh: status, completed count, `report_ready`.
`404` if unknown.

## GET /api/storm/{storm_id}/stream  (SSE)

`Content-Type: text/event-stream`. Replays history, then tails. Events:

| event | data |
|---|---|
| `init` | `{storm_id, title, persona_count, target_market, status}` |
| `reaction` | `{persona_id, index, segment, buy_likelihood, max_price, status, first_objection, quote}` |
| `progress` | `{status, completed, total, green, yellow, red, avg_max_price, top_objection, collapse_risk, elapsed_ms}` |
| `complete` | `{storm_id, report_ready: true, adoption}` |
| `error` | `{message}` |

`reaction.index` is the persona's slot in the grid (0-based). One `progress`
event follows each drained batch; a heartbeat progress fires at least every 5 s.
The `reaction` event's flat fields (`buy_likelihood`, `max_price`, `status`,
`first_objection`, `quote`) are read-only compatibility shims over the
persona's nested `decision`/`qualitative` objects (see below) — the live grid
never needs the full 17-criterion breakdown per event.

## GET /api/storm/{storm_id}/report

- `200` → full `StormReport` (see `packages/schemas/report.schema.json`)
- `202` → run still in progress; body = same shape as GET /api/storm/{id}
- `404` → unknown storm; `500` → run failed (detail = error)

Report response shape (fields new in the multi-criteria upgrade are marked **new**):

```json
{
  "storm_id": "string",
  "title": "string",
  "summary": "string",
  "product_category": "string",

  "overall": {
    "market_fit_score": 0.0,
    "confidence": "low|medium|high",
    "top_blockers": ["string", "string", "string"],
    "top_strengths": ["string", "string", "string"]
  },

  "adoption": {
    "green": 0, "yellow": 0, "red": 0,
    "average_buy_likelihood": 0.0,
    "average_market_fit_score": 0.0
  },

  "criteria_breakdown": [
    {
      "criterion_id": "trust",
      "label": "Trust",
      "average_score": 0.0,
      "higher_is_better": true,
      "weight": 0.0,
      "segment_scores": [{ "segment": "string", "score": 0.0 }],
      "interpretation": "string"
    }
  ],
  "weakest_criteria": [
    { "criterion_id": "string", "label": "string", "average_score": 0.0, "weight": 0.0, "interpretation": "string" }
  ],
  "strongest_criteria": [
    { "criterion_id": "string", "label": "string", "average_score": 0.0, "weight": 0.0, "interpretation": "string" }
  ],

  "segments": [
    { "segment": "string", "personas": 0, "green": 0, "yellow": 0, "red": 0,
      "adoption_rate": 0.0, "avg_buy_likelihood": 0.0, "avg_max_price": 0.0,
      "top_objection": "string", "insight": "string" }
  ],
  "age_cohorts": [
    { "life_stage": "teen_student|student_young_adult|early_career|parent_family|established_adult|older_adult",
      "personas": 0, "adoption_rate": 0.0, "avg_buy_likelihood": 0.0,
      "avg_market_fit_score": 0.0, "top_barrier": "string", "insight": "string" }
  ],

  "top_objections": [
    { "label": "string", "count": 0, "share": 0.0, "example_quote": "string", "top_segments": ["string"] }
  ],
  "price_sensitivity": [{ "price": 0.0, "share_willing": 0.0 }],

  "kill_quote": "string",
  "kill_quote_context": { "persona_id": "string", "segment": "string", "buy_likelihood": 0.0, "skepticism": 0.0 },

  "recommendations": [{ "title": "string", "detail": "string", "priority": "now|next|later" }],
  "next_human_validation": [
    { "question": "string", "test_type": "survey|interview|landing_page_ab_test|pricing_test|ad_test|usability_test", "rationale": "string" }
  ],

  "quality": {
    "persona_adherence": 0.0, "product_grounding": 0.0,
    "generic_response_rate": 0.0, "duplicate_objection_rate": 0.0,
    "objection_entropy": "low|medium|high", "objection_entropy_score": 0.0,
    "segment_variance": "weak|moderate|strong", "segment_variance_score": 0.0,
    "age_cohort_variance": "weak|moderate|strong",
    "criteria_consistency": 0.0,
    "collapse_risk": "low|medium|high", "collapse_risk_score": 0.0,
    "benchmark_confidence": "low|medium|high", "benchmark_category": "string|null",
    "notes": ["string"]
  },

  "persona_count": 0, "stimulus_type": "string", "target_market": "string",
  "avg_max_price": 0.0, "generated_at": "ISO 8601", "disclaimer": "string"
}
```

Field notes:
- **`overall`** is the headline block: `market_fit_score` is the run's mean
  `market_fit_score` across all reactions (system-computed, see
  [criteria-system.md](criteria-system.md)); `confidence` is derived from
  `quality.benchmark_confidence` and `quality.collapse_risk` and can never
  exceed `benchmark_confidence` (a run cannot be more trustworthy than the
  benchmark it was checked against); `top_blockers`/`top_strengths` are the
  top-3 labels from `weakest_criteria`/`strongest_criteria`.
- **`adoption.average_buy_likelihood` / `average_market_fit_score`** — new
  averages alongside the existing green/yellow/red counts.
- **`criteria_breakdown`** — always 17 entries (one per core criterion, in
  registry order), each with the resolved category weight and a per-segment
  split.
- **`weakest_criteria` / `strongest_criteria`** — disjoint partitions of the
  same 17 criteria (see criteria-system.md §6), capped at 5 each.
- **`age_cohorts`** — only life stages actually present in the run appear
  (an enterprise-market storm may show zero `teen_student` rows).
- **`next_human_validation`** — aggregated from every persona's
  `research_recommendation`, grouped by `best_next_test`, top 3 by how many
  personas asked for that test.
- **`quality.age_cohort_variance` / `criteria_consistency`** — new trust-panel
  fields; see [evaluation-framework.md](evaluation-framework.md).

## GET /api/health

```json
{ "status": "ok", "version": "0.1.0", "inference_provider": "mock",
  "active_storms": 0, "time": "…" }
```
