"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface LinkData {
  name: string;
  clicks: number;
  leads: number;
  youtubeViews?: number | null;
}

interface Props {
  data: LinkData[];
}

function truncate(s: string, n = 18) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function LinkBarChart({ data }: Props) {
  if (!data.length) return null;
  const hasData = data.some((d) => d.clicks > 0 || d.leads > 0);
  if (!hasData) return null;

  const hasViews = data.some((d) => (d.youtubeViews ?? 0) > 0);

  const chartData = data.map((d) => ({
    name: truncate(d.name),
    Clicks: d.clicks,
    Leads: d.leads,
    ...(hasViews ? { Views: d.youtubeViews ?? 0 } : {}),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2f343710" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#2f343760" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#2f343760" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{ background: "#fff", border: "1px solid #2f343715", borderRadius: 10, fontSize: 12 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {hasViews && <Bar dataKey="Views" fill="#e0f7ff" radius={[4, 4, 0, 0]} />}
        <Bar dataKey="Clicks" fill="#0d9488" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Leads" fill="#2f3437" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
