"use client";

import { useEffect } from "react";

/**
 * Safety net for Supabase auth tokens that land on the WRONG path.
 *
 * If a project's Site URL is misconfigured (or an old confirmation email is
 * used), Supabase can redirect to the site root with the implicit-flow tokens
 * in the URL hash — e.g. `https://.../#access_token=...&refresh_token=...` — or
 * with an error hash (`#error=access_denied&error_code=otp_expired`). Mounted in
 * the root layout, this catches that on ANY page and forwards the hash to
 * /auth/callback, which establishes the session and strips the tokens.
 *
 * It only forwards recognizable auth hashes, and never logs the hash contents.
 */
export function AuthHashRedirector() {
  useEffect(() => {
    const hash = window.location.hash || "";

    const looksLikeAuthHash =
      hash.includes("access_token=") ||
      hash.includes("refresh_token=") ||
      hash.includes("error=") ||
      hash.includes("error_code=");

    // Don't loop if we're already on the callback route.
    const onCallback = window.location.pathname.startsWith("/auth/callback");

    if (looksLikeAuthHash && !onCallback) {
      window.location.replace(`/auth/callback${hash}`);
    }
  }, []);

  return null;
}
