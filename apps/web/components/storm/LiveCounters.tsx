"use client";

import { Card, CardHeader, LevelBadge, StatusDot } from "@/components/ui";
import type { ProgressEvent } from "@/lib/types";

export function LiveCounters({ progress, total }: { progress: ProgressEvent | null; total: number }) {
  const p = progress;
  const done = p?.completed ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Card>
      <CardHeader title="Telemetry" hint={p ? `${(p.elapsed_ms / 1000).toFixed(1)}s` : "—"} />
      <div className="space-y-4 p-5">
        {/* progress */}
        <div>
          <div className="mb-1.5 flex justify-between font-mono text-xs text-storm-300">
            <span>
              {done.toLocaleString()} / {total.toLocaleString()} personas
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-storm-800">
            <div
              className="h-full rounded-full bg-signal-cyan transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* adoption counters */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["green", "likely buy", p?.green ?? 0],
              ["yellow", "needs proof", p?.yellow ?? 0],
              ["red", "unlikely", p?.red ?? 0],
            ] as const
          ).map(([status, label, value]) => (
            <div key={status} className="rounded-lg border border-storm-800 bg-storm-850 px-2 py-3">
              <div className="flex items-center justify-center gap-1.5">
                <StatusDot status={status} />
                <span className="font-mono text-lg font-bold text-white">{value}</span>
              </div>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-storm-400">{label}</p>
            </div>
          ))}
        </div>

        {/* willingness to pay */}
        <div className="flex items-center justify-between rounded-lg border border-storm-800 bg-storm-850 px-4 py-3">
          <span className="text-xs uppercase tracking-wider text-storm-400">avg willingness to pay</span>
          <span className="font-mono text-lg font-bold text-white">
            ${p?.avg_max_price?.toFixed(2) ?? "0.00"}
          </span>
        </div>

        {/* top objection */}
        <div className="rounded-lg border border-storm-800 bg-storm-850 px-4 py-3">
          <p className="mb-1 text-xs uppercase tracking-wider text-storm-400">top emerging objection</p>
          <p className="min-h-[2.4em] text-sm leading-snug text-signal-yellow">
            {p?.top_objection || "listening to the swarm…"}
          </p>
        </div>

        {/* collapse risk */}
        <div className="flex items-center justify-between rounded-lg border border-storm-800 bg-storm-850 px-4 py-3">
          <span className="text-xs uppercase tracking-wider text-storm-400">collapse risk</span>
          <LevelBadge level={p?.collapse_risk ?? "low"} />
        </div>
      </div>
    </Card>
  );
}
