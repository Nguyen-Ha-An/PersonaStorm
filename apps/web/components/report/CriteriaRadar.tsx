import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";
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

/** Shorten dense labels so 17 fit around the ring. */
function abbrev(label: string): string {
  if (label.length <= 14) return label;
  return label.slice(0, 13).trimEnd() + "…";
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
              stroke="#1c2740"
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
            return (
              <g key={c.criterion_id}>
                <line
                  x1={CX}
                  y1={CY}
                  x2={edge.x}
                  y2={edge.y}
                  stroke="#1c2740"
                  strokeWidth={1}
                />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={9.5}
                  fill="#8194b8"
                >
                  {abbrev(c.label)}
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
              <circle
                key={criteria[i].criterion_id}
                cx={p.x}
                cy={p.y}
                r={3}
                fill={TONE_HEX[dotTone]}
              >
                <title>
                  {criteria[i].label}: {Math.round(criteria[i].average_score * 100)}% raw
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
