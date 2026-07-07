import "./only";

/**
 * Storm store + create orchestration — the SaaS/billing wrapper around the
 * synchronous storm engine. Mirrors apps/api/app/routers/storm.py:
 *   price -> charge atomically -> record run -> run engine -> persist -> refund
 *   on failure. Ownership is enforced on every read (a non-owner gets 404, so
 *   storm IDs never leak). No path here is reachable without a verified user.
 */

import { getConfig, type ServerConfig } from "./env";
import { HttpError, InsufficientCreditsError, SupabaseError } from "./errors";
import type { CurrentUser } from "./auth";
import type { Gateway } from "./gateway";
import { getPricingRule, quotePrice } from "./pricing";
import { chargeForStorm, refundStorm } from "./wallet";
import { runStorm, type ProgressEvent, type ReactionEvent } from "./stormEngine";
import type { StormReport } from "./engine/report";

export interface CreateStormPayload {
  title: string;
  stimulus_type: string;
  stimulus: string;
  target_market: string;
  custom_segment_description?: string | null;
  product_category?: string | null;
  persona_count: number;
  seed?: number | null;
}

export interface StormCreateResult {
  storm_id: string;
  status: string;
  price_credits: number;
  wallet_balance_after: number | null;
}

export interface StormMeta {
  storm_id: string;
  title: string;
  status: string;
  stimulus_type: string;
  target_market: string;
  persona_count: number;
  completed: number;
  report_ready: boolean;
  price_credits: number;
  error: string | null;
  created_at: string;
}

export interface StreamData {
  meta: StormMeta;
  reactions: ReactionEvent[];
  progress: ProgressEvent;
}

export function newStormId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const hex = g.crypto?.randomUUID
    ? g.crypto.randomUUID().replace(/-/g, "")
    : Date.now().toString(16) + Math.floor(Math.random() * 1e12).toString(16);
  return `storm_${hex}`;
}

/**
 * storm_runs.error is shown to the run owner (report page, GET /storm/[id],
 * SSE error event). Raw exception text can carry provider response bodies or
 * env-var names, so only a curated, user-safe reason is ever persisted — the
 * verbatim message goes to the server log alone.
 */
function publicFailureReason(err: unknown): string {
  if (err instanceof SupabaseError) return "Storage backend unavailable while saving the run.";
  const msg = err instanceof Error ? err.message : String(err);
  if (/NVIDIA_API_KEY|INFERENCE_PROVIDER|ANALYST_PROVIDER|not (set|configured)/i.test(msg)) {
    return "The inference provider is not configured on the server.";
  }
  if (/timeout|timed out|aborted|ECONNRESET|fetch failed/i.test(msg)) {
    return "The run timed out or lost the connection to the inference provider.";
  }
  return "Internal error while running the storm.";
}

/**
 * Minimal concurrency guardrail: one running storm per user. Runs are
 * synchronous and capped by the route's maxDuration, so a 'running' row older
 * than STALE_RUNNING_MS is a crashed invocation and must not lock the user out.
 *
 * TODO(rate-limiting): this is not real rate limiting. Add a per-user/IP
 * token-bucket (e.g. Upstash Redis) in front of storm create, billing quote,
 * and admin wallet-adjust once an infra choice is made — see
 * docs/deployment.md "Security hardening backlog".
 */
const STALE_RUNNING_MS = 3 * 60 * 1000;

async function assertNoActiveRun(gateway: Gateway, userId: string): Promise<void> {
  const recent = await gateway.listUserStorms(userId, 5);
  const now = Date.now();
  const active = recent.find(
    (r) =>
      r.status === "running" &&
      now - new Date(String(r.created_at ?? 0)).getTime() < STALE_RUNNING_MS,
  );
  if (active) {
    throw new HttpError(429, "You already have a storm running. Wait for it to finish before starting another.");
  }
}

/**
 * Price, charge atomically, run the engine synchronously, and persist the run +
 * report + stream events. Refunds the charge if the run fails after charging.
 */
export async function createAndRunStorm(
  gateway: Gateway,
  user: CurrentUser,
  payload: CreateStormPayload,
  cfg: ServerConfig = getConfig(),
): Promise<StormCreateResult> {
  // 0) refuse a second concurrent run for the same user (cost-amplification guardrail).
  await assertNoActiveRun(gateway, user.id);

  // 1) price the run (analyst report always included at create time).
  const rule = await getPricingRule(gateway);
  const quote = quotePrice(rule, payload.persona_count, true);
  const stormId = newStormId();

  // 2) charge atomically — the RPC rejects an over-draw, so this is the balance
  //    check too (no TOCTOU race between check and deduct).
  let balanceAfter: number;
  try {
    balanceAfter = await chargeForStorm(gateway, user.id, quote.total_credits, {
      title: payload.title,
      personaCount: payload.persona_count,
      stormId,
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      const wallet = await gateway.getWallet(user.id);
      throw new HttpError(
        402,
        `Insufficient credits: this run costs ${quote.total_credits} credits but your balance is ${wallet.balance_credits}. Ask an admin for a top-up.`,
      );
    }
    if (err instanceof SupabaseError) throw new HttpError(502, "Billing backend unavailable.");
    throw err;
  }

  // 3) record the run, execute the pipeline, persist results. Refund on any
  //    failure after the charge.
  try {
    await gateway.recordStorm({
      id: stormId,
      user_id: user.id,
      title: payload.title,
      stimulus_type: payload.stimulus_type,
      target_market: payload.target_market,
      product_category: payload.product_category ?? null,
      persona_count: payload.persona_count,
      status: "running",
      price_credits: quote.total_credits,
    });

    const result = await runStorm(
      {
        stormId,
        title: payload.title,
        stimulus: payload.stimulus,
        stimulusType: payload.stimulus_type,
        targetMarket: payload.target_market,
        customSegmentDescription: payload.custom_segment_description ?? null,
        productCategory: payload.product_category ?? null,
        personaCount: payload.persona_count,
        seed: payload.seed ?? null,
      },
      cfg,
    );

    await gateway.updateStorm(stormId, {
      status: "complete",
      completed_at: new Date().toISOString(),
      report_json: result.report,
      reactions_json: { reactions: result.reactions, progress: result.progress },
    });

    return { storm_id: stormId, status: "complete", price_credits: quote.total_credits, wallet_balance_after: balanceAfter };
  } catch (err) {
    console.error(`[personastorm storm] run ${stormId} failed, refunding:`, (err as Error).message);
    try {
      await refundStorm(gateway, user.id, quote.total_credits, stormId, `Refund — storm ${stormId} failed`);
      await gateway.updateStorm(stormId, { status: "failed", error: publicFailureReason(err) });
    } catch (refundErr) {
      console.error(`[personastorm storm] refund after failed run also failed for ${stormId}:`, (refundErr as Error).message);
    }
    throw new HttpError(500, "Could not complete the storm. Your credits have been refunded.");
  }
}

/** A storm row the caller is allowed to see, or a 404 (never leaks existence). */
async function ownedStormRow(gateway: Gateway, stormId: string, user: CurrentUser | null): Promise<Record<string, any>> {
  const row = await gateway.getStorm(stormId);
  if (!row) throw new HttpError(404, `storm '${stormId}' not found`);
  // Public demo runs are readable by anyone (including anonymous visitors). All
  // other rows require an owner (or admin) and never leak existence otherwise.
  if (row.is_demo) return row;
  if (!user || (row.user_id !== user.id && !user.isAdmin)) throw new HttpError(404, `storm '${stormId}' not found`);
  return row;
}

function metaFromRow(row: Record<string, any>): StormMeta {
  const reactions = (row.reactions_json?.reactions as ReactionEvent[] | undefined) ?? [];
  const status = String(row.status ?? "running");
  return {
    storm_id: row.id,
    title: row.title ?? "",
    status,
    stimulus_type: row.stimulus_type ?? "",
    target_market: row.target_market ?? "",
    persona_count: row.persona_count ?? 0,
    completed: status === "complete" ? row.persona_count ?? reactions.length : reactions.length,
    report_ready: Boolean(row.report_json),
    price_credits: row.price_credits ?? 0,
    error: row.error ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

export async function getStormMeta(gateway: Gateway, stormId: string, user: CurrentUser | null): Promise<StormMeta> {
  return metaFromRow(await ownedStormRow(gateway, stormId, user));
}

/** Returns the report, or null while still running (→ 202 at the route layer). */
export async function getStormReport(gateway: Gateway, stormId: string, user: CurrentUser | null): Promise<StormReport | null> {
  const row = await ownedStormRow(gateway, stormId, user);
  if (row.report_json) return row.report_json as StormReport;
  if (row.status === "failed") throw new HttpError(500, row.error ?? "storm failed");
  return null;
}

/** Everything the SSE stream needs to replay a completed run. */
export async function getStreamData(gateway: Gateway, stormId: string, user: CurrentUser | null): Promise<StreamData> {
  const row = await ownedStormRow(gateway, stormId, user);
  const meta = metaFromRow(row);
  const stored = row.reactions_json as { reactions?: ReactionEvent[]; progress?: ProgressEvent } | null;
  const reactions = stored?.reactions ?? [];
  const progress: ProgressEvent =
    stored?.progress ?? {
      status: meta.status,
      completed: reactions.length,
      total: meta.persona_count,
      green: reactions.filter((r) => r.status === "green").length,
      yellow: reactions.filter((r) => r.status === "yellow").length,
      red: reactions.filter((r) => r.status === "red").length,
      avg_max_price: 0,
      avg_market_fit: 0,
      top_objection: "",
      collapse_risk: "low",
      elapsed_ms: 0,
    };
  return { meta, reactions, progress };
}

export async function listUserHistory(gateway: Gateway, userId: string): Promise<Record<string, any>[]> {
  const rows = await gateway.listUserStorms(userId, 50);
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? "",
    status: r.status ?? "running",
    stimulus_type: r.stimulus_type ?? "",
    target_market: r.target_market ?? "",
    persona_count: r.persona_count ?? 0,
    price_credits: r.price_credits ?? 0,
    created_at: r.created_at ?? null,
    completed_at: r.completed_at ?? null,
  }));
}
