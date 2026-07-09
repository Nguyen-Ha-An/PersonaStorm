import "./only";

/**
 * Supabase data-access gateway — port of
 * apps/api/app/services/supabase_gateway.py.
 *
 * Two interchangeable implementations behind one interface:
 *   - HttpGateway     — real Supabase (service role) over PostgREST + the
 *                       adjust_wallet_balance RPC.
 *   - InMemoryGateway — a faithful in-process simulation used as a local-dev
 *                       fallback when Supabase env vars are unset, so the app
 *                       still builds and runs offline (production uses Supabase).
 *
 * The frontend can NEVER mutate a wallet — every billing/ownership write flows
 * through here on the server, and balance changes go exclusively through
 * adjust_wallet_balance (a SECURITY DEFINER RPC only the service role may call).
 */

import { getConfig, supabaseConfigured, type ServerConfig } from "./env";
import { InsufficientCreditsError, SupabaseError } from "./errors";
import { getSupabaseAdmin, type SupabaseAdmin } from "./supabaseAdmin";

export type TxnType = "credit_grant" | "storm_charge" | "refund" | "admin_adjustment";
const TXN_TYPES = new Set<TxnType>(["credit_grant", "storm_charge", "refund", "admin_adjustment"]);

type Row = Record<string, any>;

/** Flat DB shape for a settings write (classic inference + orchestration columns). */
export interface InferenceSettingsRow {
  inference_provider: string;
  analyst_provider: string;
  nvidia_model: string;
  analyst_model: string;
  nvidia_max_tokens: number;
  analyst_max_tokens: number;
  orchestration_enabled?: boolean;
  orchestrator_model?: string;
  worker_model?: string;
  max_physical_workers?: number;
  virtual_agents_per_worker?: number;
  worker_max_tokens?: number;
  orchestrator_max_tokens?: number;
  worker_temperature?: number;
  orchestrator_temperature?: number;
  enable_worker_web_research?: boolean;
  worker_web_research_max_queries?: number;
}

export interface Gateway {
  ensureAndGetProfile(userId: string, email: string, fullName: string | null): Promise<Row>;
  getProfile(userId: string): Promise<Row | null>;
  getWallet(userId: string): Promise<Row>;
  /**
   * Ensure the user's wallet exists, granting `starterCredits` exactly once if
   * (and only if) this call created it. Never lowers an existing balance and
   * never writes a duplicate starter transaction — safe to call on every
   * request. The DB trigger provisions new signups; this repairs users whose
   * rows are missing (predate the trigger, or the trigger failed).
   */
  ensureWalletWithStarter(userId: string, starterCredits: number): Promise<Row>;
  listTransactions(userId: string, limit?: number): Promise<Row[]>;
  adjustWallet(
    userId: string,
    amount: number,
    transactionType: TxnType,
    opts?: { description?: string | null; stormId?: string | null; actorUserId?: string | null },
  ): Promise<number>;
  getActivePricing(): Promise<Row | null>;
  updateActivePricing(input: { base_run_credits: number; credits_per_100_personas: number; analyst_report_credits: number; name: string }): Promise<Row>;
  getActiveInferenceSettings(): Promise<Row | null>;
  updateActiveInferenceSettings(input: InferenceSettingsRow): Promise<Row>;
  recordStorm(row: Row): Promise<void>;
  updateStorm(stormId: string, fields: Row): Promise<void>;
  getStorm(stormId: string): Promise<Row | null>;
  listUserStorms(userId: string, limit?: number): Promise<Row[]>;
  adminListUsers(search?: string | null): Promise<Row[]>;
  adminGetUser(userId: string): Promise<Row | null>;
  setRole(userId: string, role: string): Promise<void>;
  adminListStorms(limit?: number): Promise<Row[]>;
  countAdmins(): Promise<number>;
  /** Total storm_runs owned by a user (for accurate dashboard counts). */
  countUserStorms(userId: string): Promise<number>;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ===========================================================================
// In-memory implementation (local dev / build fallback)
// ===========================================================================
class InMemoryGateway implements Gateway {
  private profiles = new Map<string, Row>();
  private wallets = new Map<string, Row>();
  private transactions: Row[] = [];
  private storms = new Map<string, Row>();
  private pricing: Row = {
    id: cryptoRandom(),
    name: "Default",
    is_active: true,
    base_run_credits: 10,
    credits_per_100_personas: 5,
    analyst_report_credits: 5,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  private inferenceSettings: Row | null = null;

  constructor(private starterCredits = 100) {}

  async ensureAndGetProfile(userId: string, email: string, fullName: string | null): Promise<Row> {
    let prof = this.profiles.get(userId);
    if (!prof) {
      prof = { id: userId, email, full_name: fullName, role: "user", created_at: nowIso(), updated_at: nowIso() };
      this.profiles.set(userId, prof);
      const wallet = {
        id: cryptoRandom(), user_id: userId, balance_credits: this.starterCredits,
        lifetime_spent_credits: 0, created_at: nowIso(), updated_at: nowIso(),
      };
      this.wallets.set(userId, wallet);
      this.transactions.push({
        id: cryptoRandom(), user_id: userId, wallet_id: wallet.id, type: "credit_grant",
        amount_credits: this.starterCredits, balance_after: this.starterCredits,
        description: "Starter credits", storm_id: null, created_by: userId, created_at: nowIso(),
      });
    } else {
      if (email) prof.email = email;
      if (fullName && !prof.full_name) prof.full_name = fullName;
    }
    return { ...prof };
  }

  async getProfile(userId: string): Promise<Row | null> {
    const p = this.profiles.get(userId);
    return p ? { ...p } : null;
  }

  async getWallet(userId: string): Promise<Row> {
    let w = this.wallets.get(userId);
    if (!w) {
      w = { id: cryptoRandom(), user_id: userId, balance_credits: 0, lifetime_spent_credits: 0, created_at: nowIso(), updated_at: nowIso() };
      this.wallets.set(userId, w);
    }
    return { ...w };
  }

  async ensureWalletWithStarter(userId: string, starterCredits: number): Promise<Row> {
    const existing = this.wallets.get(userId);
    if (existing) return { ...existing };
    const wallet = {
      id: cryptoRandom(), user_id: userId,
      balance_credits: Math.max(0, starterCredits), lifetime_spent_credits: 0,
      created_at: nowIso(), updated_at: nowIso(),
    };
    this.wallets.set(userId, wallet);
    if (starterCredits > 0) {
      this.transactions.push({
        id: cryptoRandom(), user_id: userId, wallet_id: wallet.id, type: "credit_grant",
        amount_credits: starterCredits, balance_after: starterCredits,
        description: "Starter credits", storm_id: null, created_by: userId, created_at: nowIso(),
      });
    }
    return { ...wallet };
  }

  async listTransactions(userId: string, limit = 50): Promise<Row[]> {
    const rows = this.transactions.filter((t) => t.user_id === userId);
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return rows.slice(0, limit).map((r) => ({ ...r }));
  }

  async adjustWallet(
    userId: string,
    amount: number,
    transactionType: TxnType,
    opts: { description?: string | null; stormId?: string | null; actorUserId?: string | null } = {},
  ): Promise<number> {
    if (!TXN_TYPES.has(transactionType)) throw new SupabaseError(`invalid transaction_type: ${transactionType}`);
    let wallet = this.wallets.get(userId);
    if (!wallet) {
      wallet = await this.getWallet(userId);
      this.wallets.set(userId, wallet);
    }
    const balance = wallet.balance_credits as number;
    const newBalance = balance + amount;
    if (newBalance < 0) throw new InsufficientCreditsError(balance, -amount);
    wallet.balance_credits = newBalance;
    let spentDelta = 0;
    if (amount < 0) spentDelta = -amount;
    else if (transactionType === "refund") spentDelta = -amount;
    wallet.lifetime_spent_credits = Math.max(0, (wallet.lifetime_spent_credits as number) + spentDelta);
    wallet.updated_at = nowIso();
    this.transactions.push({
      id: cryptoRandom(), user_id: userId, wallet_id: wallet.id, type: transactionType,
      amount_credits: amount, balance_after: newBalance, description: opts.description ?? null,
      storm_id: opts.stormId ?? null, created_by: opts.actorUserId ?? null, created_at: nowIso(),
    });
    return newBalance;
  }

  async getActivePricing(): Promise<Row | null> {
    return { ...this.pricing };
  }

  async updateActivePricing(input: { base_run_credits: number; credits_per_100_personas: number; analyst_report_credits: number; name: string }): Promise<Row> {
    this.pricing = { ...this.pricing, ...input, updated_at: nowIso() };
    return { ...this.pricing };
  }

  async getActiveInferenceSettings(): Promise<Row | null> {
    return this.inferenceSettings ? { ...this.inferenceSettings } : null;
  }

  async updateActiveInferenceSettings(input: InferenceSettingsRow): Promise<Row> {
    const id = this.inferenceSettings?.id ?? cryptoRandom();
    this.inferenceSettings = { ...(this.inferenceSettings ?? {}), id, is_active: true, ...input, updated_at: nowIso() };
    return { ...this.inferenceSettings };
  }

  async recordStorm(row: Row): Promise<void> {
    this.storms.set(row.id, { ...row, created_at: row.created_at ?? nowIso() });
  }

  async updateStorm(stormId: string, fields: Row): Promise<void> {
    const s = this.storms.get(stormId);
    if (s) Object.assign(s, fields);
  }

  async getStorm(stormId: string): Promise<Row | null> {
    const s = this.storms.get(stormId);
    return s ? { ...s } : null;
  }

  async listUserStorms(userId: string, limit = 50): Promise<Row[]> {
    const rows = Array.from(this.storms.values()).filter((s) => s.user_id === userId);
    rows.sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1));
    return rows.slice(0, limit).map((r) => ({ ...r }));
  }

  async adminListUsers(search?: string | null): Promise<Row[]> {
    const out: Row[] = [];
    for (const prof of this.profiles.values()) {
      if (search) {
        const needle = search.toLowerCase();
        const hay = `${prof.email ?? ""} ${prof.full_name ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      out.push(this.userSummary(prof));
    }
    out.sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1));
    return out;
  }

  async adminGetUser(userId: string): Promise<Row | null> {
    const prof = this.profiles.get(userId);
    if (!prof) return null;
    const summary = this.userSummary(prof);
    summary.recent_transactions = await this.listTransactions(userId, 20);
    summary.recent_storms = await this.listUserStorms(userId, 20);
    return summary;
  }

  private userSummary(prof: Row): Row {
    const uid = prof.id;
    const wallet = this.wallets.get(uid);
    const storms = Array.from(this.storms.values()).filter((s) => s.user_id === uid);
    const totalSpent = storms.filter((s) => s.status !== "failed").reduce((sum, s) => sum + (s.price_credits ?? 0), 0);
    return {
      id: uid,
      email: prof.email ?? null,
      full_name: prof.full_name ?? null,
      role: prof.role ?? "user",
      created_at: prof.created_at ?? null,
      balance_credits: wallet ? wallet.balance_credits : 0,
      lifetime_spent_credits: wallet ? wallet.lifetime_spent_credits : 0,
      total_storms: storms.length,
      total_spent_credits: totalSpent,
    };
  }

  async setRole(userId: string, role: string): Promise<void> {
    const p = this.profiles.get(userId);
    if (p) {
      p.role = role;
      p.updated_at = nowIso();
    }
  }

  async adminListStorms(limit = 100): Promise<Row[]> {
    const rows = Array.from(this.storms.values());
    rows.sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1));
    return rows.slice(0, limit).map((s) => ({ ...s, user_email: this.profiles.get(s.user_id)?.email ?? null }));
  }

  async countAdmins(): Promise<number> {
    let n = 0;
    for (const p of this.profiles.values()) if (p.role === "admin") n += 1;
    return n;
  }

  async countUserStorms(userId: string): Promise<number> {
    let n = 0;
    for (const s of this.storms.values()) if (s.user_id === userId) n += 1;
    return n;
  }
}

// ===========================================================================
// HTTP implementation (real Supabase, service role)
// ===========================================================================
class HttpGateway implements Gateway {
  constructor(private admin: SupabaseAdmin) {}

  async ensureAndGetProfile(userId: string, email: string, fullName: string | null): Promise<Row> {
    try {
      await this.admin.mutate("POST", "profiles", {
        params: { on_conflict: "id" },
        json: { id: userId, email, full_name: fullName },
        prefer: "resolution=ignore-duplicates,return=minimal",
      });
    } catch {
      // best-effort self-heal; identity from the JWT is still valid.
    }
    const prof = await this.getProfile(userId);
    return prof ?? { id: userId, email, full_name: fullName, role: "user" };
  }

  async getProfile(userId: string): Promise<Row | null> {
    const rows = await this.admin.get("profiles", { id: `eq.${userId}`, select: "*", limit: "1" });
    return rows[0] ?? null;
  }

  async getWallet(userId: string): Promise<Row> {
    const rows = await this.admin.get("wallets", { user_id: `eq.${userId}`, select: "*", limit: "1" });
    if (rows[0]) return rows[0];
    const created = await this.admin.mutate("POST", "wallets", {
      params: { on_conflict: "user_id" },
      json: { user_id: userId, balance_credits: 0 },
      prefer: "resolution=ignore-duplicates,return=representation",
    });
    if (created[0]) return created[0];
    const again = await this.admin.get("wallets", { user_id: `eq.${userId}`, select: "*", limit: "1" });
    return again[0] ?? { user_id: userId, balance_credits: 0, lifetime_spent_credits: 0 };
  }

  async ensureWalletWithStarter(userId: string, starterCredits: number): Promise<Row> {
    // Fast path: an existing wallet is returned untouched (never lower a balance).
    const existing = await this.admin.get("wallets", { user_id: `eq.${userId}`, select: "*", limit: "1" });
    if (existing[0]) return existing[0];

    // Attempt to create the wallet. ignore-duplicates means a concurrent request
    // that already created it yields an empty result — only the creator grants
    // the starter credits, so the grant (and its audit row) happens exactly once.
    const created = await this.admin.mutate("POST", "wallets", {
      params: { on_conflict: "user_id" },
      json: { user_id: userId, balance_credits: 0 },
      prefer: "resolution=ignore-duplicates,return=representation",
    });

    if (created[0] && starterCredits > 0) {
      // adjust_wallet_balance is atomic + writes the credit_grant audit row.
      await this.adjustWallet(userId, starterCredits, "credit_grant", {
        description: "Starter credits",
        actorUserId: userId,
      });
    }

    const row = await this.admin.get("wallets", { user_id: `eq.${userId}`, select: "*", limit: "1" });
    return row[0] ?? { user_id: userId, balance_credits: 0, lifetime_spent_credits: 0 };
  }

  async listTransactions(userId: string, limit = 50): Promise<Row[]> {
    return this.admin.get("wallet_transactions", {
      user_id: `eq.${userId}`, select: "*", order: "created_at.desc", limit: String(limit),
    });
  }

  async adjustWallet(
    userId: string,
    amount: number,
    transactionType: TxnType,
    opts: { description?: string | null; stormId?: string | null; actorUserId?: string | null } = {},
  ): Promise<number> {
    const resp = await this.admin.rpc("adjust_wallet_balance", {
      target_user_id: userId,
      amount,
      transaction_type: transactionType,
      description: opts.description ?? null,
      storm_id: opts.stormId ?? null,
      actor_user_id: opts.actorUserId ?? null,
    });
    if (resp.status >= 300) {
      const body = await resp.text();
      if (body.includes("insufficient_credits")) {
        throw new InsufficientCreditsError(-1, amount < 0 ? -amount : amount);
      }
      throw new SupabaseError(`adjust_wallet_balance -> ${resp.status}: ${body}`);
    }
    return Number(await resp.json());
  }

  async getActivePricing(): Promise<Row | null> {
    const rows = await this.admin.get("pricing_rules", { is_active: "eq.true", select: "*", order: "created_at.desc", limit: "1" });
    return rows[0] ?? null;
  }

  async updateActivePricing(input: { base_run_credits: number; credits_per_100_personas: number; analyst_report_credits: number; name: string }): Promise<Row> {
    const current = await this.getActivePricing();
    if (current) {
      const rows = await this.admin.mutate("PATCH", "pricing_rules", { params: { id: `eq.${current.id}` }, json: input });
      return rows[0] ?? { ...input, is_active: true };
    }
    const rows = await this.admin.mutate("POST", "pricing_rules", { json: { ...input, is_active: true } });
    return rows[0] ?? { ...input, is_active: true };
  }

  async getActiveInferenceSettings(): Promise<Row | null> {
    const rows = await this.admin.get("inference_settings", { is_active: "eq.true", select: "*", order: "updated_at.desc", limit: "1" });
    return rows[0] ?? null;
  }

  async updateActiveInferenceSettings(input: InferenceSettingsRow): Promise<Row> {
    const current = await this.getActiveInferenceSettings();
    if (current) {
      const rows = await this.admin.mutate("PATCH", "inference_settings", { params: { id: `eq.${current.id}` }, json: input });
      return rows[0] ?? { ...input, is_active: true };
    }
    const rows = await this.admin.mutate("POST", "inference_settings", { json: { ...input, is_active: true } });
    return rows[0] ?? { ...input, is_active: true };
  }

  async recordStorm(row: Row): Promise<void> {
    await this.admin.mutate("POST", "storm_runs", { json: row, prefer: "return=minimal" });
  }

  async updateStorm(stormId: string, fields: Row): Promise<void> {
    await this.admin.mutate("PATCH", "storm_runs", { params: { id: `eq.${stormId}` }, json: fields, prefer: "return=minimal" });
  }

  async getStorm(stormId: string): Promise<Row | null> {
    const rows = await this.admin.get("storm_runs", { id: `eq.${stormId}`, select: "*", limit: "1" });
    return rows[0] ?? null;
  }

  async listUserStorms(userId: string, limit = 50): Promise<Row[]> {
    return this.admin.get("storm_runs", { user_id: `eq.${userId}`, select: "*", order: "created_at.desc", limit: String(limit) });
  }

  async adminListUsers(search?: string | null): Promise<Row[]> {
    const profiles = await this.admin.get("profiles", { select: "*", order: "created_at.desc" });
    const wallets = await this.admin.get("wallets", { select: "user_id,balance_credits,lifetime_spent_credits" });
    const storms = await this.admin.get("storm_runs", { select: "user_id,price_credits,status" });
    const walletByUser = new Map(wallets.map((w) => [w.user_id, w]));
    const stormsByUser = new Map<string, Row[]>();
    for (const s of storms) {
      if (!stormsByUser.has(s.user_id)) stormsByUser.set(s.user_id, []);
      stormsByUser.get(s.user_id)!.push(s);
    }

    const out: Row[] = [];
    for (const prof of profiles) {
      if (search) {
        const needle = search.toLowerCase();
        const hay = `${prof.email ?? ""} ${prof.full_name ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      const uid = prof.id;
      const w = walletByUser.get(uid) ?? {};
      const userStorms = stormsByUser.get(uid) ?? [];
      out.push({
        id: uid,
        email: prof.email ?? null,
        full_name: prof.full_name ?? null,
        role: prof.role ?? "user",
        created_at: prof.created_at ?? null,
        balance_credits: w.balance_credits ?? 0,
        lifetime_spent_credits: w.lifetime_spent_credits ?? 0,
        total_storms: userStorms.length,
        total_spent_credits: userStorms.filter((s) => s.status !== "failed").reduce((sum, s) => sum + (s.price_credits ?? 0), 0),
      });
    }
    return out;
  }

  async adminGetUser(userId: string): Promise<Row | null> {
    const users = await this.adminListUsers();
    const summary = users.find((u) => u.id === userId);
    if (!summary) return null;
    summary.recent_transactions = await this.listTransactions(userId, 20);
    summary.recent_storms = await this.listUserStorms(userId, 20);
    return summary;
  }

  async setRole(userId: string, role: string): Promise<void> {
    await this.admin.mutate("PATCH", "profiles", { params: { id: `eq.${userId}` }, json: { role }, prefer: "return=minimal" });
  }

  async adminListStorms(limit = 100): Promise<Row[]> {
    const storms = await this.admin.get("storm_runs", { select: "*", order: "created_at.desc", limit: String(limit) });
    if (storms.length === 0) return [];
    const userIds = Array.from(new Set(storms.map((s) => s.user_id))).sort();
    const profiles = await this.admin.get("profiles", { id: `in.(${userIds.join(",")})`, select: "id,email" });
    const emailById = new Map(profiles.map((p) => [p.id, p.email]));
    for (const s of storms) s.user_email = emailById.get(s.user_id) ?? null;
    return storms;
  }

  async countAdmins(): Promise<number> {
    const resp = await this.admin.getWithHeaders("profiles", { role: "eq.admin", select: "id" }, { Prefer: "count=exact" });
    if (resp.status >= 300) throw new SupabaseError(`count_admins -> ${resp.status}`);
    return parseExactCount(resp, await resp.clone().json().catch(() => []));
  }

  async countUserStorms(userId: string): Promise<number> {
    const resp = await this.admin.getWithHeaders(
      "storm_runs",
      { user_id: `eq.${userId}`, select: "id" },
      { Prefer: "count=exact" },
    );
    if (resp.status >= 300) throw new SupabaseError(`count_user_storms -> ${resp.status}`);
    return parseExactCount(resp, await resp.clone().json().catch(() => []));
  }
}

/** Extract the total row count from a PostgREST `count=exact` response. */
function parseExactCount(resp: Response, fallbackRows: any[]): number {
  const contentRange = resp.headers.get("content-range") ?? "";
  if (contentRange.includes("/")) {
    const total = Number(contentRange.split("/").pop());
    if (Number.isFinite(total)) return total;
  }
  return Array.isArray(fallbackRows) ? fallbackRows.length : 0;
}

// A single in-memory gateway persists for the life of the (dev) server process.
let inMemorySingleton: InMemoryGateway | null = null;

export function buildGateway(cfg: ServerConfig = getConfig()): Gateway {
  if (supabaseConfigured(cfg)) {
    const admin = getSupabaseAdmin(cfg);
    if (admin) return new HttpGateway(admin);
  }
  if (!inMemorySingleton) inMemorySingleton = new InMemoryGateway(cfg.starterCredits);
  return inMemorySingleton;
}

function cryptoRandom(): string {
  // Prefer crypto.randomUUID (Node 19+/edge); fall back to a manual v4-ish id.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    // deterministic-enough for in-memory dev ids; not used in production.
    const r = Math.floor((Date.now() + performance.now()) % 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
