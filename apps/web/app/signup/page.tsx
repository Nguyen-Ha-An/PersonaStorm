"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/feedback";
import { Button, Card, Input, Label } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const { session, loading, configured, signUp } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace("/dashboard");
  }, [loading, session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error, needsConfirmation } = await signUp(email.trim(), password, fullName.trim() || undefined);
    if (error) {
      setError(error);
      setSubmitting(false);
    } else if (needsConfirmation) {
      setConfirm(true);
      setSubmitting(false);
    } else {
      router.replace("/dashboard");
    }
  }

  if (confirm) {
    return (
      <AuthShell>
        <Card className="p-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-accent-success/40 bg-accent-success/10">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-accent-success" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m5 13 4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-storm-100">Check your inbox</h1>
          <p className="mt-2 text-sm leading-relaxed text-storm-300">
            We sent a confirmation link to <span className="text-storm-100">{email}</span>. Check your
            email to confirm your account — the confirmation link will return you to PersonaStorm.
            After confirming, log in to claim your <strong>100 free starter credits</strong>.
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
        <h1 className="text-xl font-semibold tracking-tight text-storm-100">Create your account</h1>
        <p className="mt-1 text-sm text-storm-400">
          Start with <span className="font-semibold text-storm-100">100 free credits</span> — enough
          to run your first storm.
        </p>

        {!configured && (
          <Alert tone="yellow" title="Authentication is not configured" className="mt-5">
            Set <span className="font-mono text-storm-100">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
            <span className="font-mono text-storm-100">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> to enable
            signup.
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="name">Full name (optional)</Label>
            <Input
              id="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ada Lovelace"
            />
          </div>
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
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>

          {error && (
            <Alert tone="red" title="Could not sign up">
              {error}
            </Alert>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={submitting || !configured}>
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-storm-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="rounded font-medium text-accent-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
          >
            Log in
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
}
