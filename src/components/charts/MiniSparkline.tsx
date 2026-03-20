"use client";

import { ResponsiveContainer, LineChart, Line } from "recharts";

interface Props {
  data: { value: number }[];
  color?: string;
}

export function MiniSparkline({ data, color = "#3dc3ff" }: Props) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
