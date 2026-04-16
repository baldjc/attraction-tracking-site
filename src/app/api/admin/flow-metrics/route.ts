import { NextRequest, NextResponse } from "next/server";
import { getSessionRole, isAdmin } from "@/lib/auth-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { computeFlowMetrics } from "@/lib/flow-metrics";

function parseDate(value: string | null, fallback: Date, endOfDay = false): Date {
  if (!value) return fallback;
  // Treat YYYY-MM-DD as a UTC calendar day so "today" includes today's activity.
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (ymd) {
    const [, y, m, d] = ymd;
    return endOfDay
      ? new Date(Date.UTC(+y, +m - 1, +d, 23, 59, 59, 999))
      : new Date(Date.UTC(+y, +m - 1, +d, 0, 0, 0, 0));
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

export async function GET(req: NextRequest) {
  const session = await getSessionRole();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const flags = await getFeatureFlags();
  if (!flags.flow_metrics) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const url = new URL(req.url);
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 30);
  const startDate = parseDate(url.searchParams.get("startDate"), defaultStart, false);
  const endDate = parseDate(url.searchParams.get("endDate"), now, true);

  if (endDate < startDate) {
    return NextResponse.json({ error: "endDate must be >= startDate" }, { status: 400 });
  }

  try {
    const metrics = await computeFlowMetrics(startDate, endDate);
    return NextResponse.json(metrics);
  } catch (err) {
    console.error("[flow-metrics] compute error", err);
    return NextResponse.json({ error: "Failed to compute metrics" }, { status: 500 });
  }
}
