"use client";

/**
 * Set-a-new-password page — where a password-recovery link lands.
 *
 * The recovery link redirects here with an implicit-flow hash
 * (`#access_token=…&type=recovery`); the browser client's detectSessionInUrl
 * turns that into a short-lived recovery session, after which updateUser() can
 * set the new password. (If the confirm route was used instead, verifyOtp has
 * already established the session before redirecting here.) A stale or reused
 * link arrives as `#error=…&error_code=otp_expired` and we show a recovery path.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/feedback";
import { Button, Card, Input, Label } from "@/components/ui";
import { useAuth } from "@/lib/auth";

type Phase = "checking" | "ready" | "expired";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { session, loading, configured, updatePassword } = useAuth();

  const [phase, setPhase] = useState<Phase>("checking");
  const [hashError, setHashError] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An expired/used recovery link comes back as a hash error rather than a session.
  useEffect(() => {
    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    if (hash.get("error_code") || hash.get("error")) {
      setHashError(true);
      setPhase("expired");
    }
  }, []);

  // A recovery session (from the hash) or an existing session unlocks the form.
  useEffect(() => {
    if (session) setPhase("ready");
  }, [session]);

  // If no session has appeared shortly after the client settled, the link is
  // missing or expired — surface a recovery path instead of a dead form.
  useEffect(() => {
    if (session || hashError || loading) return;
    const timer = setTimeout(() => {
      setPhase((prev) => (prev === "ready" ? prev : "expired"));
    }, 4000);
    return () => clearTimeout(timer);
  }, [session, hashError, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await updatePassword(password);
    if (error) {
      setError(error);
      setSubmitting(false);
    } else {
      router.replace("/dashboard");
    }
  }

  // Without Supabase configured, no recovery session ever arrives — say so
  // directly instead of spinning to a misleading "link expired" after 4s.
  if (!configured) {
    return (
      <AuthShell>
        <Card className="p-7">
          <h1 className="text-xl font-semibold tracking-tight text-storm-100">Set a new password</h1>
          <Alert tone="yellow" title="Authentication is not configured" className="mt-5">
            Set <span className="font-mono text-storm-100">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
            <span className="font-mono text-storm-100">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> to enable
            password reset.
          </Alert>
        </Card>
      </AuthShell>
    );
  }

  if (phase === "expired") {
    return (
      <AuthShell>
        <Card className="p-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-signal-yellow/40 bg-signal-yellow/10">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-signal-yellow" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-storm-100">Reset link expired</h1>
          <p className="mt-2 text-sm leading-relaxed text-storm-300">
            This password-reset link is expired or was already used. Request a fresh one to continue.
          </p>
          <Link href="/forgot-password" className="mt-6 inline-block">
            <Button>Request a new link</Button>
          </Link>
        </Card>
      </AuthShell>
    );
  }

  if (phase === "checking") {
    return (
      <AuthShell>
        <Card className="p-7 text-center">
          <span className="relative mx-auto flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-pulseglow rounded-full bg-signal-cyan opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-signal-cyan" />
          </span>
          <p className="mt-4 text-sm text-storm-300">Verifying your reset link…</p>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Card className="p-7">
        <h1 className="text-xl font-semibold tracking-tight text-storm-100">Set a new password</h1>
        <p className="mt-1 text-sm text-storm-400">Choose a new password for your account.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your new password"
            />
          </div>

          {error && (
            <Alert tone="red" title="Could not update password">
              {error}
            </Alert>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={submitting || !configured}>
            {submitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
}
