import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { extractOnDemand } from "@/lib/on-demand-extractor";
import { MetricFamily, type ScriptDataNeed } from "@/lib/script-data-resolver";

export const runtime = "nodejs";

function toStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

/**
 * Link a freshly-created fact to the plan server-side. On-demand facts are
 * `supporting_texture_only`, so the public PATCH link route (headline-safe only)
 * would silently drop them — this trusted path links them directly after a
 * scoped, owned extraction. Best-effort: a link failure never fails the search.
 */
async function linkFactToPlan(userId: string, planId: string, factId: string) {
  try {
    const plan = await prisma.contentPlan.findFirst({
      where: { id: planId, userId, deletedAt: null },
      select: { id: true, linkedFactIds: true },
    });
    if (!plan) return;
    const current = toStringArray(plan.linkedFactIds);
    if (current.includes(factId)) return;
    await prisma.contentPlan.updateMany({
      where: { id: plan.id, userId },
      data: { linkedFactIds: [...current, factId] },
    });
  } catch (err) {
    console.error("[script-data/extract] link to plan failed:", err);
  }
}

/**
 * Layer 3 endpoint — the member-triggered "Run data search". Authorizes via the
 * session (honouring impersonation), validates the requested need, then runs the
 * paid Layer 2 extractor. The authenticated user id ALWAYS overrides any
 * client-supplied memberId so a caller can never spend or extract against
 * someone else's data.
 */
const VALID_FAMILIES = new Set<string>(Object.values(MetricFamily));

/**
 * Server-authoritative per-request cost ceiling. The client may request a
 * LOWER cap, but never a higher one — otherwise a caller could send a huge
 * maxCostUsd to neuter the extractor's per-request gate. (The monthly hard cap
 * in getCostCapStatus is independently enforced server-side.)
 */
const SERVER_MAX_COST_USD = 1.0;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawNeed = (body.need ?? body) as Record<string, unknown>;

  const marketConfigId = asString(rawNeed.marketConfigId);
  const metricFamily = asString(rawNeed.metricFamily);
  if (!marketConfigId) {
    return NextResponse.json({ error: "marketConfigId is required" }, { status: 400 });
  }
  if (!metricFamily || !VALID_FAMILIES.has(metricFamily)) {
    return NextResponse.json({ error: "Invalid metricFamily" }, { status: 400 });
  }

  // Ownership: the marketConfig must belong to the caller. The extractor keys
  // data access off memberId today, but validate here so a future change can't
  // turn a client-supplied id into a cross-user data path.
  const ownsConfig = await prisma.marketConfig.findFirst({
    where: { id: marketConfigId, userId: user.id },
    select: { id: true },
  });
  if (!ownsConfig) {
    return NextResponse.json({ error: "Unknown marketConfig" }, { status: 403 });
  }

  const tw = (rawNeed.timeWindow ?? {}) as Record<string, unknown>;
  const startMonth = asString(tw.startMonth);
  const endMonth = asString(tw.endMonth);
  if (!startMonth || !endMonth) {
    return NextResponse.json(
      { error: "timeWindow.startMonth and timeWindow.endMonth are required" },
      { status: 400 },
    );
  }

  const need: ScriptDataNeed = {
    // SECURITY: never trust a client-supplied memberId — always the session user.
    memberId: user.id,
    marketConfigId,
    neighbourhood: asString(rawNeed.neighbourhood),
    propertyType: asString(rawNeed.propertyType),
    metricFamily: metricFamily as MetricFamily,
    timeWindow: { startMonth, endMonth },
  };

  // Clamp to the server ceiling: a client may request a tighter budget, never
  // a looser one. Caps the per-request gate regardless of what's sent.
  const requestedMax =
    typeof rawNeed.maxCostUsd === "number" && rawNeed.maxCostUsd > 0
      ? rawNeed.maxCostUsd
      : SERVER_MAX_COST_USD;
  const maxCostUsd = Math.min(requestedMax, SERVER_MAX_COST_USD);

  // Optional: when invoked from a plan's fact-gate banner, link the new fact so
  // a successful search immediately clears the gate on refresh.
  const planId = asString(body.planId);

  try {
    const outcome = await extractOnDemand({ need, maxCostUsd });
    if (planId && outcome.result.source === "on_demand_extraction") {
      await linkFactToPlan(user.id, planId, outcome.result.factId);
    }
    return NextResponse.json({
      result: outcome.result,
      softWarning: outcome.softWarning,
      estimatedCostUsd: outcome.estimatedCostUsd,
    });
  } catch (err) {
    console.error("[script-data/extract] extraction failed:", err);
    return NextResponse.json(
      { error: "Extraction failed. Please try again." },
      { status: 500 },
    );
  }
}
