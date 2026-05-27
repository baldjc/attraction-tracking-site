"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

interface Slice {
  name: string;
  value: number;
}

interface Props {
  data: Slice[];
  colors?: string[];
}

const DEFAULT_COLORS = ["var(--abv-azure)", "var(--abv-text)", "var(--abv-crimson)", "#22c55e", "var(--abv-scores)", "#a78bfa"];

export function DonutChart({ data, colors = DEFAULT_COLORS }: Props) {
  const nonZero = data.filter((d) => d.value > 0);
  if (!nonZero.length) return null;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={nonZero}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={2}
        >
          {nonZero.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#fff", border: "1px solid var(--abv-text)15", borderRadius: 10, fontSize: 12 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
