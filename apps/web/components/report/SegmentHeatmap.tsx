import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";

/** Adoption heatmap: one row per segment, cells colored by share. */
export function SegmentHeatmap({ report }: { report: StormReport }) {
  return (
    <Card>
      <CardHeader title="Adoption heatmap by segment" hint={`${report.segments.length} segments`} />
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-storm-400">
              <th className="pb-2 pr-3 font-semibold">Segment</th>
              <th className="pb-2 pr-2 text-center font-semibold">n</th>
              <th className="pb-2 pr-2 text-center font-semibold">Likely</th>
              <th className="pb-2 pr-2 text-center font-semibold">Unsure</th>
              <th className="pb-2 pr-2 text-center font-semibold">Unlikely</th>
              <th className="pb-2 text-center font-semibold">Avg WTP</th>
            </tr>
          </thead>
          <tbody>
            {report.segments.map((s) => (
              <tr key={s.segment} className="border-t border-storm-800">
                <td className="max-w-[220px] py-2.5 pr-3 text-xs leading-snug text-storm-200">
                  {s.segment}
                </td>
                <td className="py-2.5 pr-2 text-center font-mono text-xs text-storm-300">
                  {s.personas}
                </td>
                <HeatCell value={s.green / s.personas} tone="green" />
                <HeatCell value={s.yellow / s.personas} tone="yellow" />
                <HeatCell value={s.red / s.personas} tone="red" />
                <td className="py-2.5 text-center font-mono text-xs text-white">
                  ${s.avg_max_price.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const TONE_RGB: Record<string, string> = {
  green: "52, 211, 153",
  yellow: "251, 191, 36",
  red: "251, 113, 133",
};

function HeatCell({ value, tone }: { value: number; tone: "green" | "yellow" | "red" }) {
  return (
    <td className="px-1 py-2.5">
      <div
        className="rounded-md px-2 py-1.5 text-center font-mono text-xs font-bold"
        style={{
          backgroundColor: `rgba(${TONE_RGB[tone]}, ${0.08 + value * 0.55})`,
          color: value > 0.05 ? "#fff" : "rgba(177,193,218,0.5)",
        }}
      >
        {Math.round(value * 100)}%
      </div>
    </td>
  );
}
