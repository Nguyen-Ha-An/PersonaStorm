"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { WalletBalanceCard } from "@/components/dashboard/WalletBalanceCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Alert } from "@/components/feedback";
import { Button, Card, CardHeader, MetricCard, Skeleton, StatusBadge } from "@/components/ui";
import { getPricing, getStormHistory } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { Pricing, StormHistoryItem } from "@/lib/types";

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

export default function DashboardPage() {
  const { me } = useAuth();
  const router = useRouter();
  const [history, setHistory] = useState<StormHistoryItem[] | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getStormHistory(), getPricing()])
      .then(([h, p]) => {
        if (cancelled) return;
        setHistory(h);
        setPricing(p);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load."));
    return () => {
      cancelled = true;
    };
  }, []);

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

  const totalStorms = history?.length ?? 0;

  return (
    <DashboardShell
      title="Dashboard"
      subtitle={me ? `Welcome back, ${me.full_name || me.email}` : undefined}
      actions={
        <Link href="/storm/new" className="hidden sm:block">
          <Button size="sm">New Storm</Button>
        </Link>
      }
    >
      {error && (
        <Alert tone="red" title="Could not load your dashboard" className="mb-6">
          {error}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WalletBalanceCard
            balance={me?.wallet.balance_credits ?? 0}
            lifetimeSpent={me?.wallet.lifetime_spent_credits ?? 0}
          />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <MetricCard label="Storms run" value={totalStorms} tone="cyan" />
          <MetricCard
            label="Credits spent"
            value={(me?.wallet.lifetime_spent_credits ?? 0).toLocaleString()}
          />
        </div>
      </div>

      {/* current pricing */}
      <Card className="mt-4">
        <CardHeader title="Current pricing" hint="credits per run" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl bg-storm-800 sm:grid-cols-4">
          {[
            ["Base run", pricing?.base_run_credits],
            ["Per 100 personas", pricing?.credits_per_100_personas],
            ["Analyst report", pricing?.analyst_report_credits],
            ["1,000-persona run", pricing ? pricing.base_run_credits + 10 * pricing.credits_per_100_personas + pricing.analyst_report_credits : undefined],
          ].map(([label, val]) => (
            <div key={label as string} className="bg-storm-900 px-4 py-4">
              <p className="text-[10px] uppercase tracking-wider text-storm-400">{label}</p>
              <p className="mt-1 font-mono text-xl font-bold text-storm-100">
                {val === undefined ? "—" : (val as number).toLocaleString()}
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

        {history === null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <DataTable
            columns={columns}
            rows={history}
            rowKey={(s) => s.id}
            onRowClick={(s) => router.push(targetHref(s))}
            empty={{
              title: "No storms yet",
              message: "Run your first storm to see market reactions and a full evaluation report.",
            }}
          />
        )}
      </div>
    </DashboardShell>
  );
}
