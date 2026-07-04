"use client";

import clsx from "clsx";
import { API_CONFIGURED, API_TARGET_LABEL } from "@/lib/api";
import { SUPABASE_CONFIGURED } from "@/lib/supabase/client";

/**
 * Compact health chip for the topbar: green when both the API origin and
 * Supabase are configured, amber otherwise. Purely informational — the real
 * errors surface where a call actually fails.
 */
export function ApiStatusBadge() {
  const ok = API_CONFIGURED && SUPABASE_CONFIGURED;
  const label = !API_CONFIGURED
    ? "API not configured"
    : !SUPABASE_CONFIGURED
      ? "Auth not configured"
      : "Connected";
  return (
    <span
      title={API_CONFIGURED ? `API: ${API_TARGET_LABEL}` : API_TARGET_LABEL}
      className={clsx(
        "hidden items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider sm:inline-flex",
        ok
          ? "border-signal-green/30 bg-signal-green/10 text-signal-green"
          : "border-signal-yellow/40 bg-signal-yellow/10 text-signal-yellow",
      )}
    >
      <span
        className={clsx("h-1.5 w-1.5 rounded-full", ok ? "bg-signal-green" : "bg-signal-yellow")}
      />
      {label}
    </span>
  );
}
