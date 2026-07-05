"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/feedback";
import { Button, Card, Input, Label } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { SUPABASE_MISCONFIGURED, SUPABASE_URL_ERROR } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell><Card className="p-7"><p className="text-sm text-storm-400">Loading…</p></Card></AuthShell>}>
      <LoginForm />
    </Suspense>
  );
}

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
  const { session, loading, configured, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in → go straight to the dashboard.
  useEffect(() => {
    if (!loading && session) router.replace(next);
  }, [loading, session, router, next]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email.trim(), password);
    if (error) {
      setError(error);
      setSubmitting(false);
    } else {
      router.replace(next);
    }
  }

  return (
    <AuthShell>
      <Card className="p-7">
        <h1 className="text-xl font-semibold tracking-tight text-storm-100">Welcome back</h1>
        <p className="mt-1 text-sm text-storm-400">Log in to run the wind tunnel.</p>

        {SUPABASE_MISCONFIGURED ? (
          <Alert tone="red" title="Supabase URL is misconfigured" className="mt-5">
            {SUPABASE_URL_ERROR}
            <span className="mt-2 block font-mono text-xs text-storm-300">
              Correct: https://project-ref.supabase.co
              <br />
              Wrong: https://project-ref.supabase.co/rest/v1
            </span>
          </Alert>
        ) : (
          !configured && (
            <Alert tone="yellow" title="Authentication is not configured" className="mt-5">
              Set <span className="font-mono text-storm-100">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
              <span className="font-mono text-storm-100">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> to enable
              login.
            </Alert>
          )
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
            <Label htmlFor="password">Password</Label>
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
            <Alert tone="red" title="Could not sign in">
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
