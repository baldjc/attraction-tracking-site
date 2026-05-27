import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { renderResearchBrief } from "@/lib/neighbourhood-research-brief";

/**
 * GET /api/member/knowledge-base/research-brief
 *
 * Returns the parameterized neighbourhood deep-research brief, rendered with
 * the member's market name (best-effort — falls back to the raw template when
 * they haven't set a market yet). Used by the Onboarding Wizard Step 6 "Copy
 * Research Brief" button so the prompt can be pasted into Manus / Perplexity.
 */
export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const cfg = await prisma.marketConfig.findUnique({
    where: { userId: user.id },
    select: { marketName: true, mlsSource: true, neighbourhoodVocab: true },
  });

  // We pass an empty list when neighbourhoodVocab isn't populated yet — the
  // template just renders without a pre-seeded list and the AI tool can do
  // discovery.
  const brief = renderResearchBrief({
    marketName:
      cfg?.marketName && cfg.marketName !== "(pending)"
        ? cfg.marketName
        : "your market",
    mlsSource: cfg?.mlsSource || "your MLS",
    neighbourhoods: extractNeighbourhoods(cfg?.neighbourhoodVocab),
    spelling: "Canadian",
  });

  return Response.json({ brief });
}

function extractNeighbourhoods(vocab: unknown): string[] {
  if (Array.isArray(vocab)) {
    return vocab.filter((v): v is string => typeof v === "string");
  }
  if (vocab && typeof vocab === "object") {
    const v = vocab as Record<string, unknown>;
    if (Array.isArray(v.list)) {
      return v.list.filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(v.neighbourhoods)) {
      return v.neighbourhoods.filter((x): x is string => typeof x === "string");
    }
  }
  return [];
}
