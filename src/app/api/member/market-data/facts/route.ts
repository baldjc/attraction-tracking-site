/**
 * GET /api/member/market-data/facts?q=<search>&limit=<n>
 *
 * Lists the caller's headline-safe MarketFact rows for the in-place fact
 * picker (Script Builder v2 link/unlink flow). Only headline-safe facts are
 * returned so anything a member links is gate-valid for script generation.
 *
 * Ownership is enforced by `userId` on every query — a forged plan/fact id can
 * never surface another member's facts.
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { resolveUserFromSession } from "@/lib/session-utils";
import {
  metricNameToLabel,
  formatMetricValue,
} from "@/lib/content-engine-validation";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") ?? 200) || 200,
    500,
  );

  const where: Prisma.MarketFactWhereInput = {
    userId: user.id,
    usageClass: "headline_safe",
    ...EXCLUDE_LEGACY_FAILURE_RATE,
  };
  if (q) {
    where.OR = [
      { neighbourhood: { contains: q, mode: "insensitive" } },
      { metricName: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.marketFact.findMany({
    where,
    select: {
      id: true,
      neighbourhood: true,
      propertyType: true,
      metricName: true,
      metricValue: true,
      metricValueString: true,
      dateContext: true,
      upload: { select: { monthYear: true } },
    },
    orderBy: [{ neighbourhood: "asc" }, { createdAt: "desc" }],
    take: limit,
  });

  function toMonthYear(d: Date | null): string {
    if (!d) return "";
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${d.getUTCFullYear()}-${m}`;
  }

  const facts = rows.map((f) => {
    const hasNumeric = f.metricValue !== null && f.metricValue !== undefined;
    return {
      id: f.id,
      neighbourhood: f.neighbourhood,
      propertyType: f.propertyType,
      metricLabel: metricNameToLabel(f.metricName),
      metricValueString: hasNumeric
        ? formatMetricValue(f.metricName, f.metricValue as number)
        : (f.metricValueString ?? ""),
      monthYear: toMonthYear(f.dateContext) || (f.upload?.monthYear ?? ""),
    };
  });

  return NextResponse.json({ facts });
}
