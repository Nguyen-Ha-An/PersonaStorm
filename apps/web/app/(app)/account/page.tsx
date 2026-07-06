"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Button, Card, CardHeader, LevelBadge, MetricCard } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/lib/auth";
import { formatCredits, formatDate } from "@/lib/format";

function initials(email: string, name?: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default function AccountPage() {
  const { me, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <DashboardShell title="Account">
      <div className="space-y-8">
        <PageHeader title="Account" subtitle="Manage your profile and session." />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader title="Profile" />
            <div className="flex flex-wrap items-center gap-4 p-5">
              <span
                aria-hidden
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-primary/15 text-lg font-semibold text-accent-primary"
              >
                {initials(me?.email ?? "?", me?.full_name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-storm-100">
                  {me?.full_name || "—"}
                </p>
                <p className="truncate text-sm text-storm-400">{me?.email ?? "—"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <LevelBadge level={me?.role ?? "user"} />
                  <span className="text-xs text-storm-400">
                    Member since {formatDate(me?.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Credits"
              action={
                <Link
                  href="/wallet"
                  className="rounded text-xs font-medium text-storm-300 hover:text-storm-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
                >
                  Manage credits
                </Link>
              }
            />
            <div className="grid grid-cols-2 gap-3 p-5">
              <MetricCard label="Available" value={formatCredits(me?.wallet.balance_credits ?? 0)} />
              <MetricCard
                label="Lifetime spent"
                value={formatCredits(me?.wallet.lifetime_spent_credits ?? 0)}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Session" />
            <div className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="text-sm font-medium text-storm-100">Sign out</p>
                <p className="mt-1 text-xs text-storm-400">End your session on this device.</p>
              </div>
              <Button variant="outline" onClick={handleSignOut}>
                Log out
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
