"use client";

import clsx from "clsx";
import { Alert } from "@/components/feedback";
import { Card, CardHeader, Skeleton } from "@/components/ui";
import { formatCredits, formatNumberCompact } from "@/lib/format";
import type { Quote } from "@/lib/types";

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? "text-storm-400" : "text-storm-300"}>{label}</span>
      <span className={muted ? "text-storm-400" : "text-storm-100"}>{value}</span>
    </div>
  );
}

export function PricePreviewCard({
  quote,
  loading,
  error,
}: {
  quote: Quote | null;
  loading?: boolean;
  error?: string | null;
}) {
  const blocks = quote ? Math.ceil(quote.persona_count / 100) : 0;
  const enough = quote?.has_enough_credits ?? true;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <span className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-storm-700 text-[11px] font-semibold text-storm-300"
            >
              4
            </span>
            <span>Cost preview</span>
          </span>
        }
      />

      <div className="space-y-3 p-5">
        {loading && !quote ? (
          <>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : error ? (
          <p className="text-sm text-signal-yellow">{error}</p>
        ) : quote ? (
          <>
            <Row label="Base simulation" value={formatCredits(quote.base_run_credits)} />
            <Row
              label={`Personas (${formatNumberCompact(quote.persona_count)})`}
              value={formatCredits(blocks * quote.credits_per_100_personas)}
            />
            <Row
              label="Analyst report"
              value={quote.analyst_report_credits > 0 ? formatCredits(quote.analyst_report_credits) : "—"}
              muted={quote.analyst_report_credits === 0}
            />

            <div className="my-1 h-px bg-storm-800" />

            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-storm-100">Total</span>
              <span className="text-2xl font-semibold tracking-tight text-accent-primary">
                {formatCredits(quote.total_credits)}
                <span className="ml-1.5 text-xs font-medium text-storm-400">credits</span>
              </span>
            </div>

            <div className="mt-2 space-y-1.5 rounded-lg border border-storm-800 bg-storm-850/60 px-3 py-2.5">
              <Row label="Wallet balance" value={formatCredits(quote.wallet_balance)} muted />
              <div className="flex items-center justify-between text-sm">
                <span className="text-storm-400">Balance after run</span>
                <span className={clsx("font-semibold", enough ? "text-storm-100" : "text-accent-danger")}>
                  {formatCredits(quote.balance_after)}
                </span>
              </div>
            </div>

            {!enough && (
              <Alert tone="yellow" title="Not enough credits for this run">
                Lower the persona count or drop the analyst report to bring the total under your
                balance, or ask an admin for a top-up.
              </Alert>
            )}
          </>
        ) : (
          <p className="text-sm text-storm-400">Adjust the run to see a live price.</p>
        )}
      </div>
    </Card>
  );
}
