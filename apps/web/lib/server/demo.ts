/**
 * Demo / activation constants — the single source of truth for the public,
 * no-signup demo run and the one-time signup credit grant.
 *
 * IMPORTANT: this module is imported from BOTH client and server code
 * (app/demo/route.ts, scripts/seed_demo_storm.ts, the dashboard welcome toast,
 * and — indirectly, via this value — the signup-credit Supabase migration).
 * Keep it free of any server-only imports (no `fs`, no Supabase server client,
 * no Node-only APIs) so it stays safe to bundle into the browser.
 */

/**
 * Fixed storm_id for the pre-baked PersonaPilot demo run. Both
 * `scripts/seed_demo_storm.ts` (seed target) and `app/demo/route.ts`
 * (redirect target) import this so the seeded row and the redirect can
 * never diverge.
 */
export const DEMO_STORM_ID = 'demo-personapilot'

/**
 * Credit COST of the LARGEST run a user can launch — the 1200-persona option
 * on `storm/new`, the most expensive persona-count under the current price
 * table. This is a CREDIT COST, not a persona count: a 1200-persona run quotes
 * 120 credits in the create-page price preview.
 *
 * SINGLE SOURCE OF TRUTH for run cost. If the price table ever changes, update
 * THIS one literal to the real quote for a 1200-persona run — the derivation
 * below and every downstream consumer (Phase 4 migration literal, welcome
 * toast) follow automatically. Nothing else in the codebase re-hardcodes a
 * credit number.
 */
export const MAX_RUN_CREDIT_COST = 120

/**
 * One-time onboarding grant seeded into a new user's wallet on signup so the
 * first real run never hits the credit wall. Sized at 2x the cost of the
 * largest possible run so ANY persona-count selection (100/250/500/1000/1200)
 * clears the atomic wallet debit with margin.
 *
 * Activation aid ONLY — not a payments/purchase surface. Credits remain
 * admin-granted; this is a single onboarding grant applied once per user id.
 *
 * Derivation: DEMO_SIGNUP_CREDITS = 2 * MAX_RUN_CREDIT_COST = 240
 * (>= 2x a 1200-persona run, per R15 / spec §9.4).
 */
export const DEMO_SIGNUP_CREDITS = MAX_RUN_CREDIT_COST * 2
