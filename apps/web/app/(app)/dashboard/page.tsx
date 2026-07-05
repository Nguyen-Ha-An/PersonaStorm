"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { WalletBalanceCard } from "@/components/dashboard/WalletBalanceCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Alert } from "@/components/feedback";
import { Button, Card, CardHeader, MetricCard, Skeleton, StatusBadge } from "@/components/ui";
import { ApiError, getDashboard } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { DashboardData, StormHistoryItem } from "@/lib/types";

function StatusPill({ status }: { status: string }) {
  const tone = status === "complete" ? "green" : status === "failed" ? "red" : "cyan";
  return (
    <StatusBadge tone={tone} pulse={status === "running"}>
      {status}
    </StatusBadge>
  );
}

function targetHref(s: StormHistoryItem): string {
  return s.status === "complete" ? `/storm/${s.id}/report` : `/storm/${s.id}`;
}

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; data: DashboardData }
  | { phase: "auth" }
  | { phase: "error"; message: string };

export default function DashboardPage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  const load = useCallback((signal?: { cancelled: boolean }) => {
    setState({ phase: "loading" });
    getDashboard()
      .then((data) => {
        if (signal?.cancelled) return;
        setState({ phase: "ready", data });
      })
      .catch((e) => {
        if (signal?.cancelled) return;
        // A real auth rejection is NOT rendered as "connected + zeros" — it's a
        // dedicated session-expired state. Everything else is a load error.
        if (e instanceof ApiError && e.kind === "auth") {
          setState({ phase: "auth" });
        } else {
          setState({
            phase: "error",
            message: e instanceof Error ? e.message : "Could not load your dashboard.",
          });
        }
      });
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const columns: Column<StormHistoryItem>[] = [
    {
      key: "title",
      header: "Storm",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-storm-100">{s.title}</p>
          <p className="truncate font-mono text-[11px] text-storm-500">{s.id}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (s) => <StatusPill status={s.status} /> },
    {
      key: "personas",
      header: "Personas",
      align: "right",
      cell: (s) => <span className="font-mono">{s.persona_count.toLocaleString()}</span>,
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      cell: (s) => <span className="font-mono text-storm-300">{s.price_credits}</span>,
    },
    {
      key: "date",
      header: "Created",
      align: "right",
      cell: (s) => <span className="text-storm-400">{formatDate(s.created_at)}</span>,
    },
  ];

  // --- Session expired: never show CONNECTED or fake data. Offer a clean relogin.
  if (state.phase === "auth") {
    return (
      <DashboardShell title="Dashboard">
        <Card className="mx-auto max-w-lg p-7 text-center">
          <h1 className="text-lg font-semibold text-storm-100">Your session has expired</h1>
          <p className="mt-2 text-sm leading-relaxed text-storm-300">
            Please log in again to load your dashboard.
          </p>
          <Button
            className="mt-6"
            onClick={async () => {
              await signOut();
              router.replace("/login?error=session_expired");
            }}
          >
            Log in again
          </Button>
        </Card>
      </DashboardShell>
    );
  }

  const data = state.phase === "ready" ? state.data : null;
  const welcome = data ? data.user.full_name || data.user.email : undefined;

  return (
    <DashboardShell
      title="Dashboard"
      subtitle={welcome ? `Welcome back, ${welcome}` : undefined}
      actions={
        <Link href="/storm/new" className="hidden sm:block">
          <Button size="sm">New Storm</Button>
        </Link>
      }
    >
      {state.phase === "error" ? (
        // A load error shows ONLY the alert — no skeletons/zeros that would read
        // as "still loading" or as real data.
        <Alert
          tone="red"
          title="Could not load your dashboard"
          actions={
            <button
              onClick={() => load()}
              className="text-xs font-semibold text-signal-cyan hover:underline"
            >
              Retry
            </button>
          }
        >
          {state.message}
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {data ? (
                <WalletBalanceCard
                  balance={data.wallet.balance_credits}
                  lifetimeSpent={data.wallet.lifetime_spent_credits}
                />
              ) : (
                <Skeleton className="h-32 w-full" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
              <MetricCard label="Storms run" value={data ? data.stats.storms_run : "—"} tone="cyan" />
              <MetricCard
                label="Credits spent"
                value={data ? data.stats.credits_spent.toLocaleString() : "—"}
              />
            </div>
          </div>

          {/* current pricing */}
          <Card className="mt-4">
            <CardHeader title="Current pricing" hint="credits per run" />
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl bg-storm-800 sm:grid-cols-4">
              {[
                ["Base run", data?.pricing.base_run_credits],
                ["Per 100 personas", data?.pricing.credits_per_100_personas],
                ["Analyst report", data?.pricing.analyst_report_credits],
                ["1,000-persona run", data?.pricing.thousand_persona_run],
              ].map(([label, val]) => (
                <div key={label as string} className="bg-storm-900 px-4 py-4">
                  <p className="text-[10px] uppercase tracking-wider text-storm-400">{label}</p>
                  <p className="mt-1 font-mono text-xl font-bold text-storm-100">
                    {val === undefined || val === null ? "—" : (val as number).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          {/* recent reports */}
          <div id="history" className="mt-8 scroll-mt-20">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-storm-200">
                Recent storms
              </h2>
              <Link href="/storm/new">
                <Button size="sm" variant="outline">
                  + New Storm
                </Button>
              </Link>
            </div>

            {data === null ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <DataTable
                columns={columns}
                rows={data.recent_storms}
                rowKey={(s) => s.id}
                onRowClick={(s) => router.push(targetHref(s))}
                empty={{
                  title: "No storms yet",
                  message: "Run your first storm to see market reactions and a full evaluation report.",
                }}
              />
            )}
          </div>
        </>
      )}
    </DashboardShell>
  );
}
