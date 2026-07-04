# API contract

Live, always-current version: run the API and open **http://localhost:8000/docs**
(OpenAPI, generated from the Pydantic schemas). This file is the human summary.

Base URL: `http://localhost:8000`

## POST /api/storm/create

Creates a storm and starts it immediately (background task).

Request body:
```json
{
  "title": "MealPilot",
  "stimulus_type": "product_concept | landing_page | ad | pricing_table",
  "stimulus": "string (20..20000 chars)",
  "target_market": "sea_genz | us_smb | parents | enterprise | budget | early_adopters | custom",
  "custom_segment_description": "required iff target_market=custom (≥12 chars)",
  "persona_count": 1000,
  "seed": 1337
}
```
`persona_count`: 50–1200, default 1000. `seed` optional — same seed ⇒ identical run.

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

## GET /api/storm/{storm_id}/report

- `200` → full `StormReport` (see `packages/schemas/report.schema.json`)
- `202` → run still in progress; body = same shape as GET /api/storm/{id}
- `404` → unknown storm; `500` → run failed (detail = error)

## GET /api/health

```json
{ "status": "ok", "version": "0.1.0", "inference_provider": "mock",
  "active_storms": 0, "time": "…" }
```
