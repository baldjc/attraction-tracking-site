/**
 * GET /api/member/dashboard/briefing
 *
 * The data behind the Dashboard "monthly briefing" front door. This surfaces
 * the member's **Story Leads** — the SAME `MarketStoryLead` pool that powers the
 * wizard's "Browse Story Leads" page (Step 2A) — picking 3 to feature on the
 * dashboard with a spread across rotation slots (so the briefing isn't three
 * variations of the same angle).
 *
 * Story Leads are minted deterministically during market-data validation, so
 * this endpoint is a cheap read — NO Claude call, no per-month generation, no
 * cache. That also fixes the previous under-surfacing: the old LLM path could
 * return fewer than 3 cards when generation under-produced, even though the
 * member's lead pool was larger.
 *
 * Impersonation-aware (resolveUserFromSession): an admin viewing a member's
 * dashboard sees THAT member's leads.
 *
 * Read-only — this never proposes, publishes, or saves anything.
 *
 * Empty-state (`{ empty: true, reason }`) when the member has no validated
 * upload or no Story Leads on it. The dashboard renders a "set up your market
 * data" prompt in that case.
 */
import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { withRouteErrorHandling } from "@/lib/api-error-wrapper";
import { loadLatestValidatedUpload } from "@/lib/content-engine-context";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";

export const runtime = "nodejs";

/** How many leads the dashboard features. The rest are reachable via the
 *  "Browse all N leads" link to the wizard's Story Lead browser. */
const BRIEFING_IDEA_COUNT = 3;

/** Where "Browse all N leads" points — the wizard's Story Lead browser. */
const BROWSE_HREF = "/member/content-planner/wizard?step=2a";

interface FactChip {
  stat: string;
  label: string;
  source: string;
}

interface BriefingIdea {
  index: number;
  /** The MarketStoryLead PK — lets "Build a script" hand the real lead to
   *  Jarvis and lets the card deep-link into the wizard for this lead. */
  leadId: string;
  title: string;
  why: string;
  fact: FactChip | null;
  /** The underlying data pattern + supporting threads, surfaced behind
   *  "See thinking" so the member can see what the lead is grounded in. */
  pattern: string;
  dataThreads: string[];
  rotationSlot: string | null;
  isThesis: boolean;
}

export type LeadRow = {
  id: string;
  pattern: string;
  dataThreads: unknown;
  whyItMatters: string;
  suggestedRotationSlot: string | null;
  label: string | null;
  isThesisLead: boolean;
  anchorFactId: string | null;
};

function parseStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** A short, human title for a lead — its explicit label, else the first
 *  sentence of the pattern, bounded so the card stays tidy. */
function leadTitle(lead: LeadRow): string {
  if (lead.label && lead.label.trim()) return lead.label.trim();
  const firstSentence = lead.pattern.split(".")[0]?.trim() ?? lead.pattern;
  return firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}…` : firstSentence;
}

/**
 * Pick `count` leads spread across distinct rotation slots so the briefing
 * shows different *kinds* of story, not three takes on the same angle. The
 * input is already ordered thesis-first, so the thesis lead is featured first.
 *
 * First pass takes one lead per *distinct non-null slot*, plus at most ONE
 * slotless lead — otherwise a member whose leads are mostly slotless (an older
 * generation) could fill every spot with null-slot leads and starve the
 * distinct slotted leads that appear later in the ordered list. A fill pass
 * then tops up from whatever remains (slotless or repeat-slot) when there
 * weren't enough distinct slots to reach `count`.
 */
export function pickSpread(leads: LeadRow[], count: number): LeadRow[] {
  const selected: LeadRow[] = [];
  const usedSlots = new Set<string>();
  let tookSlotless = false;
  for (const lead of leads) {
    if (selected.length >= count) break;
    const slot = lead.suggestedRotationSlot;
    if (slot) {
      if (usedSlots.has(slot)) continue;
      usedSlots.add(slot);
    } else {
      if (tookSlotless) continue;
      tookSlotless = true;
    }
    selected.push(lead);
  }
  if (selected.length < count) {
    const chosen = new Set(selected.map((l) => l.id));
    for (const lead of leads) {
      if (selected.length >= count) break;
      if (!chosen.has(lead.id)) selected.push(lead);
    }
  }
  return selected;
}

/** "~X minutes" to consider the briefing — ~1.5 min per idea, floored at 2. */
function estReadMinutes(ideaCount: number): number {
  return Math.max(2, Math.round(ideaCount * 1.5));
}

export const GET = withRouteErrorHandling("member/dashboard/briefing", GET_impl);

async function GET_impl() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  // ── Prerequisites — degrade to an empty-state rather than erroring ──
  const upload = await loadLatestValidatedUpload(userId);
  if (!upload) {
    return NextResponse.json({ empty: true, reason: "no_validated_upload" });
  }

  // ── The Story Lead pool — identical source + ordering to the wizard's
  //    "Browse Story Leads" page so the dashboard features a subset of the
  //    exact same leads. ───────────────────────────────────────────────
  const leads: LeadRow[] = await prisma.marketStoryLead.findMany({
    where: { userId, uploadId: upload.id },
    orderBy: [{ isThesisLead: "desc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      pattern: true,
      dataThreads: true,
      whyItMatters: true,
      suggestedRotationSlot: true,
      label: true,
      isThesisLead: true,
      anchorFactId: true,
    },
  });

  if (leads.length === 0) {
    return NextResponse.json({ empty: true, reason: "no_story_leads" });
  }

  const featured = pickSpread(leads, BRIEFING_IDEA_COUNT);

  // ── Resolve fact chips from each featured lead's anchor fact ─────────
  const anchorIds = featured
    .map((l) => l.anchorFactId)
    .filter((x): x is string => typeof x === "string" && x.length > 0);
  const factRows = anchorIds.length
    ? await prisma.marketFact.findMany({
        where: { id: { in: anchorIds } },
        select: {
          id: true,
          metricValue: true,
          metricValueString: true,
          metricName: true,
          propertyType: true,
          neighbourhood: true,
          sourceTitle: true,
        },
      })
    : [];
  const factById = new Map(factRows.map((f) => [f.id, f]));

  const ideas: BriefingIdea[] = featured.map((lead, i) => {
    const f = lead.anchorFactId ? factById.get(lead.anchorFactId) : undefined;
    const statText =
      f?.metricValueString?.trim() ||
      (typeof f?.metricValue === "number" ? String(f.metricValue) : "");
    const chip: FactChip | null = f && statText
      ? {
          stat: statText,
          // Carry the property-type segment so a per-type cut (e.g. citywide
          // Detached MOI) never reads as the bare all-types overall.
          // Order: metric · segment · neighbourhood.
          label: [f.metricName, f.propertyType, f.neighbourhood]
            .filter((p): p is string => !!p && p.trim().length > 0)
            .join(" · "),
          source: (f.sourceTitle && f.sourceTitle.trim()) || upload.label,
        }
      : null;
    return {
      index: i + 1,
      leadId: lead.id,
      title: leadTitle(lead),
      why: lead.whyItMatters,
      fact: chip,
      pattern: lead.pattern,
      dataThreads: parseStringList(lead.dataThreads),
      rotationSlot: lead.suggestedRotationSlot,
      isThesis: lead.isThesisLead,
    };
  });

  // Distinct member data sources + a real headline-safe fact count for the
  // briefing meta row.
  const [distinctSources, factsValidated] = await Promise.all([
    prisma.marketFact.findMany({
      where: { uploadId: upload.id, usageClass: "headline_safe", ...EXCLUDE_LEGACY_FAILURE_RATE },
      select: { sourceTitle: true },
      distinct: ["sourceTitle"],
    }),
    prisma.marketFact.count({
      where: { uploadId: upload.id, usageClass: "headline_safe", ...EXCLUDE_LEGACY_FAILURE_RATE },
    }),
  ]);
  const sources = distinctSources
    .map((r) => r.sourceTitle)
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  const resolvedSources = sources.length > 0 ? sources : [upload.label];

  return NextResponse.json({
    empty: false,
    monthYear: upload.monthYear,
    monthLabel: monthLabelFromMonthYear(upload.monthYear),
    factsValidated,
    sources: resolvedSources,
    ideas,
    estReadMinutes: estReadMinutes(ideas.length),
    totalLeads: leads.length,
    browseHref: BROWSE_HREF,
  });
}

/** "2026-04" → "April 2026"; passes anything non-YYYY-MM through unchanged. */
function monthLabelFromMonthYear(monthYear: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthYear.trim());
  if (!m) return monthYear;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return monthYear;
  const d = new Date(year, monthIdx, 1);
  return d.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
}
