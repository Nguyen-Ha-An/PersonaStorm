# Plan — Nemotron-orchestrated Fireworks worker swarm

Date: 2026-07-10
Spec: ../specs/2026-07-10-nemotron-fireworks-worker-swarm-design.md
Target: `apps/web` only (do not modify `apps/api`).

## Files

New:
- `apps/web/lib/server/engine/orchestration/caps.ts` — hard cap + distribution + failure math.
- `apps/web/lib/server/engine/orchestration/types.ts` — all orchestration types.
- `apps/web/lib/server/engine/orchestration/research.ts` — `WebResearchAdapter` + disabled default.
- `apps/web/lib/server/engine/orchestration/planner.ts` — Nemotron planner + `validateAndClampPlan`.
- `apps/web/lib/server/engine/orchestration/workerRunner.ts` — bounded worker execution + retries + failure rule.
- `apps/web/lib/server/engine/orchestration/synthesizer.ts` — Nemotron synthesis + numeric-honesty sanitizer.
- `apps/web/lib/server/engine/orchestration/orchestrator.ts` — end-to-end pipeline.
- `apps/web/lib/server/engine/orchestration/index.ts` — exports.
- `apps/web/lib/server/engine/providers/fireworks.ts` — Fireworks worker client (OpenAI-compatible).
- `apps/web/lib/server/engine/orchestration/orchestration.test.ts` — the 11 acceptance tests.
- `apps/web/components/orchestration/OrchestrationView.tsx` — renders plan/shards/synthesis.
- `apps/web/components/orchestration/OrchestrationView.test.tsx` — render + reload coverage.
- `apps/web/app/api/storm/[id]/orchestration/route.ts` — owner-gated GET.
- `supabase/migrations/20260710000000_orchestration.sql` — settings columns + `orchestration_json`.

Edited:
- `apps/web/lib/server/env.ts` — Fireworks + orchestration defaults on `ServerConfig`.
- `apps/web/lib/server/inferenceSettings.ts` — orchestration fields, clamping, `fireworks_api_key_configured`.
- `apps/web/lib/server/gateway.ts` — persist/read orchestration; extend settings input; in-memory support.
- `apps/web/lib/server/stormStore.ts` — `getStormOrchestration`.
- `apps/web/lib/types.ts`, `apps/web/lib/api.ts` — client types + `getOrchestration`.
- `apps/web/app/(app)/storm/[id]/report/page.tsx` — mount `OrchestrationView` when present.
- `.env.example` — document the new vars.

## Sequence

1. Spec + plan (this).
2. `caps.ts` (pure, hard cap is the spine) → tested first.
3. `types.ts`, `research.ts`.
4. `providers/fireworks.ts` + planner/synthesizer clients (injectable interfaces).
5. `workerRunner.ts` (retry + failure tolerance, ≤10 calls).
6. `orchestrator.ts` pipeline + status transitions.
7. env + runtime settings + migration + gateway persistence.
8. API route + client + frontend component.
9. Tests (11 items) + extend inferenceSettings test.
10. `npm test -- --run` and `npm run build`.

## Test matrix (acceptance)

1. `MAX_PHYSICAL_SWARM_WORKERS` cannot be exceeded (clamp).
2. 30 requested agents → 10 physical workers, virtual agents distributed.
3. Nemotron plan with >10 shards clamped/merged to 10 (no role dropped).
4. Fireworks key never returned by admin GET view.
5. Admin view returns only `fireworks_api_key_configured`.
6. Worker execution calls Fireworks ≤10 times.
7. Virtual agents don't increase physical call count.
8. Failed workers tolerated only within the failure rule.
9. Nemotron final synthesis cannot override server-computed numeric fields.
10. Reload loads persisted worker outputs + final output.
11. Existing storm behavior green when orchestration disabled.

## Guardrails

- Every provider call goes through an injectable interface so tests count calls
  without network/keys.
- Keys/base URLs always from env; DB rows can't repoint or leak them.
- Synthesizer output is text-only; sanitizer strips numeric keys; server
  numerics attached separately.
