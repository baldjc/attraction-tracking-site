"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface DayData {
  date: string;
  clicks: number;
  leads: number;
}

interface Props {
  data: DayData[];
  showLegend?: boolean;
  hideLeads?: boolean;
}

function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}

export function DailyLineChart({ data, showLegend = true, hideLeads = false }: Props) {
  if (!data.length) return <ChartEmpty />;
  const hasData = data.some((d) => d.clicks > 0 || d.leads > 0);
  if (!hasData) return <ChartEmpty />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--abv-text)10" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={{ fontSize: 11, fill: "var(--abv-text)60" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--abv-text)60" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{ background: "#fff", border: "1px solid var(--abv-text)15", borderRadius: 10, fontSize: 12 }}
          labelFormatter={(label) => fmtDate(String(label ?? ""))}
        />
        {showLegend && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        <Line type="monotone" dataKey="clicks" stroke="var(--abv-azure)" strokeWidth={2} dot={false} name="Clicks" />
        {!hideLeads && <Line type="monotone" dataKey="leads" stroke="var(--abv-text)" strokeWidth={2} dot={false} name="Leads" />}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ChartEmpty() {
  return (
    <div className="flex items-center justify-center h-[220px] text-[var(--abv-text)]/30 text-sm">
      No data yet — clicks and leads will appear here once your tracking links get traffic
    </div>
  );
}
