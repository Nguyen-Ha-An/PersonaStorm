"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { WalletBalanceCard } from "@/components/dashboard/WalletBalanceCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Alert } from "@/components/feedback";
import { Card, Skeleton } from "@/components/ui";
import { getTransactions } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatSignedCredits } from "@/lib/format";
import type { WalletTransaction } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  credit_grant: "Credit grant",
  storm_charge: "Storm charge",
  refund: "Refund",
  admin_adjustment: "Admin adjustment",
};

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
      cell: (t) => <span className="font-medium text-storm-100">{TYPE_LABELS[t.type] ?? t.type}</span>,
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
            "font-mono font-bold",
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
      cell: (t) => <span className="font-mono text-storm-300">{t.balance_after.toLocaleString()}</span>,
    },
    {
      key: "storm",
      header: "Storm",
      cell: (t) =>
        t.storm_id ? (
          <Link href={`/storm/${t.storm_id}`} className="font-mono text-xs text-signal-cyan hover:underline">
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
    <DashboardShell title="Wallet" subtitle="Your credit balance and transaction history">
      {error && (
        <Alert tone="red" title="Could not load your wallet" className="mb-6">
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
        <Card className="flex items-center p-5">
          <p className="text-xs leading-relaxed text-storm-400">
            <span className="font-semibold text-storm-200">Payments are not enabled yet.</span>{" "}
            Contact an admin for a credit top-up. New accounts start with 100 free credits.
          </p>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-[0.12em] text-storm-200">
        Transaction history
      </h2>
      {txns === null ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <DataTable
          columns={columns}
          rows={txns}
          rowKey={(t) => t.id}
          empty={{ title: "No transactions yet", message: "Your credit activity will appear here." }}
        />
      )}
    </DashboardShell>
  );
}
