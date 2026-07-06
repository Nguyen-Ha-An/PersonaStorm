import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";
import { formatPercent } from "@/lib/format";
import { TONE_RGB } from "./criteria-helpers";

/** Adoption heatmap: one row per segment, cells colored by share. */
export function SegmentHeatmap({ report }: { report: StormReport }) {
  return (
    <Card>
      <CardHeader title="Adoption heatmap by segment" hint={`${report.segments.length} segments`} />
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-storm-400">
              <th className="pb-2 pr-3 font-medium">Segment</th>
              <th className="pb-2 pr-2 text-center font-medium">n</th>
              <th className="pb-2 pr-2 text-center font-medium">Likely</th>
              <th className="pb-2 pr-2 text-center font-medium">Unsure</th>
              <th className="pb-2 pr-2 text-center font-medium">Unlikely</th>
              <th className="pb-2 text-center font-medium">Avg WTP</th>
            </tr>
          </thead>
          <tbody>
            {report.segments.map((s) => (
              <tr key={s.segment} className="border-t border-storm-800">
                <td className="max-w-[220px] py-2.5 pr-3 text-xs leading-snug text-storm-200">{s.segment}</td>
                <td className="py-2.5 pr-2 text-center text-xs text-storm-300">{s.personas}</td>
                <HeatCell value={s.green / s.personas} tone="green" />
                <HeatCell value={s.yellow / s.personas} tone="yellow" />
                <HeatCell value={s.red / s.personas} tone="red" />
                <td className="py-2.5 text-center text-xs text-storm-100">${s.avg_max_price.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.segments.length > 0 && (
        <details className="group border-t border-storm-800 px-5 py-3">
          <summary className="cursor-pointer select-none rounded text-xs font-medium text-storm-300 hover:text-storm-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60">
            Segment notes
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {report.segments.map((s) => (
              <div key={s.segment} className="rounded-lg border border-storm-800 bg-storm-900/40 p-3">
                <p className="text-xs font-semibold text-storm-100">{s.segment}</p>
                <p className="mt-1 text-xs leading-relaxed text-storm-400">{s.insight}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

function HeatCell({ value, tone }: { value: number; tone: "green" | "yellow" | "red" }) {
  return (
    <td className="px-1 py-2.5">
      <div
        className="rounded-md px-2 py-1.5 text-center text-xs font-semibold"
        style={{
          backgroundColor: `rgba(${TONE_RGB[tone]}, ${0.08 + value * 0.55})`,
          color: value > 0.05 ? "#F4F7FA" : "rgba(201,208,219,0.5)",
        }}
      >
        {formatPercent(value)}
      </div>
    </td>
  );
}
