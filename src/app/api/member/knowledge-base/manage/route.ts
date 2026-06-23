import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import {
  getExcludedNeighbourhoods,
  normalizeNeighbourhoodKey,
  isProtectedRollup,
} from "@/lib/excluded-neighbourhoods";

// Member-facing neighbourhood data-management view. Unifies every store where a
// neighbourhood name can live — the Knowledge Base vocab (drives the KB cards &
// dropdowns), written KB profiles, and the market-data stores (MarketFact +
// AggregatedMetric) — into one labelled, counted list so the member can SEE
// exactly what's in their account and where, then selectively delete it.
//
// Strictly member-scoped (access.user.id). Read-only.

interface ManageRow {
  name: string;
  normName: string;
  inVocab: boolean;
  hasProfile: boolean;
  factCount: number;
  metricCount: number;
  isRollup: boolean;
}

export async function GET(_req: NextRequest) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;
  const userId = access.user.id;

  const [config, profiles, factGroups, metricGroups, excluded] =
    await Promise.all([
      prisma.marketConfig.findUnique({
        where: { userId },
        select: { neighbourhoodVocab: true, marketName: true, mlsSource: true },
      }),
      prisma.neighbourhoodProfile.findMany({
        where: { userId },
        select: { neighbourhood: true },
      }),
      prisma.marketFact.groupBy({
        by: ["neighbourhood"],
        where: { userId },
        _count: { _all: true },
      }),
      prisma.aggregatedMetric.groupBy({
        by: ["neighbourhood"],
        // Wave 6a (Phase 1) parity: count the overall rollups only so the
        // per-neighbourhood metric counts stay identical to Wave 1.
        where: { userId, priceTier: null },
        _count: { _all: true },
      }),
      getExcludedNeighbourhoods(userId),
    ]);

  const vocab = Array.isArray(config?.neighbourhoodVocab)
    ? (config!.neighbourhoodVocab as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];

  // Merge every source into one row per normalized name. Keep the first-seen
  // display form (vocab/profile casing wins over raw fact strings).
  const rows = new Map<string, ManageRow>();
  const ensure = (rawName: string): ManageRow => {
    const name = rawName.trim();
    const normName = normalizeNeighbourhoodKey(name);
    let row = rows.get(normName);
    if (!row) {
      row = {
        name,
        normName,
        inVocab: false,
        hasProfile: false,
        factCount: 0,
        metricCount: 0,
        isRollup: isProtectedRollup(name),
      };
      rows.set(normName, row);
    }
    return row;
  };

  for (const n of vocab) {
    if (!n.trim()) continue;
    ensure(n).inVocab = true;
  }
  for (const p of profiles) {
    if (!p.neighbourhood.trim()) continue;
    ensure(p.neighbourhood).hasProfile = true;
  }
  for (const g of factGroups) {
    if (!g.neighbourhood.trim()) continue;
    ensure(g.neighbourhood).factCount += g._count._all;
  }
  for (const g of metricGroups) {
    if (!g.neighbourhood.trim()) continue;
    ensure(g.neighbourhood).metricCount += g._count._all;
  }

  const list = Array.from(rows.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  return Response.json({
    marketName: config?.marketName ?? null,
    mlsSource: config?.mlsSource ?? null,
    counts: {
      total: list.length,
      vocab: vocab.length,
      profiles: profiles.length,
      marketDataNeighbourhoods: list.filter(
        (r) => r.factCount > 0 || r.metricCount > 0,
      ).length,
      excluded: excluded.length,
    },
    neighbourhoods: list,
    excluded: excluded.map((e) => ({
      name: e.name,
      normName: e.normName,
      excludedAt: e.createdAt.toISOString(),
    })),
  });
}
