"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/feedback";
import { Button, Card, Input, Label } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const { configured, sendPasswordReset } = useAuth();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await sendPasswordReset(email.trim());
    setSubmitting(false);
    if (error) {
      setError(error);
    } else {
      // Always show the same confirmation whether or not the address exists, so
      // this page never reveals which emails are registered.
      setSent(true);
    }
  }

  if (sent) {
    return (
      <AuthShell>
        <Card className="p-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-signal-green/40 bg-signal-green/10">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-signal-green" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m5 13 4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-storm-100">Check your inbox</h1>
          <p className="mt-2 text-sm leading-relaxed text-storm-300">
            If an account exists for <span className="text-storm-100">{email}</span>, we sent a
            password-reset link. It will return you to PersonaStorm to set a new password.
          </p>
          <Link href="/login" className="mt-6 inline-block">
            <Button variant="outline">Back to login</Button>
          </Link>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Card className="p-7">
        <h1 className="text-xl font-semibold tracking-tight text-storm-100">Reset your password</h1>
        <p className="mt-1 text-sm text-storm-400">
          Enter your email and we&rsquo;ll send you a link to set a new password.
        </p>

        {!configured && (
          <Alert tone="yellow" title="Authentication is not configured" className="mt-5">
            Set <span className="font-mono text-storm-100">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
            <span className="font-mono text-storm-100">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> to enable
            password reset.
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

          {error && (
            <Alert tone="red" title="Could not send reset email">
              {error}
            </Alert>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={submitting || !configured}>
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-storm-400">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-signal-cyan hover:underline">
            Back to login
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
}
