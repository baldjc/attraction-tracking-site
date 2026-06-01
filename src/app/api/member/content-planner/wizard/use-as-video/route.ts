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
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getCostCapStatus, logUsage } from "@/lib/ai-tool-cost";
import { loadLeadVideoSeed } from "@/lib/content-engine-context";
import {
  ROTATION_SLOTS,
  rotationSlotToTheme,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import { getStatusOptions } from "@/lib/content-plan-utils";

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

  // Fact carry-over guard. `loadLeadVideoSeed` resolves the lead's facts by
  // matching its named neighbourhoods back to the upload — a lead whose hoods
  // no longer match any headline-safe fact (e.g. the upload was re-validated
  // and those rows got reclassified) resolves to zero facts. Minting a plan
  // with zero linked facts only to dead-end at the Script Builder gate is a
  // worse experience than failing here with guidance, so block at the source.
  // De-dupe defensively so a fact can never be double-counted toward the gate.
  const factIds = [...new Set(seed.factIds)];
  if (factIds.length === 0) {
    return NextResponse.json(
      {
        error: "lead_resolved_zero_facts",
        message:
          "This Story Lead didn't resolve to any linked facts — its neighbourhoods don't match any current market data. Link facts to a plan manually, or run a fresh data search before turning it into a video.",
      },
      { status: 422 },
    );
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
