"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/feedback";
import { Button, Card, Input, Label } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell><Card className="p-7"><p className="text-sm text-storm-400">Loading…</p></Card></AuthShell>}>
      <LoginForm />
    </Suspense>
  );
}

// Human-readable messages for the `?error=` codes the auth callback / confirm
// routes (and the app guard) redirect here with. Unknown codes fall back to a
// generic message. Messages never contain tokens or callback URLs.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  otp_expired:
    "This email link is expired or was already used. Please request a new confirmation email.",
  access_denied:
    "This email link is expired or was already used. Please request a new confirmation email.",
  invalid_auth_callback:
    "We could not complete authentication. Please try signing in again.",
  email_not_confirmed:
    "Your email isn’t confirmed yet. Check your inbox, or request a new confirmation email below.",
  invalid_credentials:
    "That email or password is incorrect. Please try again.",
  auth_redirect_localhost:
    "Auth redirect is misconfigured. Production must use https://personastorm.nguyenhaan.id.vn, not localhost.",
  session_expired:
    "Your session has expired. Please log in again.",
  auth_not_configured:
    "Authentication is not configured yet. Set the Supabase environment variables to enable login.",
};

function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? "That sign-in link could not be used. Please log in below.";
}

// Codes for which offering "resend confirmation email" makes sense.
const RESENDABLE_CODES = new Set([
  "otp_expired",
  "access_denied",
  "invalid_auth_callback",
  "email_not_confirmed",
]);

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Only honor a same-origin path — never an absolute/protocol-relative URL —
  // so `?next=https://evil.com` (or `//evil.com`, `/\evil.com`) can't turn the
  // post-login redirect into an open redirect.
  const rawNext = params?.get("next") ?? "";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
      ? rawNext
      : "/dashboard";
  const errorCode = params?.get("error");
  const linkError = authErrorMessage(errorCode);
  const { session, loading, configured, signIn, signOut, resendConfirmation } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  // A session that the server rejected lands here as ?error=session_expired with
  // the dead client session still present — clear it so we don't bounce back to
  // the dashboard, and so the message can actually be read.
  useEffect(() => {
    if (errorCode === "session_expired" && session) {
      signOut();
    }
  }, [errorCode, session, signOut]);

  // Already signed in → go straight to the dashboard (but not while we're
  // clearing a rejected session for the session_expired message).
  useEffect(() => {
    if (!loading && session && errorCode !== "session_expired") router.replace(next);
  }, [loading, session, router, next, errorCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setShowResend(false);
    const { error } = await signIn(email.trim(), password);
    if (error) {
      // Map Supabase's raw messages to friendly, code-consistent copy.
      if (/email not confirmed/i.test(error)) {
        setError(AUTH_ERROR_MESSAGES.email_not_confirmed);
        setShowResend(true);
      } else if (/invalid login credentials/i.test(error)) {
        setError(AUTH_ERROR_MESSAGES.invalid_credentials);
      } else {
        setError(error);
      }
      setSubmitting(false);
    } else {
      router.replace(next);
    }
  }

  async function handleResend() {
    if (!email.trim()) {
      setError("Enter your email above, then resend the confirmation link.");
      return;
    }
    setResendState("sending");
    setError(null);
    const { error, sent } = await resendConfirmation(email.trim());
    if (error) {
      setError(error);
      setResendState("idle");
    } else if (sent) {
      setResendState("sent");
    }
  }

  const canResend = showResend || (errorCode ? RESENDABLE_CODES.has(errorCode) : false);

  const resendButton =
    resendState === "sent" ? (
      <span className="text-xs font-semibold text-signal-green">Confirmation email sent</span>
    ) : (
      <button
        type="button"
        onClick={handleResend}
        disabled={resendState === "sending" || !configured}
        className="text-xs font-semibold text-signal-cyan hover:underline disabled:opacity-50"
      >
        {resendState === "sending" ? "Sending…" : "Resend confirmation email"}
      </button>
    );

  return (
    <AuthShell>
      <Card className="p-7">
        <h1 className="text-xl font-semibold tracking-tight text-storm-100">Welcome back</h1>
        <p className="mt-1 text-sm text-storm-400">Log in to run the wind tunnel.</p>

        {!configured && (
          <Alert tone="yellow" title="Authentication is not configured" className="mt-5">
            Set <span className="font-mono text-storm-100">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
            <span className="font-mono text-storm-100">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> to enable
            login.
          </Alert>
        )}

        {linkError && (
          <Alert
            tone={errorCode === "auth_redirect_localhost" ? "red" : "yellow"}
            title={errorCode === "session_expired" ? "Session expired" : "Email link issue"}
            className="mt-5"
            actions={canResend ? resendButton : undefined}
          >
            {linkError}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="mb-1.5 text-xs font-medium text-signal-cyan hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <Alert tone="red" title="Could not sign in" actions={showResend ? resendButton : undefined}>
              {error}
            </Alert>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={submitting || !configured}>
            {submitting ? "Signing in…" : "Log in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-storm-400">
          New to PersonaStorm?{" "}
          <Link href="/signup" className="font-medium text-signal-cyan hover:underline">
            Create an account
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
}
