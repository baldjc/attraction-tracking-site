/**
 * POST /api/member/content-planner/wizard/use-as-video
 *
 * "Use as Video" — turns a curated Story Lead directly into a ContentPlan,
 * SKIPPING idea generation entirely. The validator's Story Leads already carry
 * a thesis (`pattern`), the why-it-matters (→ `titlePromise`), the supporting
 * facts (resolved into `linkedFactIds`), the audience (`subPersonas`) and the
 * rotation slot (→ `theme`) — enough to start a script without a creative
 * detour through the 5-variant idea browser.
 *
 * No Claude call here — pure DB write + redirect. A zero-cost usage row is
 * logged so the AI-tool dashboards still see the event.
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags, isPlannerKillSwitchActiveForUser } from "@/lib/feature-flags";
import { getCostCapStatus, logUsage } from "@/lib/ai-tool-cost";
import { loadLeadVideoSeed } from "@/lib/content-engine-context";
import {
  ROTATION_SLOTS,
  rotationSlotToTheme,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import { getStatusOptions } from "@/lib/content-plan-utils";
import {
  parseDataThreadStrings,
  resolveStoryLeadDataThreadsToFactIds,
  type MatchConfidence,
} from "@/lib/story-lead-fact-resolver";

type FactsResolutionState =
  | "from_ids"
  | "from_textual_resolver"
  | "from_legacy_seed"
  | "unresolved";

export const runtime = "nodejs";

interface UseAsVideoBody {
  storyLeadId?: string;
}

export async function POST(req: NextRequest) {
  // Impersonation-aware so the plan is written under the impersonated member,
  // not the admin (mirrors the wizard save-idea route).
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = resolved.id;
  const userRole = resolved.role;

  // Launch-gate kill-switch — halts plan creation (this route mints a plan from
  // a Story Lead) per-member or globally without a DB restore. Non-destructive.
  if (await isPlannerKillSwitchActiveForUser(userId)) {
    return NextResponse.json(
      {
        error:
          "The Content Planner is temporarily paused while we roll out an update. Your existing plans and scripts are safe — please check back shortly.",
        code: "PLANNER_PAUSED",
      },
      { status: 423 },
    );
  }

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_content_engine_v2) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  // No AI cost is incurred on this path, but we honour the existing hard cap so
  // a capped member can't keep spinning up plans either way.
  const cap = await getCostCapStatus(userId);
  if (cap.hardBlocked) {
    return NextResponse.json(
      {
        error: "monthly_cost_cap_reached",
        message: `You've hit your $${cap.capUsd.toFixed(2)} monthly AI budget. It resets on the 1st of next month.`,
      },
      { status: 402 },
    );
  }

  let body: UseAsVideoBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.storyLeadId || typeof body.storyLeadId !== "string") {
    return NextResponse.json(
      { error: "missing_story_lead_id" },
      { status: 400 },
    );
  }

  const seed = await loadLeadVideoSeed(userId, body.storyLeadId);
  if (!seed) {
    return NextResponse.json({ error: "story_lead_not_found" }, { status: 404 });
  }

  // Required-field guard (mirrors the button's disabled state). The validator
  // always populates these, so this only trips on malformed/legacy leads.
  const rotationSlot =
    seed.lead.suggestedRotationSlot &&
    ROTATION_SLOTS.includes(seed.lead.suggestedRotationSlot as RotationSlotKey)
      ? (seed.lead.suggestedRotationSlot as RotationSlotKey)
      : null;
  if (!seed.lead.pattern || !seed.lead.whyItMatters || !rotationSlot) {
    return NextResponse.json(
      { error: "lead_missing_required_fields" },
      { status: 422 },
    );
  }

  // Fact carry-over (softened — never blocks). Story Leads persist their
  // supporting data as DISPLAY STRINGS in `dataThreads`, not as MarketFact PKs,
  // so a lead card can show real numbers while carrying zero fact ids. We
  // resolve facts in three steps and ALWAYS create the plan — auto-enrichment
  // (on Build Script) gets a second chance, so the member is never trapped:
  //   1. read PKs stored on the lead (new leads carry them) → "from_ids"
  //   2. else bridge the display dataThreads back to facts via the textual
  //      resolver → "from_textual_resolver"
  //   3. else fall back to the seed's neighbourhood-matched facts (legacy path)
  //   4. else create with zero facts → "unresolved" (banner + auto-enrichment)
  const leadRow = await prisma.marketStoryLead.findFirst({
    where: { id: seed.lead.id, userId },
    select: { anchorFactId: true, supportingFactIds: true, dataThreads: true },
  });

  let factIds: string[] = [];
  let factsResolutionState: FactsResolutionState = "unresolved";
  let resolutionConfidence: MatchConfidence | null = null;

  // Step 1 — fact PKs stored on the lead (validate they still exist & are ours).
  const storedPks = [
    ...(leadRow?.anchorFactId ? [leadRow.anchorFactId] : []),
    ...(Array.isArray(leadRow?.supportingFactIds)
      ? leadRow!.supportingFactIds
      : []),
  ];
  if (storedPks.length > 0) {
    // Scope-safety: validate against the LEAD'S OWN upload, not just the member.
    // A stale/miswritten PK that points at a different upload's fact must never
    // be linked — that would silently widen scope across uploads.
    const live = await prisma.marketFact.findMany({
      where: { ...EXCLUDE_LEGACY_FAILURE_RATE, id: { in: storedPks }, userId, uploadId: seed.uploadId },
      select: { id: true },
    });
    const liveIds = new Set(live.map((f) => f.id));
    const valid = storedPks.filter((id) => liveIds.has(id));
    if (valid.length > 0) {
      factIds = [...new Set(valid)];
      factsResolutionState = "from_ids";
    }
  }

  // Step 2 — textual resolver over the lead's display dataThreads. Anchor the
  // neighbourhood names against the member's ACTUAL fact neighbourhoods (not the
  // MarketConfig vocab) so it works even when the vocab is missing the hood —
  // that vocab gap is the original "resolves to zero" bug.
  if (factsResolutionState === "unresolved") {
    const threadStrings = Array.isArray(leadRow?.dataThreads)
      ? (leadRow!.dataThreads as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [];
    if (threadStrings.length > 0) {
      const hoodRows = await prisma.marketFact.findMany({
        where: { userId, uploadId: seed.uploadId },
        select: { neighbourhood: true },
        distinct: ["neighbourhood"],
      });
      const knownHoods = hoodRows
        .map((r) => r.neighbourhood)
        .filter((h): h is string => !!h && h.trim().length > 0);
      const threads = parseDataThreadStrings(threadStrings, knownHoods);
      const matches = await resolveStoryLeadDataThreadsToFactIds({
        memberId: userId,
        uploadId: seed.uploadId,
        dataThreads: threads,
      });
      if (matches.length > 0) {
        factIds = [...new Set(matches.map((m) => m.factId))];
        factsResolutionState = "from_textual_resolver";
        resolutionConfidence = weakestConfidence(matches.map((m) => m.confidence));
      }
    }
  }

  // Step 3 — legacy neighbourhood-broad fallback (what loadLeadVideoSeed already
  // resolved). Keeps leads whose hoods DO match the vocab working unchanged.
  if (factsResolutionState === "unresolved" && seed.factIds.length > 0) {
    factIds = [...new Set(seed.factIds)];
    factsResolutionState = "from_legacy_seed";
  }

  // Land on the leftmost status of the member's tier vocabulary ("Future Idea"
  // on growth/DWY, "Idea" on foundations) — same convention as save-idea.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { serviceTier: true },
  });
  const startingStatus = getStatusOptions(user?.serviceTier ?? "foundations")[0];

  const researchNotes = buildResearchNotes({
    subPersonas: seed.lead.subPersonas,
    leadSpansMultipleTypes: seed.leadSpansMultipleTypes,
    storyLeadId: seed.lead.id,
    sourceUploadId: seed.uploadId,
  });

  // Create the plan and claim the lead atomically (two fast writes — safe in an
  // interactive transaction, unlike the bulk validator persist).
  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.contentPlan.create({
      data: {
        userId,
        title: seed.lead.pattern,
        status: startingStatus,
        theme: rotationSlotToTheme(rotationSlot),
        rotationSlot,
        titlePromise: seed.lead.whyItMatters,
        linkedFactIds: factIds,
        linkedStoryLeadId: seed.lead.id,
        researchNotes,
        factsResolutionState,
        factsResolutionConfidence: resolutionConfidence,
        // From the lead's facts: ≥80% one type locks it; else null (Script
        // Builder v2 reads null as "All"), with the dual-audience flag noted
        // in researchNotes.
        propertyTypeFocus: seed.propertyTypeFocus,
      },
      select: { id: true },
    });
    // Non-clobbering claim: only stamp the lead if it isn't already claimed,
    // so the first plan minted from a lead stays its lineage source even if a
    // retry or a prior idea-save got there first. The plan→lead link
    // (`linkedStoryLeadId`) is set unconditionally above regardless.
    await tx.marketStoryLead.updateMany({
      where: { id: seed.lead.id, claimedByIdeaId: null },
      data: { claimedByIdeaId: created.id },
    });
    return created;
  });

  // Zero-cost usage row so dashboards count the "Use as Video" event.
  await logUsage(userId, "content_engine_v2_use_as_video", 0, 0);

  return NextResponse.json({
    id: plan.id,
    redirectUrl: `/member/content-planner/${plan.id}`,
  });
}

/** Most conservative (weakest) confidence across the resolver's matches. */
function weakestConfidence(
  confidences: MatchConfidence[],
): MatchConfidence | null {
  if (confidences.length === 0) return null;
  const rank = (c: MatchConfidence) =>
    c === "exact" ? 0 : c === "close" ? 1 : 2;
  return confidences.reduce((worst, c) =>
    rank(c) > rank(worst) ? c : worst,
  );
}

function buildResearchNotes(args: {
  subPersonas: string[];
  leadSpansMultipleTypes: boolean;
  storyLeadId: string;
  sourceUploadId: string;
}): string {
  const lines = [
    "## Created from Story Lead (Use as Video)",
    "",
    `**Sub-personas:** ${args.subPersonas.join(", ") || "—"}`,
  ];
  if (args.leadSpansMultipleTypes) {
    lines.push(
      "",
      "**Dual-audience:** This lead's facts span multiple property types — keep the script's audience framing consistent across types (no single type owns ≥80% of the facts).",
    );
  }
  lines.push("", "---", "");
  lines.push(`_Source upload: \`${args.sourceUploadId}\`_`);
  lines.push(`_Anchored on Story Lead: \`${args.storyLeadId}\`_`);
  return lines.join("\n");
}
