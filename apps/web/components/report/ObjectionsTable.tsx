import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";

export function ObjectionsTable({ report }: { report: StormReport }) {
  const max = Math.max(...report.top_objections.map((o) => o.share), 0.01);
  return (
    <Card>
      <CardHeader title="Top objections" hint="ranked by frequency" />
      <div className="divide-y divide-storm-800">
        {report.top_objections.map((o, i) => (
          <div key={o.label} className="px-5 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-storm-200">
                <span className="mr-2 font-mono text-xs text-storm-400">#{i + 1}</span>
                “{o.label}”
              </p>
              <span className="shrink-0 font-mono text-sm font-bold text-signal-yellow">
                {Math.round(o.share * 100)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-storm-800">
              <div
                className="h-full rounded-full bg-signal-yellow/70"
                style={{ width: `${(o.share / max) * 100}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="max-w-[75%] truncate text-xs italic text-storm-400">
                e.g. “{o.example_quote}”
              </p>
              <span className="text-[10px] uppercase tracking-wider text-storm-400">
                {o.count} personas{o.top_segments.length > 0 && ` · mostly ${o.top_segments[0]}`}
              </span>
            </div>
          </div>
        ))}
        {report.top_objections.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-storm-400">
            No objections recorded — suspicious. Check the trust panel.
          </p>
        )}
      </div>
    </Card>
  );
}
