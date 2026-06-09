import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import {
  addExcludedNeighbourhood,
  removeExcludedNeighbourhood,
  normalizeNeighbourhoodKey,
  isProtectedRollup,
} from "@/lib/excluded-neighbourhoods";

// Selective per-neighbourhood data management for the member.
//
//   action: "delete"    → remove a single neighbourhood from EVERY store
//                          (KB vocab, KB profile, MarketFact, AggregatedMetric)
//                          AND record it on the persistent exclusion list so a
//                          re-upload of a messy export never resurrects it.
//   action: "unexclude" → drop it from the exclusion list; future uploads may
//                          include it again.
//
// Strictly member-scoped. Refuses aggregate rollup labels ("All Neighbourhoods")
// — deleting those would break downstream aggregate cuts. Never touches saved
// Planner scripts, ContentProfile/MarketConfig voice/avatar fields, or other
// members.

type Body = { name?: unknown; action?: unknown };

export async function POST(req: NextRequest) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;
  const userId = access.user.id;

  const body = (await req.json().catch(() => ({}))) as Body;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const action = body.action === "unexclude" ? "unexclude" : "delete";

  if (!name) {
    return Response.json({ error: "A neighbourhood name is required." }, {
      status: 400,
    });
  }

  if (action === "unexclude") {
    await removeExcludedNeighbourhood(userId, name);
    return Response.json({ ok: true, action: "unexclude", name });
  }

  // action === "delete"
  if (isProtectedRollup(name)) {
    return Response.json(
      {
        error:
          "“" +
          name +
          "” is an aggregate total, not a real neighbourhood, and can't be removed — downstream stats depend on it.",
      },
      { status: 400 },
    );
  }

  const normName = normalizeNeighbourhoodKey(name);

  // READS (outside the write transaction so it stays short). We match on the
  // NORMALIZED key (trim + collapse internal whitespace + lowercase) — the same
  // key the rest of the system uses — NOT a raw `equals` filter, so a single
  // delete clears every case/space variant ("South  Terwillegar" vs "south
  // terwillegar ") instead of leaving residual rows behind. Prisma can't
  // normalize whitespace in SQL, so we fetch candidate ids and filter in app
  // code, then delete by id.
  const [config, profileRows, factRows, metricRows] = await Promise.all([
    prisma.marketConfig.findUnique({
      where: { userId },
      select: { neighbourhoodVocab: true },
    }),
    prisma.neighbourhoodProfile.findMany({
      where: { userId },
      select: { id: true, neighbourhood: true },
    }),
    prisma.marketFact.findMany({
      where: { userId },
      select: { id: true, neighbourhood: true },
    }),
    prisma.aggregatedMetric.findMany({
      where: { userId },
      select: { id: true, neighbourhood: true },
    }),
  ]);

  const matches = (n: string) => normalizeNeighbourhoodKey(n) === normName;

  // KB vocab: read–modify–write the JSON array WITHOUT touching any other field
  // on MarketConfig (voice/avatar live on the same row and must be preserved).
  let nextVocab: string[] | null = null;
  let removedFromVocab = 0;
  if (config && Array.isArray(config.neighbourhoodVocab)) {
    const vocab = (config.neighbourhoodVocab as unknown[]).filter(
      (v): v is string => typeof v === "string",
    );
    const next = vocab.filter((v) => !matches(v));
    removedFromVocab = vocab.length - next.length;
    if (removedFromVocab > 0) nextVocab = next;
  }

  const profileIds = profileRows.filter((r) => matches(r.neighbourhood)).map((r) => r.id);
  const factIds = factRows.filter((r) => matches(r.neighbourhood)).map((r) => r.id);
  const metricIds = metricRows.filter((r) => matches(r.neighbourhood)).map((r) => r.id);

  // WRITES — one atomic transaction so a mid-flight failure can't leave partial
  // state (e.g. rows deleted but the exclusion not recorded). The exclusion is
  // recorded in the SAME transaction so re-uploads of a messy export stay clean.
  const [, profileDel, factDel, metricDel] = await prisma.$transaction([
    nextVocab !== null
      ? prisma.marketConfig.update({
          where: { userId },
          data: { neighbourhoodVocab: nextVocab },
        })
      : prisma.marketConfig.findUnique({ where: { userId }, select: { userId: true } }),
    prisma.neighbourhoodProfile.deleteMany({ where: { userId, id: { in: profileIds } } }),
    prisma.marketFact.deleteMany({ where: { userId, id: { in: factIds } } }),
    prisma.aggregatedMetric.deleteMany({ where: { userId, id: { in: metricIds } } }),
    prisma.excludedNeighbourhood.upsert({
      where: { userId_normName: { userId, normName } },
      create: { userId, name, normName },
      update: {},
    }),
  ]);

  return Response.json({
    ok: true,
    action: "delete",
    name,
    removed: {
      vocab: removedFromVocab,
      profiles: profileDel.count,
      facts: factDel.count,
      metrics: metricDel.count,
    },
  });
}
