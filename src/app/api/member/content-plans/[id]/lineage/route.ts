/**
 * GET /api/member/content-plans/[id]/lineage
 *
 * Wave 2.5 — resolves the Wave 2 wizard lineage attached to a ContentPlan
 * so the planner detail modal can render the read-only "Idea card lineage"
 * panel without baking JOINs into the existing list/detail endpoints.
 *
 * Returns 404 when the plan doesn't exist or isn't owned by the caller.
 * Returns `lineage: null` when the plan was NOT created by the Wave 2 wizard
 * (i.e. rotationSlot is null) — the modal uses that as the signal to hide
 * the panel entirely. Story lead + facts are only fetched when present.
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import {
  ROTATION_SLOTS,
  metricNameToLabel,
  rotationSlotToTheme,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const plan = await prisma.contentPlan.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      rotationSlot: true,
      titlePromise: true,
      visualPeak: true,
      thumbnailWords: true,
      linkedFactIds: true,
      linkedStoryLeadId: true,
    },
  });
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Not a Wave 2 plan — modal hides the panel on `lineage: null`.
  if (!plan.rotationSlot) {
    return NextResponse.json({ lineage: null });
  }

  const slot = plan.rotationSlot as RotationSlotKey;
  const themeLabel = ROTATION_SLOTS.includes(slot)
    ? rotationSlotToTheme(slot)
    : String(plan.rotationSlot);

  // thumbnailWords is stored as the pipe-joined string the wizard saved.
  // Split it here so the client can render each callout as its own chip.
  const callouts = (plan.thumbnailWords ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Story lead — ownership filter in the query so a forged plan id can't
  // dredge up someone else's lead. Truncate whyItMatters to ~80 chars for
  // the panel preview (full text still lives in the wizard step 2A view).
  let storyLead: {
    id: string;
    pattern: string;
    whyItMattersPreview: string;
  } | null = null;
  if (plan.linkedStoryLeadId) {
    const lead = await prisma.marketStoryLead.findFirst({
      where: { id: plan.linkedStoryLeadId, userId: user.id },
      select: { id: true, pattern: true, whyItMatters: true },
    });
    if (lead) {
      const w = (lead.whyItMatters ?? "").trim();
      storyLead = {
        id: lead.id,
        pattern: lead.pattern,
        whyItMattersPreview:
          w.length > 80 ? w.slice(0, 80).trimEnd() + "…" : w,
      };
    }
  }

  // Cited facts — coerce JSON column to a string[] safely, ownership-filter
  // on the JOIN so a poisoned linkedFactIds array can't surface arbitrary
  // rows. Pull all that match (so the totalCited count is accurate) and
  // let the client decide how many to show + the "+N more" collapse.
  const factIds: string[] = Array.isArray(plan.linkedFactIds)
    ? (plan.linkedFactIds as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];

  const facts = factIds.length
    ? await prisma.marketFact.findMany({
        where: { id: { in: factIds }, userId: user.id },
        select: {
          id: true,
          neighbourhood: true,
          metricName: true,
          metricValue: true,
          metricValueString: true,
          dateContext: true,
        },
      })
    : [];

  // Order facts to match the persisted linkedFactIds order so the panel
  // shows the citations in the order Claude originally returned them
  // (prisma.findMany doesn't guarantee input order).
  const orderIndex = new Map(factIds.map((id, i) => [id, i]));
  facts.sort(
    (a, b) =>
      (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );

  // Use UTC month + year so a fact dated 2026-04-30 23:00 UTC doesn't render
  // as "March 2026" for callers in a positive-UTC-offset locale.
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  function formatMonthYear(d: Date | null): string {
    if (!d) return "";
    return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  const factsResolved = facts.map((f) => ({
    id: f.id,
    neighbourhood: f.neighbourhood,
    metricName: f.metricName,
    // Wave 2.5 — pre-labelled metric so the planner modal doesn't have to
    // duplicate the enum->label map client-side.
    metricLabel: metricNameToLabel(f.metricName),
    // metricValueString is often null on numeric facts; fall back to the
    // raw numeric so the panel always shows a value when one exists.
    // Strict equality vs null because metricValue can legitimately be 0.
    metricValueString:
      f.metricValueString ??
      (f.metricValue !== null && f.metricValue !== undefined
        ? String(f.metricValue)
        : ""),
    // dateContext is the actual fact date. (timeWindow is a category
    // string like "calendar_month" — NOT a date — so it must not be
    // surfaced here.) Render as "Month Year" for the modal.
    monthYear: formatMonthYear(f.dateContext),
  }));

  return NextResponse.json({
    lineage: {
      rotationSlot: slot,
      themeLabel,
      titlePromise: plan.titlePromise,
      visualPeak: plan.visualPeak,
      thumbnailCallouts: callouts,
      storyLead,
      facts: factsResolved,
      totalCited: factIds.length,
    },
  });
}
