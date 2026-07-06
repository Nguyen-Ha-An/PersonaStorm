"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { WalletBalanceCard } from "@/components/dashboard/WalletBalanceCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Alert } from "@/components/feedback";
import { SectionHeader, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { getTransactions } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCredits, formatDateTime, formatSignedCredits } from "@/lib/format";
import type { WalletTransaction } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  credit_grant: "Credit grant",
  storm_charge: "Storm charge",
  refund: "Refund",
  admin_adjustment: "Admin adjustment",
};

/** Display-only fallback for transaction types not in TYPE_LABELS, e.g.
 *  "admin_adjustment" → "Admin adjustment" — never render a raw snake_case type. */
function humanizeType(type: string): string {
  const spaced = type.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function WalletPage() {
  const { me } = useAuth();
  const [txns, setTxns] = useState<WalletTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTransactions()
      .then((t) => !cancelled && setTxns(t))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load."));
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: Column<WalletTransaction>[] = [
    {
      key: "type",
      header: "Type",
      cell: (t) => (
        <span className="font-medium text-storm-100">{TYPE_LABELS[t.type] ?? humanizeType(t.type)}</span>
      ),
    },
    {
      key: "desc",
      header: "Description",
      cell: (t) => <span className="text-storm-300">{t.description || "—"}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (t) => (
        <span
          className={clsx(
            "font-medium",
            t.amount_credits > 0 ? "text-signal-green" : "text-signal-red",
          )}
        >
          {formatSignedCredits(t.amount_credits)}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      cell: (t) => <span className="text-storm-300">{formatCredits(t.balance_after)}</span>,
    },
    {
      key: "storm",
      header: "Simulation",
      cell: (t) =>
        t.storm_id ? (
          <Link
            href={`/storm/${t.storm_id}`}
            className="rounded font-mono text-xs text-storm-300 hover:text-storm-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
          >
            {t.storm_id.replace("storm_", "").slice(0, 8)}
          </Link>
        ) : (
          <span className="text-storm-600">—</span>
        ),
    },
    {
      key: "date",
      header: "Date",
      align: "right",
      cell: (t) => <span className="whitespace-nowrap text-storm-400">{formatDateTime(t.created_at)}</span>,
    },
  ];

  return (
    <DashboardShell title="Credits">
      <div className="space-y-8">
        <PageHeader title="Credits" subtitle="Your available balance and credit activity." />

        {error && (
          <Alert tone="red" title="Couldn't load your credit activity">
            {error}
          </Alert>
        )}

        <div>
          <WalletBalanceCard
            balance={me?.wallet.balance_credits ?? 0}
            lifetimeSpent={me?.wallet.lifetime_spent_credits ?? 0}
          />
          <p className="mt-3 px-1 text-xs text-storm-400">
            Payments aren&rsquo;t enabled yet — contact an admin for a credit top-up. New accounts
            start with 100 free credits.
          </p>
        </div>

        <div>
          <SectionHeader title="Credit activity" className="mb-4" />
          {txns === null ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <DataTable
              columns={columns}
              rows={txns}
              rowKey={(t) => t.id}
              empty={{
                title: "No credit activity yet",
                message: "Your credit activity will appear here as you run simulations.",
              }}
            />
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
