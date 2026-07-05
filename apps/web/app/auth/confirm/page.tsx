"use client";

/**
 * Custom email-confirmation landing page (token_hash flow).
 *
 * Supabase can be configured so the confirmation email button points at THIS
 * app instead of the Supabase `/auth/v1/verify` URL:
 *
 *   <a href="{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">
 *
 * `{{ .RedirectTo }}` is the URL we pass as `emailRedirectTo` on signUp, so with
 * NEXT_PUBLIC_SITE_URL set the button lands on the production domain. Here we
 * exchange the one-time `token_hash` for a session with verifyOtp — no secret
 * is exposed (token_hash is single-use and intended for exactly this).
 *
 * Like /auth/callback this is a CLIENT component: the session it establishes is
 * persisted to localStorage by the browser client, which is what the app reads.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { AuthShell } from "@/components/AuthShell";
import { Card } from "@/components/ui";
import { getSupabaseClient } from "@/lib/supabase/client";

// The confirmation email can carry any of these OTP types. Anything else is
// rejected so we never forward an attacker-supplied value into verifyOtp.
const VALID_TYPES: readonly EmailOtpType[] = [
  "email",
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
];

export default function AuthConfirmPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      router.replace("/login?error=auth_not_configured");
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const tokenHash = query.get("token_hash");
    const rawType = query.get("type") ?? "email";
    const type = (VALID_TYPES as readonly string[]).includes(rawType)
      ? (rawType as EmailOtpType)
      : "email";

    // Only honor a same-origin relative path for `next` (never an absolute or
    // protocol-relative URL) so the link can't be turned into an open redirect.
    const rawNext = query.get("next") ?? "/dashboard";
    const next =
      rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
        ? rawNext
        : "/dashboard";

    if (!tokenHash) {
      router.replace("/login?error=invalid_auth_callback");
      return;
    }

    let cancelled = false;
    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
      if (cancelled) return;
      // Recovery links should land on the password form, not the dashboard.
      const target = error
        ? "/login?error=otp_expired"
        : type === "recovery"
          ? "/auth/reset-password"
          : next;
      router.replace(target);
    });

    return () => {
      cancelled = true;
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
        <h1 className="text-lg font-semibold text-storm-100">Confirming your email…</h1>
        <p className="mt-2 text-sm leading-relaxed text-storm-300">
          One moment while we verify your link and sign you in.
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
