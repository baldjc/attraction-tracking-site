import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";

export const runtime = "nodejs";

const ALL_NEIGHBOURHOODS_SENTINEL = "All Neighbourhoods";

/**
 * GET /api/member/knowledge-base/discovered-neighbourhoods
 *
 * Returns the distinct list of neighbourhoods discovered in the member's
 * validated MarketFact rows (excluding the "All Neighbourhoods" rollup),
 * plus the existing MarketConfig.neighbourhoodVocab so the client can mark
 * which discovered names are already in the vocab.
 *
 * Also returns the number of distinct months covered by the validated
 * uploads so the UI can say e.g. "found 42 neighbourhoods in your last 13
 * months".
 */
export async function GET() {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  const [factRows, monthRows, config] = await Promise.all([
    prisma.marketFact.findMany({
      where: {
        userId: access.user.id,
        neighbourhood: { not: ALL_NEIGHBOURHOODS_SENTINEL },
      },
      distinct: ["neighbourhood"],
      select: { neighbourhood: true },
      orderBy: { neighbourhood: "asc" },
    }),
    prisma.marketDataUpload.findMany({
      where: {
        userId: access.user.id,
        validatedAt: { not: null },
      },
      distinct: ["monthYear"],
      select: { monthYear: true },
    }),
    prisma.marketConfig.findUnique({
      where: { userId: access.user.id },
      select: { neighbourhoodVocab: true },
    }),
  ]);

  const discovered = factRows
    .map((r) => r.neighbourhood?.trim())
    .filter((n): n is string => !!n && n.length > 0);

  const existingVocab = Array.isArray(config?.neighbourhoodVocab)
    ? (config!.neighbourhoodVocab as unknown[]).filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      )
    : [];

  return Response.json({
    discovered,
    existingVocab,
    monthsCovered: monthRows.length,
  });
}

/**
 * POST /api/member/knowledge-base/discovered-neighbourhoods
 * body: { neighbourhoods: string[] }
 *
 * Merges the chosen neighbourhood names into MarketConfig.neighbourhoodVocab
 * (union with existing, deduped case-insensitively, alphabetical). Requires
 * an existing MarketConfig row — the member must have completed market-data
 * setup first.
 */
export async function POST(req: NextRequest) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  let body: { neighbourhoods?: unknown };
  try {
    body = (await req.json()) as { neighbourhoods?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.neighbourhoods)) {
    return Response.json(
      { error: "`neighbourhoods` must be an array of strings." },
      { status: 400 },
    );
  }

  const incoming = body.neighbourhoods
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v !== ALL_NEIGHBOURHOODS_SENTINEL);

  const config = await prisma.marketConfig.findUnique({
    where: { userId: access.user.id },
    select: { neighbourhoodVocab: true },
  });
  if (!config) {
    return Response.json(
      {
        error:
          "Market Data setup is not complete yet. Configure your market first.",
      },
      { status: 400 },
    );
  }

  const existing = Array.isArray(config.neighbourhoodVocab)
    ? (config.neighbourhoodVocab as unknown[]).filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      )
    : [];

  const seen = new Map<string, string>();
  for (const name of [...existing, ...incoming]) {
    const key = name.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, name.trim());
  }
  const merged = Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );

  const addedCount = merged.length - existing.length;

  await prisma.marketConfig.update({
    where: { userId: access.user.id },
    data: { neighbourhoodVocab: merged },
  });

  return Response.json({
    neighbourhoodVocab: merged,
    addedCount,
    totalCount: merged.length,
  });
}
