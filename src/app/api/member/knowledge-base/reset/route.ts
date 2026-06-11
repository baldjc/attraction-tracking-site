import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import { isMarketReaggKillSwitchActiveForUser } from "@/lib/feature-flags";

// Full member-scoped reset of neighbourhood data. The "one-action wipe" for a
// member whose stores are full of junk (raw MLS codes, "Unknown") that would
// take hundreds of individual deletes to clear.
//
// Scope choice:
//   "kb"     → Knowledge Base only: clears the neighbourhood vocab (the list
//              that drives the KB cards/dropdowns) + KB profiles + research
//              uploads + the merge/clean tables (canonical areas, aliases,
//              merge runs). Leaves market-data facts/metrics untouched.
//   "market" → Market data only: deletes every market-data upload and its
//              facts, aggregated metrics, and story leads. Leaves the KB vocab
//              and profiles untouched.
//   "both"   → Everything above.
//
// HARD GUARANTEES — a reset NEVER:
//   • deletes the MarketConfig row (it holds voice/avatar/market config — we
//     only blank the `neighbourhoodVocab` field on a KB/both reset),
//   • touches saved Planner scripts (ContentPlan),
//   • touches ContentProfile or any other member's data,
//   • clears the persistent exclusion list (the member's hygiene choices stay).
//
// Requires a hard type-to-confirm token ("RESET") to fire.

type Scope = "kb" | "market" | "both";

type Body = { scope?: unknown; confirm?: unknown };

export async function POST(req: NextRequest) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;
  const userId = access.user.id;

  const body = (await req.json().catch(() => ({}))) as Body;
  const scope = body.scope;
  const confirm = typeof body.confirm === "string" ? body.confirm.trim() : "";

  if (scope !== "kb" && scope !== "market" && scope !== "both") {
    return Response.json(
      { error: "Choose what to reset: knowledge base, market data, or both." },
      { status: 400 },
    );
  }
  if (confirm !== "RESET") {
    return Response.json(
      { error: "Type RESET to confirm. Nothing was changed." },
      { status: 400 },
    );
  }

  const doKb = scope === "kb" || scope === "both";
  const doMarket = scope === "market" || scope === "both";

  // Market re-aggregation break-glass — only the market-data scopes delete the
  // shared market_facts / aggregated_metrics / market_story_leads store, so
  // freeze ONLY when this reset touches market data. A "kb"-only reset clears
  // vocab/profiles/merge tables (not the shared store the legacy tools cite), so
  // it stays open — keeps the freeze scoped to re-aggregation, no over-block.
  if (doMarket && (await isMarketReaggKillSwitchActiveForUser(userId))) {
    return Response.json(
      {
        error:
          "Resetting your market data is temporarily paused while we roll out an update. Nothing was changed — please check back shortly.",
        code: "REAGGREGATION_PAUSED",
      },
      { status: 423 },
    );
  }

  const removed = {
    vocab: 0,
    profiles: 0,
    researchUploads: 0,
    canonicalAreas: 0,
    areaAliases: 0,
    mergeRuns: 0,
    marketUploads: 0,
    facts: 0,
    metrics: 0,
    storyLeads: 0,
  };

  if (doKb) {
    // Blank the vocab field ONLY — never delete the MarketConfig row.
    const cfg = await prisma.marketConfig.findUnique({
      where: { userId },
      select: { neighbourhoodVocab: true },
    });
    if (cfg && Array.isArray(cfg.neighbourhoodVocab)) {
      removed.vocab = (cfg.neighbourhoodVocab as unknown[]).length;
    }
    const [profiles, research, aliases, mergeRuns, canonical] =
      await prisma.$transaction([
        prisma.neighbourhoodProfile.deleteMany({ where: { userId } }),
        prisma.neighbourhoodResearchUpload.deleteMany({ where: { userId } }),
        prisma.areaAlias.deleteMany({ where: { userId } }),
        prisma.mergeRun.deleteMany({ where: { userId } }),
        prisma.canonicalArea.deleteMany({ where: { userId } }),
        prisma.marketConfig.update({
          where: { userId },
          data: { neighbourhoodVocab: [] },
        }),
      ]);
    removed.profiles = profiles.count;
    removed.researchUploads = research.count;
    removed.areaAliases = aliases.count;
    removed.mergeRuns = mergeRuns.count;
    removed.canonicalAreas = canonical.count;
  }

  if (doMarket) {
    // Explicit deletes (facts/metrics/leads cascade from uploads too, but we
    // delete them directly so a clean wipe doesn't rely on cascade ordering).
    const [leads, metrics, facts, uploads] = await prisma.$transaction([
      prisma.marketStoryLead.deleteMany({ where: { userId } }),
      prisma.aggregatedMetric.deleteMany({ where: { userId } }),
      prisma.marketFact.deleteMany({ where: { userId } }),
      prisma.marketDataUpload.deleteMany({ where: { userId } }),
    ]);
    removed.storyLeads = leads.count;
    removed.metrics = metrics.count;
    removed.facts = facts.count;
    removed.marketUploads = uploads.count;
  }

  return Response.json({ ok: true, scope, removed });
}
