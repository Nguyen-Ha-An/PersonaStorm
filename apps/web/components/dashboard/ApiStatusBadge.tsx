"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { checkBackendHealth, type BackendHealth } from "@/lib/api";
import { SUPABASE_CONFIGURED } from "@/lib/supabase/client";

/**
 * Compact health chip for the topbar. Probes the same-origin PersonaStorm
 * server API (`/api/health`) once on mount. Purely informational — the real
 * errors surface where an action actually fails.
 */
export function ApiStatusBadge() {
  const [backend, setBackend] = useState<BackendHealth | "checking">("checking");

  useEffect(() => {
    let cancelled = false;
    checkBackendHealth().then((h) => {
      if (!cancelled) setBackend(h);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ok = backend === "ok" && SUPABASE_CONFIGURED;
  const label = !SUPABASE_CONFIGURED
    ? "Auth not configured"
    : backend === "checking"
      ? "Checking…"
      : backend === "ok"
        ? "Connected"
        : "API unreachable";

  return (
    <span
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
