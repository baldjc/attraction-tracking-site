// Admin-only listing of one member's market-data uploads (all statuses), with
// per-upload fact counts. Powers the "Market data uploads" section on
// /admin/members/[id] where an admin can re-validate any upload.
//
// GET /api/admin/market-data/member-uploads?userId=<memberId>

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  const actor = session?.user as { role?: string } | undefined;
  if (!session?.user || actor?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const uploads = await prisma.marketDataUpload.findMany({
    where: { userId },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      label: true,
      monthYear: true,
      csvFileName: true,
      rowCount: true,
      status: true,
      uploadedAt: true,
      validatedAt: true,
      validationError: true,
      validationCostUsd: true,
      factYieldPct: true,
      retryCount: true,
    },
  });

  // One grouped count instead of N per-upload counts.
  const counts = await prisma.marketFact.groupBy({
    by: ["uploadId"],
    where: { userId },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.uploadId, c._count._all]));

  const rows = uploads.map((u) => ({
    id: u.id,
    label: u.label,
    monthYear: u.monthYear,
    csvFileName: u.csvFileName,
    rowCount: u.rowCount,
    status: u.status,
    uploadedAt: u.uploadedAt.toISOString(),
    validatedAt: u.validatedAt ? u.validatedAt.toISOString() : null,
    validationError: u.validationError ?? null,
    validationCostUsd: u.validationCostUsd ?? null,
    factYieldPct: u.factYieldPct ?? null,
    retryCount: u.retryCount,
    factsCount: countMap.get(u.id) ?? 0,
  }));

  return NextResponse.json({ rows });
}
