"use client";

/**
 * Auth callback landing page.
 *
 * This is a CLIENT component (not a server route.ts) on purpose: PersonaStorm
 * uses the browser Supabase client with localStorage-persisted sessions (see
 * lib/supabase/client.ts), not @supabase/ssr cookies. The PKCE code verifier
 * and the resulting session live in the browser, so the exchange must run here —
 * a server route could never see the verifier or hand the session to the client.
 *
 * It resolves every shape Supabase can redirect back with and never leaves the
 * user stuck on a blank page:
 *   1. Hash / query ERROR    (#error=access_denied&error_code=otp_expired…) → /login?error=<code>
 *   2. PKCE / OAuth ?code=…   → exchangeCodeForSession → /dashboard
 *   3. Implicit #access_token (detectSessionInUrl establishes the session) → /dashboard
 *   4. An already-valid session → /dashboard
 *   5. Nothing usable → /login?error=invalid_auth_callback
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Card } from "@/components/ui";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      router.replace("/login?error=auth_not_configured");
      return;
    }

    let settled = false;

    // Remove auth tokens/params from the URL bar so #access_token / ?code never
    // linger in history, get bookmarked, or leak via the Referer header.
    const scrubUrl = () => {
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch {
        /* non-fatal — the redirect below changes the URL anyway */
      }
    };

    const finish = (path: string) => {
      if (settled) return;
      settled = true;
      scrubUrl();
      router.replace(path);
    };

    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);

    // 1. Errors arrive in the hash (implicit flow) or query string. Normalize
    //    expired/used links to `otp_expired`; route everything else through.
    const rawError =
      hash.get("error_code") ||
      hash.get("error") ||
      query.get("error_code") ||
      query.get("error");
    if (rawError) {
      const code =
        rawError === "access_denied" || rawError === "otp_expired"
          ? "otp_expired"
          : rawError;
      finish(`/login?error=${encodeURIComponent(code)}`);
      return;
    }

    const code = query.get("code");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const isRecovery = hash.get("type") === "recovery";
    const successTarget = isRecovery ? "/auth/reset-password" : "/dashboard";

    async function run() {
      // 2. PKCE / OAuth: exchange the authorization code for a session.
      if (code) {
        const { error } = await supabase!.auth.exchangeCodeForSession(code);
        finish(error ? "/login?error=invalid_auth_callback" : successTarget);
        return;
      }

      // 3. Implicit flow: establish the session EXPLICITLY from the hash tokens
      //    (don't rely solely on detectSessionInUrl), then scrub them.
      if (accessToken && refreshToken) {
        const { error } = await supabase!.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        finish(error ? "/login?error=invalid_auth_callback" : successTarget);
        return;
      }

      // 4. An already-valid session (e.g. detectSessionInUrl parsed the hash).
      const { data } = await supabase!.auth.getSession();
      if (data.session) finish(successTarget);
    }

    // Catch the session the moment detectSessionInUrl finishes parsing the hash.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(successTarget);
    });

    run();

    // 5. Fallback: if nothing resolved after a beat, there is no usable session.
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      finish(data.session ? successTarget : "/login?error=invalid_auth_callback");
    }, 4000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <AuthShell>
      <Card className="p-7 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-pulseglow rounded-full bg-signal-cyan opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-signal-cyan" />
          </span>
        </div>
        <h1 className="text-lg font-semibold text-storm-100">Completing sign-in…</h1>
        <p className="mt-2 text-sm leading-relaxed text-storm-300">
          Verifying your link and returning you to PersonaStorm.
        </p>
        <p className="mt-4 text-xs text-storm-400">
          Stuck here?{" "}
          <Link href="/login" className="font-medium text-signal-cyan hover:underline">
            Go to login
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
}
