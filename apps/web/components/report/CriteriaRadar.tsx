import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";
import { formatPercent } from "@/lib/format";
import { effectiveScore, toneFor, TONE_HEX } from "./criteria-helpers";

/**
 * Hand-rolled SVG radar over all 17 criteria (zero chart deps). Plots the
 * barrier-aware `effective` score so every axis reads on one scale where
 * outward = better for adoption. Responsive via viewBox + max-width:100%.
 */

const SIZE = 460; // viewBox square
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 150; // outer radius of the 1.0 ring
const RINGS = [0.25, 0.5, 0.75, 1]; // gridline radii (as fraction)
const LINE_MAX = 13; // soft per-line character budget for wrapped labels

/** Wrap a label onto up to two short lines instead of aggressively truncating. */
function wrapLabel(label: string): string[] {
  if (label.length <= LINE_MAX) return [label];
  const words = label.split(" ");
  if (words.length === 1) {
    return label.length > 16 ? [label.slice(0, 15).trimEnd() + "…"] : [label];
  }
  let line1 = "";
  let line2 = "";
  for (const w of words) {
    if (!line1 || `${line1} ${w}`.length <= LINE_MAX) {
      line1 = line1 ? `${line1} ${w}` : w;
    } else {
      line2 = line2 ? `${line2} ${w}` : w;
    }
  }
  if (line2.length > 16) line2 = line2.slice(0, 15).trimEnd() + "…";
  return line2 ? [line1, line2] : [line1];
}

export function CriteriaRadar({ report }: { report: StormReport }) {
  const criteria = report.criteria_breakdown ?? [];
  const n = criteria.length;
  if (n < 3) return null;

  // Point on the circle for axis i at radius fraction f (0..1). Start at top.
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i: number, f: number) => {
    const a = angleFor(i);
    return { x: CX + Math.cos(a) * R * f, y: CY + Math.sin(a) * R * f };
  };

  const values = criteria.map((c) => effectiveScore(c));
  const polygon = values
    .map((v, i) => {
      const p = point(i, Math.max(0.02, v));
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");

  // Overall tone drives the fill color of the shape.
  const avg = values.reduce((a, b) => a + b, 0) / n;
  const tone = toneFor(avg);
  const fill = TONE_HEX[tone];

  return (
    <Card>
      <CardHeader title="Criteria radar" hint={`${n} criteria · outward = better`} />
      <div className="p-4">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="mx-auto block h-auto w-full max-w-[460px]"
          role="img"
          aria-label="Radar chart of all criteria scores"
        >
          {/* concentric rings */}
          {RINGS.map((f) => (
            <polygon
              key={f}
              points={criteria
                .map((_, i) => {
                  const p = point(i, f);
                  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                })
                .join(" ")}
              fill="none"
              stroke="#1C212B"
              strokeWidth={1}
            />
          ))}

          {/* spokes + labels */}
          {criteria.map((c, i) => {
            const edge = point(i, 1);
            const label = point(i, 1.16);
            const a = angleFor(i);
            const cos = Math.cos(a);
            // Anchor text based on which side of the circle it sits.
            const anchor = Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
            const lines = wrapLabel(c.label);
            return (
              <g key={c.criterion_id}>
                <line x1={CX} y1={CY} x2={edge.x} y2={edge.y} stroke="#1C212B" strokeWidth={1} />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="#A7B0C0"
                >
                  {lines.map((line, li) => (
                    <tspan key={li} x={label.x} dy={li === 0 ? 0 : "1.05em"}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}

          {/* data polygon */}
          <polygon
            points={polygon}
            fill={fill}
            fillOpacity={0.18}
            stroke={fill}
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* data vertices, tinted per-axis */}
          {values.map((v, i) => {
            const p = point(i, Math.max(0.02, v));
            const dotTone = toneFor(v);
            return (
              <circle key={criteria[i].criterion_id} cx={p.x} cy={p.y} r={3} fill={TONE_HEX[dotTone]}>
                <title>
                  {criteria[i].label}: {formatPercent(criteria[i].average_score)} raw
                </title>
              </circle>
            );
          })}
        </svg>
        <p className="mt-2 text-center text-[11px] text-storm-400">
          Barrier criteria are inverted so outward always means better for adoption.
        </p>
      </div>
    </Card>
  );
}
