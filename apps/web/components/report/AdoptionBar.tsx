import type { StormReport } from "@/lib/types";

export function AdoptionBar({ report }: { report: StormReport }) {
  const { green, yellow, red } = report.adoption;
  const total = Math.max(1, green + yellow + red);
  const seg = (n: number) => `${(n / total) * 100}%`;

  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full border border-storm-700">
        <div className="bg-signal-green/85" style={{ width: seg(green) }} title={`likely: ${green}`} />
        <div className="bg-signal-yellow/80" style={{ width: seg(yellow) }} title={`unsure: ${yellow}`} />
        <div className="bg-signal-red/80" style={{ width: seg(red) }} title={`unlikely: ${red}`} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-xs text-storm-300">
        <span className="text-signal-green">
          ▲ {green} likely ({Math.round((green / total) * 100)}%)
        </span>
        <span className="text-signal-yellow">
          ◆ {yellow} unsure ({Math.round((yellow / total) * 100)}%)
        </span>
        <span className="text-signal-red">
          ▼ {red} unlikely ({Math.round((red / total) * 100)}%)
        </span>
      </div>
    </div>
  );
}
