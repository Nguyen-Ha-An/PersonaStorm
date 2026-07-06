import clsx from "clsx";
import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";

const PRIORITY_STYLES: Record<string, string> = {
  now: "border-signal-red/40 bg-signal-red/10 text-signal-red",
  next: "border-signal-yellow/40 bg-signal-yellow/10 text-signal-yellow",
  later: "border-storm-600 bg-storm-800 text-storm-300",
};

export function Recommendations({ report }: { report: StormReport }) {
  const items = report.recommendations ?? [];
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Recommended next research actions" hint="hypotheses → experiments" />
      <ol className="divide-y divide-storm-800">
        {items.map((r, i) => (
          <li key={r.title} className="flex gap-4 px-5 py-4">
            <span className="mt-0.5 text-sm text-storm-400">{i + 1}.</span>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-storm-100">{r.title}</p>
                <span
                  className={clsx(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
                    PRIORITY_STYLES[r.priority],
                  )}
                >
                  {r.priority}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-storm-300">{r.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
