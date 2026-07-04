"use client";

import clsx from "clsx";
import { Card, Skeleton } from "@/components/ui";
import type { Quote } from "@/lib/types";

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? "text-storm-400" : "text-storm-300"}>{label}</span>
      <span className={clsx("font-mono", muted ? "text-storm-400" : "text-storm-100")}>{value}</span>
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
      <div className="border-b border-storm-800 px-5 py-3.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-storm-200">
          Price preview
        </h3>
      </div>

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
            <Row label="Base run" value={`${quote.base_run_credits}`} />
            <Row
              label={`Personas — ${blocks} × ${quote.persona_count.toLocaleString()}/100`}
              value={`${blocks * quote.credits_per_100_personas}`}
            />
            <Row
              label="Analyst report"
              value={quote.analyst_report_credits > 0 ? `${quote.analyst_report_credits}` : "—"}
              muted={quote.analyst_report_credits === 0}
            />

            <div className="my-1 h-px bg-storm-800" />

            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-storm-100">Total</span>
              <span className="font-mono text-2xl font-bold text-signal-cyan">
                {quote.total_credits.toLocaleString()}
                <span className="ml-1 text-xs font-medium text-storm-400">credits</span>
              </span>
            </div>

            <div className="mt-2 space-y-1.5 rounded-lg border border-storm-800 bg-storm-850/60 px-3 py-2.5">
              <Row label="Wallet balance" value={quote.wallet_balance.toLocaleString()} muted />
              <div className="flex items-center justify-between text-sm">
                <span className="text-storm-400">Balance after run</span>
                <span
                  className={clsx(
                    "font-mono font-bold",
                    enough ? "text-storm-100" : "text-signal-red",
                  )}
                >
                  {quote.balance_after.toLocaleString()}
                </span>
              </div>
            </div>

            {!enough && (
              <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-3 py-2.5 text-xs leading-relaxed text-signal-red">
                Not enough credits for this run. Lower the persona count or ask an admin for a
                top-up.
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-storm-400">Adjust the run to see a live price.</p>
        )}
      </div>
    </Card>
  );
}
