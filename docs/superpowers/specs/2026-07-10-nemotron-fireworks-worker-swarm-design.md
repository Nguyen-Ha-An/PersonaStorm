# Design — Nemotron-orchestrated Fireworks worker swarm

Date: 2026-07-10
Status: implemented (`apps/web`)
Owner: engine / orchestration

## 1. Problem

PersonaStorm's production stack (`apps/web`) treats a "swarm" as hundreds or
thousands of persona reactions computed in-process by the TypeScript engine.
That is fine for the deterministic/mock path but does not model a real
multi-agent LLM swarm, and it would be catastrophically expensive and
rate-limit-hostile if every logical persona became a real API call.

We want a production web architecture where:

- **`nvidia/nemotron-3-ultra-550b-a55b`** is the single **orchestrator** ("main
  brain"): it plans the session, designs worker roles, delegates, reviews, and
  synthesizes the final report.
- **Fireworks `DeepSeek-V4-Flash`** runs the cheap, narrow **physical workers**.
- The number of **real** Fireworks calls per storm is **hard-capped at 10**,
  regardless of how many logical/virtual personas the plan asks for.

## 2. Vocabulary (used verbatim in code + docs)

| Term | Meaning |
| --- | --- |
| **Physical worker** | One real Fireworks API call / task slot. Max 10 per storm. |
| **Virtual agent** | A role/persona simulated *inside* a physical worker's prompt. Free to scale. |
| **Worker shard** | One physical worker assigned a batch of virtual agents. |
| **Orchestrator** | Nemotron. Plans, delegates, reviews, synthesizes. |

"Agents tự nhân lên" (agents multiply) happens only as **virtual** agents inside
a shard prompt — never as more real deployed API calls.

## 3. Non-negotiable hard cap

```ts
export const MAX_PHYSICAL_SWARM_WORKERS = 10;
```

- No admin setting, user input, request body, or model output may raise the
  effective physical worker count above 10.
- The resolver clamps every request:
  ```ts
  effectiveMaxPhysicalWorkers = Math.min(requested, MAX_PHYSICAL_SWARM_WORKERS);
  effectiveMaxPhysicalWorkers = Math.max(1, effectiveMaxPhysicalWorkers);
  virtualAgentsPerWorker = Math.max(1, virtualAgentsPerWorker);
  ```
- If the plan (or the user) wants 50 logical agents, the engine compresses them
  into ≤10 shards, each simulating several virtual agents internally.

## 4. Numeric honesty invariant (preserved)

The LLM may provide reaction text, qualitative observations, and raw
criterion-level judgments. But **`market_fit_score`, `status`, counts,
aggregate numbers, and recommendation-level numeric fields are always
recomputed server-side.** Nemotron and DeepSeek can never overwrite
server-computed numeric truth. The synthesizer output type is deliberately
**text-only** (string arrays + a `confidence` enum); a sanitizer strips any
stray numeric keys a model tries to inject and the server attaches its own
authoritative `ServerNumerics` block separately.

## 5. Secrets / env (server-only)

```env
NVIDIA_API_KEY=...
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1

FIREWORKS_API_KEY=...
FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1
FIREWORKS_DEEPSEEK_MODEL=accounts/fireworks/models/deepseek-v4-flash
```

Keys never reach the browser. The admin API exposes only booleans:
`nvidia_api_key_configured`, `fireworks_api_key_configured`. Base URLs and keys
are always sourced from env, never from a DB row (a settings row can change
*which model* is used, never *where requests go* or *what credential* signs
them — same rule as the existing `inference_settings`).

## 6. Runtime settings (extends the existing system)

New fields on `inference_settings` (all optional, env/default-backed):

```ts
orchestrator_provider: "nvidia"
orchestrator_model: string          // default nvidia/nemotron-3-ultra-550b-a55b
worker_provider: "fireworks"
worker_model: string                // default FIREWORKS_DEEPSEEK_MODEL
max_physical_workers: number        // clamped to <= 10, >= 1
virtual_agents_per_worker: number   // >= 1
worker_max_tokens: number
orchestrator_max_tokens: number
worker_temperature: number
orchestrator_temperature: number
enable_worker_web_research: boolean  // default false
worker_web_research_max_queries: number
orchestration_enabled: boolean       // master switch, default false
```

The resolver clamps `max_physical_workers` and enforces minimums regardless of
what the DB/admin stored.

## 7. Orchestration flow

```
queued → planning → running_workers → synthesizing → completed
                                                    ↘ failed
```

1. **Plan (Nemotron)** — inputs: stimulus, objective, persona/breadth target,
   `MAX_PHYSICAL_SWARM_WORKERS=10`, worker model, numeric-honesty rules,
   frontend output requirements. Output: `OrchestrationPlan` with ≤10 shards
   (server validates + clamps + *merges* extra shards rather than dropping
   roles).
2. **Workers (Fireworks)** — one call per shard (≤10 total). Each shard
   simulates its assigned virtual agents internally and returns a structured
   `WorkerShardOutput`. Retries on transient 429/5xx with capped backoff.
3. **Optional controlled research** — `WebResearchAdapter` interface; default
   `NullWebResearchAdapter` (disabled). The **server** decides whether to run a
   worker's requested queries; `worker_web_research_max_queries` bounds it.
4. **Synthesize (Nemotron)** — inputs: stimulus, plan, all shard outputs, the
   server-computed numerics, an explicit "do not invent/alter numbers"
   instruction. Output: text-only `OrchestratedStormReport`. Server then
   attaches `ServerNumerics`; conflicting model numbers are ignored.

## 8. Failure handling

```ts
max_failed_physical_workers = Math.floor(effectiveMaxPhysicalWorkers * 0.2)
// but allow at least 1 failure only when worker_count >= 5
```

- 3 workers → 0 tolerated; 5 → 1; 10 → 2.
- Within tolerance, Nemotron synthesizes from the successful shards.
- Beyond tolerance, the storm fails clearly with a user-safe reason.

## 9. Persistence

A single `orchestration_json` jsonb column on `storm_runs` (mirrors the existing
`report_json` / `reactions_json` pattern) holding the full record:

```ts
{ status, plan, worker_shard_outputs, final, server_numerics,
  physical_worker_count, virtual_agent_count, error_message,
  created_at, updated_at }
```

The frontend reloads via an owner-gated `GET /api/storm/[id]/orchestration`, so
a completed run's plan + shard outputs + final synthesis survive a page reload.

## 10. Security

Never serialize `NVIDIA_API_KEY`, `FIREWORKS_API_KEY`, `Authorization` headers,
or raw provider credentials. Never let a user prompt change
`MAX_PHYSICAL_SWARM_WORKERS`, provider base URLs, API keys, or the numeric
recomputation rules. Do not log full keys or full prompts by default.

## 11. Backward compatibility

Orchestrated mode is **opt-in** (`orchestration_enabled` default false). With it
off, the classic storm engine path is untouched and all existing behavior/tests
stay green.
