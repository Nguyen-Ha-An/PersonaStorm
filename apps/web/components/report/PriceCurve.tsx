"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader } from "@/components/ui";
import type { StormReport } from "@/lib/types";

export function PriceCurve({ report }: { report: StormReport }) {
  const data = report.price_sensitivity.map((p) => ({
    price: p.price,
    willing: Math.round(p.share_willing * 1000) / 10,
  }));

  return (
    <Card>
      <CardHeader
        title="Price sensitivity curve"
        hint={`avg stated WTP $${report.avg_max_price.toFixed(2)}`}
      />
      <div className="h-64 p-4 pt-6">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1c2740" strokeDasharray="3 3" />
            <XAxis
              dataKey="price"
              tickFormatter={(v: number) => `$${v}`}
              stroke="#51678f"
              tick={{ fill: "#8194b8", fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(v: number) => `${v}%`}
              stroke="#51678f"
              tick={{ fill: "#8194b8", fontSize: 11 }}
              domain={[0, 100]}
            />
            <Tooltip
              formatter={(value: number | string) => [`${value}% would pay`, ""]}
              labelFormatter={(label) => `at $${label}`}
              contentStyle={{
                background: "#0d1220",
                border: "1px solid #2b3a5c",
                borderRadius: 8,
                color: "#b3c1da",
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="willing"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#curveFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="border-t border-storm-800 px-5 py-2.5 text-xs text-storm-400">
        Share of the swarm whose stated max price ≥ each price point. Cliffs mark resistance
        thresholds worth testing with real buyers.
      </p>
    </Card>
  );
}
