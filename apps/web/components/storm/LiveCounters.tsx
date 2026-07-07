"use client";

import { Card, CardHeader, LevelBadge, MetricCard, StatusDot } from "@/components/ui";
import { formatNumberCompact, formatPercent } from "@/lib/format";
import type { ProgressEvent } from "@/lib/types";

export function LiveCounters({ progress, total }: { progress: ProgressEvent | null; total: number }) {
  const p = progress;
  const done = p?.completed ?? 0;
  const doneFraction = total > 0 ? done / total : 0;

  return (
    <Card>
      <CardHeader title="Telemetry" hint={p ? `${(p.elapsed_ms / 1000).toFixed(1)}s` : "—"} />
      <div className="space-y-4 p-5">
        {/* progress */}
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-storm-300">
            <span className="font-mono tabular-nums">
              {formatNumberCompact(done)} / {formatNumberCompact(total)} personas
            </span>
            <span className="font-mono tabular-nums">{formatPercent(doneFraction)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-storm-800">
            <div
              className="h-full rounded-full bg-accent-primary transition-all duration-300"
              style={{ width: `${doneFraction * 100}%` }}
            />
          </div>
        </div>

        {/* adoption counters — tabular digits are genuine live telemetry, mono stays */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["green", "Likely buy", p?.green ?? 0],
              ["yellow", "Needs proof", p?.yellow ?? 0],
              ["red", "Unlikely", p?.red ?? 0],
            ] as const
          ).map(([status, label, value]) => (
            <div key={status} className="rounded-xl border border-storm-800 bg-storm-850/70 px-2 py-3">
              <div className="flex items-center justify-center gap-1.5">
                <StatusDot status={status} />
                <span className="font-mono text-lg font-semibold tabular-nums text-storm-100">
                  {value}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-storm-400">{label}</p>
            </div>
          ))}
        </div>

        {/* the four hero telemetry readouts */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Avg. willingness to pay"
            value={`$${(p?.avg_max_price ?? 0).toFixed(2)}`}
          />
          <MetricCard
            label="Avg. market fit"
            value={formatPercent(p?.avg_market_fit ?? 0)}
          />
          <MetricCard
            className="col-span-2"
            label="Top objection"
            value={
              <span className="block text-sm font-medium leading-snug tracking-normal text-signal-yellow">
                {p?.top_objection || "Listening to the swarm…"}
              </span>
            }
          />
          <MetricCard
            className="col-span-2"
            label="Collapse risk"
            value={<LevelBadge level={p?.collapse_risk ?? "low"} />}
          />
        </div>
      </div>
    </Card>
  );
}
