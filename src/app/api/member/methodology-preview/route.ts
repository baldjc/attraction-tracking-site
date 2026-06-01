import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import {
  computeMethodologyPreview,
  type MethodologyPreview,
  type PreviewMetricRow,
} from "@/lib/methodology-preview";

// Read-only live preview for the "How we calculate your stats" panel. Returns
// the member's actual most-recent-upload numbers under every methodology
// variant plus per-threshold qualifying-neighbourhood counts. No AI calls.
//   - 401 when not signed in.
//   - 204 when the member has no upload yet (UI shows the empty state).
//   - 404 when an explicit uploadId is not owned by the member.

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; payload: MethodologyPreview }>();

function getCached(key: string): MethodologyPreview | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const explicitUploadId = req.nextUrl.searchParams.get("uploadId");

  // Resolve the target upload: the requested one (ownership-checked) or the
  // member's most recent.
  const upload = explicitUploadId
    ? await prisma.marketDataUpload.findFirst({
        where: { id: explicitUploadId, userId: user.id },
        select: { id: true, monthYear: true },
      })
    : await prisma.marketDataUpload.findFirst({
        where: { userId: user.id },
        orderBy: [{ monthYear: "desc" }, { uploadedAt: "desc" }],
        select: { id: true, monthYear: true },
      });

  if (!upload) {
    // Explicit-but-not-owned -> 404; no-upload-at-all -> 204 empty state.
    return explicitUploadId
      ? NextResponse.json({ error: "Upload not found" }, { status: 404 })
      : new NextResponse(null, { status: 204 });
  }

  const cacheKey = `${user.id}:${upload.id}`;
  const cached = getCached(cacheKey);
  if (cached) return NextResponse.json(cached);

  const [rows, config] = await Promise.all([
    prisma.aggregatedMetric.findMany({
      where: { userId: user.id, uploadId: upload.id },
      select: {
        neighbourhood: true,
        propertyType: true,
        metricFamily: true,
        metricKey: true,
        metricValue: true,
        sampleSize: true,
        monthYear: true,
      },
    }),
    prisma.marketConfig.findUnique({
      where: { userId: user.id },
      select: { mlsSource: true },
    }),
  ]);

  const payload = computeMethodologyPreview(
    upload.id,
    upload.monthYear,
    rows as PreviewMetricRow[],
    config?.mlsSource ?? null,
  );

  cache.set(cacheKey, { at: Date.now(), payload });
  return NextResponse.json(payload);
}
