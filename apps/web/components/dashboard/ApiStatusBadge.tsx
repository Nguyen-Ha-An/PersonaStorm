"use client";

import clsx from "clsx";
import { useAuth } from "@/lib/auth";

/**
 * Compact connectivity chip for the topbar. It reflects the REAL, server-
 * verified session status (from /api/me via AuthProvider) — NOT an
 * unauthenticated liveness probe. This is deliberate: a public health check
 * would show "Connected" even when the server is rejecting the user's token,
 * which is exactly the misleading "CONNECTED + session expired" state we fixed.
 */
export function ApiStatusBadge() {
  const { configured, meStatus } = useAuth();

  const ok = configured && meStatus === "ok";
  const label = !configured
    ? "Auth not configured"
    : meStatus === "ok"
      ? "Connected"
      : meStatus === "expired"
        ? "Session expired"
        : meStatus === "error"
          ? "API unreachable"
          : "Checking…";

  return (
    <span
      className={clsx(
        "hidden items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider sm:inline-flex",
        ok
          ? "border-signal-green/30 bg-signal-green/10 text-signal-green"
          : "border-signal-yellow/40 bg-signal-yellow/10 text-signal-yellow",
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", ok ? "bg-signal-green" : "bg-signal-yellow")} />
      {label}
    </span>
  );
}
