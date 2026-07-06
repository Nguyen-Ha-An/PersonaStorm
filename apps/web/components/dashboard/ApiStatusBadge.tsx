"use client";

import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/ui";

/**
 * Compact connectivity indicator for the topbar. It reflects the REAL, server-
 * verified session status (from /api/me via AuthProvider) — NOT an
 * unauthenticated liveness probe. This is deliberate: a public health check
 * would show "Connected" even when the server is rejecting the user's token,
 * which is exactly the misleading "CONNECTED + session expired" state we fixed.
 *
 * Visual policy: quiet by default. A healthy connection renders a tiny neutral
 * dot (or nothing) rather than a loud always-on pill; only genuine problems
 * (misconfiguration, expired session, unreachable API) surface a visible badge.
 */
export function ApiStatusBadge() {
  const { configured, meStatus } = useAuth();

  if (!configured) {
    return (
      <StatusBadge tone="yellow" className="hidden sm:inline-flex">
        Auth not configured
      </StatusBadge>
    );
  }

  if (meStatus === "expired") {
    return (
      <StatusBadge tone="yellow" className="hidden sm:inline-flex">
        Session expired
      </StatusBadge>
    );
  }

  if (meStatus === "error") {
    return (
      <StatusBadge tone="red" className="hidden sm:inline-flex">
        API unreachable
      </StatusBadge>
    );
  }

  if (meStatus === "ok") {
    return (
      <span
        role="status"
        aria-label="Connected"
        className="hidden h-1.5 w-1.5 rounded-full bg-signal-green sm:inline-block"
      />
    );
  }

  // idle / loading: no LED while we're still checking.
  return null;
}
