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
    const finish = (path: string) => {
      if (settled) return;
      settled = true;
      router.replace(path);
    };

    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);

    // 1. Errors arrive in the hash (implicit flow) or query string. Route the
    //    user to /login with the specific code so we can show a helpful message.
    const errorCode =
      hash.get("error_code") ||
      hash.get("error") ||
      query.get("error_code") ||
      query.get("error");
    if (errorCode) {
      finish(`/login?error=${encodeURIComponent(errorCode)}`);
      return;
    }

    const code = query.get("code");

    async function run() {
      // 2. PKCE / OAuth: exchange the authorization code for a session.
      if (code) {
        const { error } = await supabase!.auth.exchangeCodeForSession(code);
        finish(error ? "/login?error=invalid_auth_callback" : "/dashboard");
        return;
      }
      // 3/4. Implicit flow or an existing session: detectSessionInUrl parses the
      //      hash asynchronously, so a session may already exist or be arriving.
      const { data } = await supabase!.auth.getSession();
      if (data.session) finish("/dashboard");
    }

    // Catch the session the moment detectSessionInUrl finishes parsing the hash.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish("/dashboard");
    });

    run();

    // 5. Fallback: if nothing resolved after a beat, there is no usable session.
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      finish(data.session ? "/dashboard" : "/login?error=invalid_auth_callback");
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
