import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";

const PRIORITY_STYLES: Record<string, string> = {
  now: "border-signal-red/40 bg-signal-red/10 text-signal-red",
  next: "border-signal-yellow/40 bg-signal-yellow/10 text-signal-yellow",
  later: "border-storm-600 bg-storm-800 text-storm-300",
};

export function Recommendations({ report }: { report: StormReport }) {
  return (
    <Card>
      <CardHeader title="Recommended next research actions" hint="hypotheses → experiments" />
      <ol className="divide-y divide-storm-800">
        {report.recommendations.map((r, i) => (
          <li key={r.title} className="flex gap-4 px-5 py-4">
            <span className="mt-0.5 font-mono text-sm text-storm-400">{i + 1}.</span>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-white">{r.title}</p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PRIORITY_STYLES[r.priority]}`}
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
