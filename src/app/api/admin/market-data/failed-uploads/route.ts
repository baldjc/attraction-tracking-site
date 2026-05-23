// Wave 1 Phase 2A — admin view of all failed market-data uploads across
// every member. Used to spot patterns (5 members hitting the same parse
// error -> real bug; 1 member hitting the same big-file error 5 times ->
// territory-filtering coaching).
//
// GET /api/admin/market-data/failed-uploads
//   ?category=<UploadErrorCategory>   (optional filter)
//   ?limit=<number>                    (default 100, max 500)
//
// Response shape matches what the admin page table needs — error
// classification is done server-side so the admin doesn't pay the cost on
// every render and we keep the classifier import out of the admin bundle.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  classifyUploadError,
  ERROR_CATEGORY_LABELS,
  type UploadErrorCategory,
} from "@/lib/upload-error-messages";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  const sessionUser = session?.user as { id?: string; role?: string } | undefined;
  const role = sessionUser?.role;
  if (!session?.user || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const categoryParam = url.searchParams.get("category") as UploadErrorCategory | null;
  const limitParam = Number(url.searchParams.get("limit") ?? "100");
  const limit = Math.min(500, Math.max(1, Number.isFinite(limitParam) ? limitParam : 100));

  // Fetch a generous slab and filter in-memory after classification — there
  // typically aren't more than ~50 failed uploads system-wide at any time,
  // so a 1000-row scan with a Postgres index is cheap.
  const rows = await prisma.marketDataUpload.findMany({
    where: { status: "failed" },
    orderBy: { uploadedAt: "desc" },
    take: 1000,
    select: {
      id: true,
      userId: true,
      label: true,
      monthYear: true,
      csvFileName: true,
      rowCount: true,
      uploadedAt: true,
      retryCount: true,
      validationError: true,
      user: { select: { email: true, fullName: true } },
    },
  });

  const enriched = rows.map((r) => {
    const friendly = classifyUploadError(r.validationError ?? "", {
      rowCount: r.rowCount,
      retryCount: r.retryCount,
    });
    return {
      id: r.id,
      userId: r.userId,
      memberEmail: r.user?.email ?? null,
      memberName: r.user?.fullName ?? null,
      label: r.label,
      monthYear: r.monthYear,
      csvFileName: r.csvFileName,
      rowCount: r.rowCount,
      uploadedAt: r.uploadedAt.toISOString(),
      retryCount: r.retryCount,
      rawError: (r.validationError ?? "").slice(0, 300),
      category: friendly.category,
      categoryLabel: ERROR_CATEGORY_LABELS[friendly.category],
      friendlyTitle: friendly.title,
    };
  });

  const filtered = categoryParam
    ? enriched.filter((e) => e.category === categoryParam)
    : enriched;

  // Tally by category across the unfiltered set so the admin page can
  // render its dropdown with counts.
  const tallies: Partial<Record<UploadErrorCategory, number>> = {};
  for (const e of enriched) {
    tallies[e.category] = (tallies[e.category] ?? 0) + 1;
  }

  return NextResponse.json({
    rows: filtered.slice(0, limit),
    totalMatching: filtered.length,
    totalAll: enriched.length,
    categoryCounts: tallies,
  });
}
