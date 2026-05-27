/**
 * POST /api/member/content-planner/wizard/save-idea
 *
 * Wave 2 — Content Engine v2 wizard, Step 4. Persists a picked idea card as
 * a ContentPlan row with full lineage (cited facts, story lead, rotation
 * slot, title promise, visual peak, tactile type, etc.).
 *
 * No Claude call here — pure DB persistence with a belt-and-braces
 * re-validation of the card so a direct curl can't bypass the gate that
 * already ran in /api/ai-tools/content-engine-v2.
 *
 * Cost is logged as `content_engine_v2_save` with zero tokens so the
 * monthly-spend rollup stays accurate (zero $, but still counted).
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getCostCapStatus, logUsage } from "@/lib/ai-tool-cost";
import {
  extractNeighbourhoodList,
  loadStoryLead,
} from "@/lib/content-engine-context";
import {
  ROTATION_SLOTS,
  rotationSlotToTheme,
  validateIdeaCard,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";

export const runtime = "nodejs";

interface SaveIdeaBody {
  title?: string;
  rotationSlot?: RotationSlotKey;
  titlePromise?: string;
  clarityPremise?: string;
  thumbnailCallouts?: string[];
  visualPeak?: string;
  subPersonas?: string[];
  framework?: string;
  tactileType?: string;
  estimatedRuntime?: string;
  whyItWorks?: string;
  citedFactIds?: string[];
  storyLeadId?: string | null;
  sourceUploadId?: string;
  propertyTypeFocus?: string | null;
}

const ALLOWED_PROPERTY_TYPE_FOCUS = new Set([
  "Detached",
  "Row/Townhouse",
  "Semi-Detached",
  "Apartment",
  "All",
]);

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  const userRole = session?.user?.role ?? null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_content_engine_v2) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

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

  let body: SaveIdeaBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Required: sourceUploadId — we need it to ownership-verify the cited facts.
  if (!body.sourceUploadId || typeof body.sourceUploadId !== "string") {
    return NextResponse.json(
      { error: "missing_source_upload_id" },
      { status: 400 },
    );
  }

  // Verify the upload belongs to this user and is validated.
  const upload = await prisma.marketDataUpload.findFirst({
    where: { id: body.sourceUploadId, userId, status: "validated" },
    select: { id: true },
  });
  if (!upload) {
    return NextResponse.json(
      { error: "source_upload_not_found_or_unowned" },
      { status: 404 },
    );
  }

  // Ownership-verify cited facts. We pull only the user's own headline-safe
  // facts on this upload — anything else gets dropped silently (would have
  // been a hallucination by the model). If <3 valid remain, 422.
  const citedIds = Array.isArray(body.citedFactIds)
    ? body.citedFactIds.filter((x): x is string => typeof x === "string")
    : [];
  const ownedFacts = citedIds.length
    ? await prisma.marketFact.findMany({
        where: {
          id: { in: citedIds },
          userId,
          uploadId: body.sourceUploadId,
          usageClass: "headline_safe",
        },
        select: { id: true },
      })
    : [];
  const validFactIds = ownedFacts.map((f) => f.id);
  if (validFactIds.length < 3) {
    return NextResponse.json(
      {
        error: "insufficient_valid_facts",
        message: `Need ≥3 cited facts that belong to your validated upload; got ${validFactIds.length} valid out of ${citedIds.length} cited.`,
      },
      { status: 422 },
    );
  }

  // Verify story lead ownership if one was passed.
  if (body.storyLeadId) {
    const lead = await loadStoryLead(userId, body.storyLeadId);
    if (!lead) {
      return NextResponse.json(
        { error: "story_lead_not_found" },
        { status: 404 },
      );
    }
  }

  // Re-run the validation gate as defense in depth. Build the candidate card
  // from the request body in the same shape `validateIdeaCard` expects.
  const config = await prisma.marketConfig.findUnique({
    where: { userId },
    select: { neighbourhoodVocab: true },
  });
  const neighbourhoods = extractNeighbourhoodList(
    config?.neighbourhoodVocab ?? null,
  );
  const candidate = {
    title: body.title,
    rotationSlot: body.rotationSlot,
    titlePromise: body.titlePromise,
    clarityPremise: body.clarityPremise,
    thumbnailCallouts: body.thumbnailCallouts,
    visualPeak: body.visualPeak,
    subPersonas: body.subPersonas,
    framework: body.framework,
    tactileType: body.tactileType,
    estimatedRuntime: body.estimatedRuntime,
    whyItWorks: body.whyItWorks,
    citedFactIds: validFactIds,
  };
  const headlineSafeSet = new Set(validFactIds);
  const gate = validateIdeaCard(candidate, headlineSafeSet, neighbourhoods);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "validation_gate_failed", errors: gate.errors },
      { status: 422 },
    );
  }

  if (!body.rotationSlot || !ROTATION_SLOTS.includes(body.rotationSlot)) {
    return NextResponse.json(
      { error: "invalid_rotation_slot", allowed: ROTATION_SLOTS },
      { status: 400 },
    );
  }

  // Compose a researchNotes blob that captures the parts of the idea card
  // that don't have a first-class column on ContentPlan. Markdown so the
  // existing planner detail view renders it cleanly.
  //
  // DEVIATION (Wave 2 ship-or-iterate trade-off): clarityPremise, framework,
  // tactileType, subPersonas, estimatedRuntime, and whyItWorks live inside
  // this Markdown blob because ContentPlan has no first-class columns for
  // them and we agreed to hold back schema additions in this wave. Wave 3
  // design will promote these to nullable columns and ship a one-shot
  // backfill script to re-parse this blob on existing rows. See
  // `Attraction Tracking Site Build Out/Data-First-Rebuild/Wave-2-Known-Issues.md`.
  const researchNotes = buildResearchNotes({
    clarityPremise: body.clarityPremise!,
    framework: body.framework!,
    tactileType: body.tactileType!,
    subPersonas: body.subPersonas ?? [],
    estimatedRuntime: body.estimatedRuntime,
    whyItWorks: body.whyItWorks,
    storyLeadId: body.storyLeadId ?? null,
    sourceUploadId: body.sourceUploadId,
  });

  const plan = await prisma.contentPlan.create({
    data: {
      userId,
      title: body.title!,
      status: "Idea",
      // Wave 2.5 — also write the human-readable theme string so this plan
      // shows up in v1 planner views that filter by theme. `rotationSlot`
      // (machine-readable enum) remains the source of truth for the wizard.
      theme: rotationSlotToTheme(body.rotationSlot),
      rotationSlot: body.rotationSlot,
      titlePromise: body.titlePromise,
      visualPeak: body.visualPeak,
      thumbnailWords: (body.thumbnailCallouts ?? []).join(" | ") || null,
      linkedFactIds: validFactIds,
      linkedStoryLeadId: body.storyLeadId ?? null,
      researchNotes,
      // Wave 4 — per-plan propertyType focus (Script Builder v2 lock).
      // Whitelisted to known values; anything else collapses to null
      // (which Script Builder v2 interprets as "All" / no lock).
      propertyTypeFocus:
        body.propertyTypeFocus &&
        ALLOWED_PROPERTY_TYPE_FOCUS.has(body.propertyTypeFocus)
          ? body.propertyTypeFocus
          : null,
    },
    select: { id: true },
  });

  // Zero-cost log row so the AI-tool usage dashboards still see a "save"
  // event even though no Claude call happened on this leg.
  await logUsage(userId, "content_engine_v2_save", 0, 0);

  return NextResponse.json({
    id: plan.id,
    redirectUrl: `/member/content-planner?plan=${plan.id}`,
  });
}

function buildResearchNotes(args: {
  clarityPremise: string;
  framework: string;
  tactileType: string;
  subPersonas: string[];
  estimatedRuntime?: string;
  whyItWorks?: string;
  storyLeadId: string | null;
  sourceUploadId: string;
}): string {
  const lines = [
    "## Wave 2 idea card",
    "",
    `**Clarity premise:** ${args.clarityPremise}`,
    "",
    `**Framework:** ${args.framework}`,
    `**Tactile type:** ${args.tactileType}`,
    `**Sub-personas:** ${args.subPersonas.join(", ") || "—"}`,
  ];
  if (args.estimatedRuntime) {
    lines.push(`**Estimated runtime:** ${args.estimatedRuntime}`);
  }
  if (args.whyItWorks) {
    lines.push("", `**Why it works:** ${args.whyItWorks}`);
  }
  lines.push("", "---", "");
  lines.push(`_Source upload: \`${args.sourceUploadId}\`_`);
  if (args.storyLeadId) {
    lines.push(`_Anchored on Story Lead: \`${args.storyLeadId}\`_`);
  }
  return lines.join("\n");
}
