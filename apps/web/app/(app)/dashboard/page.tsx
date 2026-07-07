"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { IconStorm } from "@/components/dashboard/icons";
import { Alert } from "@/components/feedback";
import {
  Button,
  Card,
  CardHeader,
  MetricCard,
  SectionHeader,
  Skeleton,
  StatusBadge,
} from "@/components/ui";
import { ActionPanel } from "@/components/ui/ActionPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { PricingSummary } from "@/components/ui/PricingSummary";
import { ApiError, getDashboard } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCredits, formatDate, formatNumberCompact } from "@/lib/format";
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
      header: "Simulation",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-storm-100">{s.title}</p>
          <p className="truncate font-mono text-[11px] text-storm-500">{s.id}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (s) => <StatusPill status={s.status} /> },
    {
      key: "personas",
      header: "Personas",
      align: "right",
      cell: (s) => <span className="text-storm-300">{formatNumberCompact(s.persona_count)}</span>,
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      cell: (s) => <span className="text-storm-300">{formatCredits(s.price_credits)}</span>,
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
      <DashboardShell title="Overview">
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

  return (
    <DashboardShell title="Overview">
      {state.phase === "error" ? (
        // A load error shows ONLY the alert — no skeletons/zeros that would read
        // as "still loading" or as real data.
        <Alert
          tone="red"
          title="Could not load your dashboard"
          actions={
            <button
              onClick={() => load()}
              className="text-xs font-semibold text-accent-primary hover:underline"
            >
              Retry
            </button>
          }
        >
          {state.message}
        </Alert>
      ) : (
        <div className="space-y-8">
          <PageHeader
            eyebrow="Overview"
            title="Good to see you back"
            subtitle="Run a product wind tunnel or review your latest market signals."
          />

          <div className="grid gap-6 lg:grid-cols-3">
            <ActionPanel
              className="lg:col-span-2"
              icon={<IconStorm className="h-5 w-5" />}
              title="Open the wind tunnel"
              description="Push a concept, landing page, or price through a calibrated persona swarm."
              primary={
                <Link href="/storm/new">
                  <Button variant="primary">New Simulation</Button>
                </Link>
              }
              secondary={
                <Link href="/dashboard#history">
                  <Button variant="outline">View Reports</Button>
                </Link>
              }
            />

            <div className="grid grid-cols-1 gap-4">
              {data ? (
                <>
                  <MetricCard
                    label="Simulations run"
                    value={formatNumberCompact(data.stats.storms_run)}
                  />
                  <MetricCard label="Credits spent" value={formatCredits(data.stats.credits_spent)} />
                  <MetricCard
                    label="Available credits"
                    value={formatCredits(data.wallet.balance_credits)}
                  />
                </>
              ) : (
                <>
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </>
              )}
            </div>
          </div>

          <Card>
            <CardHeader title="What a run costs" />
            {data ? (
              <PricingSummary pricing={data.pricing} />
            ) : (
              <div className="space-y-3 p-5">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            )}
          </Card>

          <div id="history" className="scroll-mt-20">
            <SectionHeader
              title="Recent simulations"
              action={
                <Link href="/storm/new">
                  <Button size="sm" variant="outline">
                    New Simulation
                  </Button>
                </Link>
              }
            />

            <div className="mt-4">
              {data === null ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <DataTable
                  columns={columns}
                  rows={data.recent_storms}
                  rowKey={(s) => s.id}
                  onRowClick={(s) => router.push(targetHref(s))}
                  empty={{
                    title: "No simulations yet",
                    message:
                      "Run your first wind tunnel to see market reactions and a full validation report.",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
