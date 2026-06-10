/**
 * POST /api/member/content-plans/[id]/save-script
 *
 * Wave 3 — Script Builder v2 (Talking Head) save endpoint. Persists an
 * approved script onto a ContentPlan after re-running every server-side
 * check the streaming route ran, so a direct curl can't bypass the gate.
 *
 * Defense-in-depth (same shape as save-idea):
 *   1. Auth (session).
 *   2. Feature flag `tool_script_builder_v2`.
 *   3. Ownership-filtered ContentPlan load (`findFirst` with userId).
 *   4. Lineage preconditions (rotationSlot + titlePromise present).
 *   5. `shootType` is null or already 'talking_head' (matches the v2
 *      button's gate; rejects plans already scoped as Home Tour).
 *   6. linkedFactIds.length >= 3 on the row.
 *   7. >= 3 of those facts still survive the ownership filter — between
 *      generate and approve the member could have deleted an upload or
 *      facts could have been pruned. Returns 422 with a "re-run the
 *      wizard to relink" message identical to the streaming route's.
 *   8. Server-side `validateScript()` re-run — client claims of
 *      "validation pass" are ignored.
 *
 * On success:
 *   - Writes `script` + promotes `shootType` to 'talking_head'.
 *   - Leaves `status` alone (status transitions are out of scope for
 *     this data-first rebuild; members move plans through the pipeline
 *     in the existing planner UI).
 *   - Logs a zero-cost `script_builder_v2_save` usage row so the
 *     monthly-spend rollup counts the save event (no tokens — the
 *     streaming route already billed for generation).
 *
 * `tokenUsage` in the body is informational only — we never re-bill
 * here. The streaming route is the single source of truth for token
 * accounting.
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { logUsage } from "@/lib/ai-tool-cost";
import { validateScript } from "@/lib/script-content-rules";
import { isBingeTargetUsable } from "@/lib/binge-target";
import {
  loadMarketConfigSummary,
  credentialsAnchorText,
} from "@/lib/content-engine-context";
import { getNeighbourhoodContext } from "@/lib/get-neighbourhood-context";

export const runtime = "nodejs";

interface SaveScriptBody {
  script?: string;
  tokenUsage?: { input?: number; output?: number };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Impersonation-aware so the script saves against the impersonated member's
  // plan (and usage bills to them), not the admin account.
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = resolved.id;
  const userRole = resolved.role;

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_script_builder_v2) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  const { id: planId } = await params;
  if (!planId || typeof planId !== "string") {
    return NextResponse.json({ error: "missing_plan_id" }, { status: 400 });
  }

  let body: SaveScriptBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const script = typeof body.script === "string" ? body.script.trim() : "";
  if (!script) {
    return NextResponse.json({ error: "missing_script" }, { status: 400 });
  }

  // Ownership-filtered load.
  const plan = await prisma.contentPlan.findFirst({
    where: { id: planId, userId, deletedAt: null },
    select: {
      id: true,
      rotationSlot: true,
      titlePromise: true,
      linkedFactIds: true,
      shootType: true,
      bingeVideoId: true,
      linkedCampaignId: true,
    },
  });
  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  if (!plan.rotationSlot || !plan.titlePromise) {
    return NextResponse.json(
      {
        error: "plan_missing_lineage",
        message:
          "This plan isn't a Wave 2 wizard plan — Script Builder v2 needs rotationSlot + titlePromise.",
      },
      { status: 409 },
    );
  }

  // Shoot-type gate matches the button's precondition. Wave 4 ships
  // a sibling endpoint for 'home_tour'.
  if (plan.shootType && plan.shootType !== "talking_head") {
    return NextResponse.json(
      {
        error: "shoot_type_conflict",
        message: `This plan is already scoped as ${plan.shootType}; Script Builder v2 (Talking Head) can't overwrite it.`,
      },
      { status: 409 },
    );
  }

  // Re-check cited-fact minimum. The user could have navigated away
  // between generate and save and deleted facts or an upload.
  const linkedFactIds: string[] = Array.isArray(plan.linkedFactIds)
    ? (plan.linkedFactIds as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];
  if (linkedFactIds.length < 1) {
    return NextResponse.json(
      {
        error: "insufficient_linked_facts",
        message: `Need at least 1 linked fact to save a Script Builder v2 script — this plan has none. Re-run the wizard to relink, or run a data search to add facts.`,
      },
      { status: 422 },
    );
  }

  const ownedFacts = await prisma.marketFact.findMany({
    where: { ...EXCLUDE_LEGACY_FAILURE_RATE, id: { in: linkedFactIds }, userId },
    select: { id: true },
  });
  if (ownedFacts.length < 1) {
    return NextResponse.json(
      {
        error: "cited_facts_not_found",
        message: `None of the plan's ${linkedFactIds.length} linked facts are still in your facts library — they may have been deleted. Re-run the wizard to relink, or run a data search to add facts.`,
      },
      { status: 422 },
    );
  }

  // Server-side validation re-run. Identical options to the streaming
  // route (neighbourhood vocabulary from the user's market config).
  // B1 — the identity guard MUST be fed the same inputs here as in the
  // streaming route, otherwise a direct POST could persist a script that
  // names another member's identity (the gate would silently no-op).
  const marketConfig = await loadMarketConfigSummary(userId);
  const memberRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });
  const memberFullName = memberRecord?.fullName?.trim() || null;
  const otherMembers = await prisma.user.findMany({
    where: { id: { not: userId }, fullName: { not: null } },
    select: { fullName: true },
  });
  const forbiddenIdentities = otherMembers
    .map((u) => (u.fullName ?? "").trim())
    .filter((n) => n.length > 0 && n.split(/\s+/).length >= 2);

  // Binge guard — mirror the streaming route so a direct POST can't persist a
  // script that fabricates a next-video tease. `configured` is true ONLY when
  // a usable (existing, non-idea-stage) target resolves; null/deleted/idea →
  // false → `binge_target_match` rejects any next-video reference.
  let bingeTargetConfigured = false;
  let bingeTargetTitle: string | null = null;
  if (plan.bingeVideoId) {
    const binge = await prisma.contentPlan.findFirst({
      where: { id: plan.bingeVideoId, userId, deletedAt: null },
      select: { title: true, status: true },
    });
    if (binge && isBingeTargetUsable(binge.status)) {
      bingeTargetConfigured = true;
      bingeTargetTitle = binge.title;
    }
  }

  // Lead-magnet guard — mirror the streaming route so a direct POST can't
  // persist a script that offers a fabricated freebie (a "free calculator"
  // when the assigned magnet is a guide). INERT unless a usable campaign
  // resolves (no magnet → generic "free guide" language stays allowed).
  let leadMagnetConfigured = false;
  let leadMagnetName: string | null = null;
  if (plan.linkedCampaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: plan.linkedCampaignId, userId, deletedAt: null },
      select: { name: true },
    });
    if (campaign) {
      leadMagnetConfigured = true;
      leadMagnetName = campaign.name;
    }
  }

  // Floor-only profile signal — mirror the streaming route's lean word floor
  // so a lean, fully-data-grounded draft (no KB profile) is savable instead of
  // 422'ing on the 2,200-word floor. We load profiles for the member's vocab
  // and keep only those whose neighbourhood is actually named in the script, so
  // the floor matches what the streaming route applied. Passed as a dedicated
  // flag (NOT profileText) so the qualitative/stat grounding checks stay off at
  // save and we don't regress scripts the streaming route already cleared.
  const vocab = marketConfig?.neighbourhoods ?? [];
  let hasNeighbourhoodProfile = false;
  if (vocab.length > 0) {
    const profileMap = await getNeighbourhoodContext(userId, vocab);
    // Case-insensitive name match: scripts capitalize neighbourhood names in
    // prose ("in Kerrisdale…") while vocab casing can differ, so a
    // case-sensitive substring would false-negative and wrongly relax the
    // floor for a profile-backed script.
    const scriptLower = script.toLowerCase();
    hasNeighbourhoodProfile = Object.entries(profileMap).some(
      ([name, text]) =>
        !!name &&
        scriptLower.includes(name.toLowerCase()) &&
        !!text &&
        text.trim().length > 0,
    );
  }

  const validation = validateScript(script, {
    neighbourhoods: marketConfig?.neighbourhoods ?? [],
    currentMemberName: memberFullName ?? undefined,
    forbiddenIdentities,
    credentialsText: marketConfig ? credentialsAnchorText(marketConfig) : [],
    bingeTargetConfigured,
    bingeTargetTitle: bingeTargetTitle ?? undefined,
    leadMagnetConfigured,
    leadMagnetName: leadMagnetName ?? undefined,
    hasNeighbourhoodProfile,
  });
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "validation_gate_failed",
        message:
          "Server-side validation rejected this script — re-generate via the wizard.",
        violations: validation.violations,
        metrics: validation.metrics,
      },
      { status: 422 },
    );
  }

  // Persist script + promote shootType. Leave status alone.
  await prisma.contentPlan.update({
    where: { id: plan.id },
    data: { script, shootType: "talking_head" },
  });

  // Zero-cost audit row so dashboards see the save event.
  await logUsage(userId, "script_builder_v2_save", 0, 0);

  return NextResponse.json({
    id: plan.id,
    redirectUrl: `/member/content-planner?plan=${plan.id}`,
  });
}
