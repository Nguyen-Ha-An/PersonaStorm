import "./only";

/**
 * Wallet service — the ONLY place server code mutates a balance. Every call
 * flows through gateway.adjustWallet (→ the atomic, row-locking
 * adjust_wallet_balance RPC on real Supabase). There is no client-side path to
 * change a balance. Mirrors the charge/refund/admin-adjust flows in
 * apps/api/app/routers/{storm,admin}.py.
 */

import type { Gateway } from "./gateway";

export async function chargeForStorm(
  gateway: Gateway,
  userId: string,
  amount: number,
  opts: { title: string; personaCount: number; stormId: string },
): Promise<number> {
  return gateway.adjustWallet(userId, -amount, "storm_charge", {
    description: `Storm run: ${opts.title} (${opts.personaCount} personas)`,
    stormId: opts.stormId,
    actorUserId: userId,
  });
}

export async function refundStorm(
  gateway: Gateway,
  userId: string,
  amount: number,
  stormId: string,
  reason: string,
): Promise<number> {
  return gateway.adjustWallet(userId, amount, "refund", {
    description: reason,
    stormId,
    actorUserId: userId,
  });
}

export async function adminAdjust(
  gateway: Gateway,
  targetUserId: string,
  amount: number,
  reason: string,
  actorUserId: string,
): Promise<number> {
  return gateway.adjustWallet(targetUserId, amount, "admin_adjustment", {
    description: reason,
    actorUserId,
  });
}
