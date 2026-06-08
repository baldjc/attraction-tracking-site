/**
 * GET /api/member/dashboard/briefing
 *
 * The data behind the Dashboard "monthly briefing" front door. For the
 * member's latest validated upload we surface exactly 3 grounded story ideas
 * — generated ONCE per (member, month) via the shared Content Engine loop and
 * cached in `MonthlyBriefing`. Subsequent loads read the cache (no Claude
 * call), so the dashboard is cheap + stable for the whole month.
 *
 * Impersonation-aware (resolveUserFromSession): an admin viewing a member's
 * dashboard sees + generates THAT member's briefing, attributed to the member.
 *
 * Read-only from the member's perspective — this never proposes, publishes, or
 * saves anything into the planner. The only write is the briefing cache row.
 *
 * Empty-state (`{ empty: true, reason }`) when the member has no validated
 * upload, no market config, fewer than 3 headline-safe facts, or generation
 * couldn't produce a valid card. The dashboard renders a "set up your market
 * data" prompt in that case.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { withRouteErrorHandling } from "@/lib/api-error-wrapper";
import { logUsage } from "@/lib/ai-tool-cost";
import {
  loadLatestValidatedUpload,
  loadHeadlineSafeFacts,
  loadMarketConfigSummary,
  type CompactFact,
} from "@/lib/content-engine-context";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";
import { runIdeaGenerationLoop } from "@/lib/content-engine-generate";
import type { IdeaCard } from "@/lib/content-engine-validation";

export const runtime = "nodejs";
export const maxDuration = 120;

const BRIEFING_IDEA_COUNT = 3;
const FACTS_LIMIT = 120;
/** A claimed-but-unfinished briefing older than this is treated as abandoned
 *  (e.g. the generating request was killed) and may be taken over. */
const STALE_CLAIM_MS = 5 * 60 * 1000;

/** A briefing row is only a real cache hit once it holds at least one idea —
 *  an empty `ideas` array means "claimed, generation in flight". */
function ideasReady(row: { ideas: unknown } | null | undefined): boolean {
  return !!row && Array.isArray(row.ideas) && (row.ideas as unknown[]).length > 0;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

interface FactChip {
  stat: string;
  label: string;
  source: string;
}

interface BriefingIdea {
  index: number;
  title: string;
  why: string;
  fact: FactChip | null;
  /** Powers the "See thinking" inline expand — the model's own reasoning. */
  thinking: {
    clarityPremise: string;
    titlePromise: string;
    whyItWorks: string;
  };
  citedFactIds: string[];
  rotationSlot: string;
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
  const config = await loadMarketConfigSummary(userId);
  if (!config) {
    return NextResponse.json({ empty: true, reason: "no_market_config" });
  }

  const monthLabel = monthLabelFromMonthYear(upload.monthYear);

  const monthYear = upload.monthYear;
  const cacheKey = { userId_monthYear: { userId, monthYear } };
  const okResponse = (row: {
    factsValidated: number;
    sources: unknown;
    ideas: unknown;
    generatedAt: Date;
  }) =>
    NextResponse.json({
      empty: false,
      monthYear,
      monthLabel,
      factsValidated: row.factsValidated,
      sources: Array.isArray(row.sources)
        ? (row.sources as unknown[]).filter((s): s is string => typeof s === "string")
        : [],
      ideas: row.ideas as unknown as BriefingIdea[],
      estReadMinutes: estReadMinutes((row.ideas as unknown as BriefingIdea[]) ?? []),
      cachedAt: row.generatedAt,
    });
  const pendingResponse = () =>
    NextResponse.json({ empty: true, reason: "generating", monthYear, monthLabel });

  // ── Cache hit: same member, same month, same upload, real ideas ──
  const cached = await prisma.monthlyBriefing.findUnique({ where: cacheKey });
  if (cached && cached.uploadId === upload.id && ideasReady(cached)) {
    return okResponse(cached);
  }

  const facts = await loadHeadlineSafeFacts(upload.id, monthYear, {
    limit: FACTS_LIMIT,
  });
  if (facts.length < 3) {
    return NextResponse.json({ empty: true, reason: "no_headline_safe_facts" });
  }

  // ── Single-flight claim ─────────────────────────────────────────────
  // Generation is a ~50s, multi-call Claude job. The @@unique([userId,
  // monthYear]) index lets exactly one concurrent cold request "win" a
  // placeholder insert (empty ideas). Losers don't generate — they return a
  // `generating` pending state and the client retries. This is what makes the
  // job idempotent + prevents duplicate Claude spend / duplicate usage logs.
  // We capture the claimed row's `generatedAt` as a lease token; only the
  // holder of the current lease may finalize/charge later. This is what makes
  // finalization safe even if a concurrent request takes over the claim.
  let leaseToken: Date | null = null;
  try {
    const claim = await prisma.monthlyBriefing.create({
      data: { userId, monthYear, uploadId: upload.id, ideas: [], factsValidated: 0, sources: [] },
    });
    leaseToken = claim.generatedAt;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await prisma.monthlyBriefing.findUnique({ where: cacheKey });
    // Became ready (same upload) between our checks → serve it.
    if (existing && existing.uploadId === upload.id && ideasReady(existing)) {
      return okResponse(existing);
    }
    // Take over only if the upload changed, or the claim is stale/abandoned.
    // Optimistic-concurrency guard on `generatedAt` means just one racer wins,
    // and the winner's new `generatedAt` becomes its lease token.
    const uploadChanged = !!existing && existing.uploadId !== upload.id;
    const staleClaim =
      !!existing && !ideasReady(existing) && existing.generatedAt.getTime() < Date.now() - STALE_CLAIM_MS;
    if (existing && (uploadChanged || staleClaim)) {
      const takeoverAt = new Date();
      const claimed = await prisma.monthlyBriefing.updateMany({
        where: { userId, monthYear, generatedAt: existing.generatedAt },
        data: {
          uploadId: upload.id,
          ideas: [],
          factsValidated: 0,
          sources: [],
          generatedAt: takeoverAt,
        },
      });
      if (claimed.count > 0) leaseToken = takeoverAt;
    }
    if (!leaseToken) return pendingResponse();
  }

  // Past the claim, every continuing path holds a lease — but TS can't prove
  // the try succeeded, so guard for types (and as a final safety net).
  if (!leaseToken) return pendingResponse();

  // ── Generate (we own the claim) ─────────────────────────────────────
  const headlineSafeIds = new Set(facts.map((f) => f.id));
  const result = await runIdeaGenerationLoop({
    count: BRIEFING_IDEA_COUNT,
    config,
    factsForLlm: facts,
    headlineSafeIds,
    storyLead: null,
    storyLeadFactIds: null,
    storyLeadHoodFactIds: null,
    monthYear: upload.monthYear,
    propertyTypeFocus: "Any",
  });

  if (!result.ok) {
    // Real (failed) Claude spend is still attributed, mirroring the wizard.
    if (result.inputTokens || result.outputTokens) {
      await logUsage(userId, "content_engine_v2", result.inputTokens, result.outputTokens);
    }
    // Release our claim — guarded on our lease so we never delete a newer
    // owner's row — so the next load retries instead of being stuck on a
    // permanent "generating" placeholder.
    await prisma.monthlyBriefing
      .deleteMany({ where: { userId, monthYear, generatedAt: leaseToken } })
      .catch(() => {});
    return NextResponse.json({ empty: true, reason: "generation_failed" });
  }

  // ── Resolve fact chips + sources ────────────────────────────────────
  const factById = new Map<string, CompactFact>(facts.map((f) => [f.id, f]));
  const firstCitedIds = result.ideas
    .map((i) => i.citedFactIds?.[0])
    .filter((x): x is string => typeof x === "string");

  // sourceTitle isn't on the compact fact projection — pull it for the cited
  // ids in one query so each chip can name where the stat came from.
  const sourceRows = firstCitedIds.length
    ? await prisma.marketFact.findMany({
        where: { id: { in: firstCitedIds } },
        select: { id: true, sourceTitle: true },
      })
    : [];
  const sourceTitleById = new Map<string, string | null>(
    sourceRows.map((r) => [r.id, r.sourceTitle]),
  );

  const ideas: BriefingIdea[] = result.ideas.map((idea: IdeaCard, i) => {
    const firstId = idea.citedFactIds?.[0];
    const f = firstId ? factById.get(firstId) : undefined;
    const chip: FactChip | null = f
      ? {
          stat: f.value,
          // Carry the property-type segment in the label so a per-type cut
          // (e.g. citywide Detached MOI) never reads as the bare all-types
          // overall. Order: metric · segment · neighbourhood.
          label: [f.metricName, f.propertyType, f.neighbourhood]
            .filter((p): p is string => !!p && p.trim().length > 0)
            .join(" · "),
          source: (firstId ? sourceTitleById.get(firstId) : null) ?? upload.label,
        }
      : null;
    return {
      index: i + 1,
      title: idea.title,
      why: idea.whyItWorks?.trim() || idea.clarityPremise,
      fact: chip,
      thinking: {
        clarityPremise: idea.clarityPremise ?? "",
        titlePromise: idea.titlePromise ?? "",
        whyItWorks: idea.whyItWorks ?? "",
      },
      citedFactIds: Array.isArray(idea.citedFactIds) ? idea.citedFactIds : [],
      rotationSlot: idea.rotationSlot,
    };
  });

  // Distinct member data sources backing the whole upload (e.g. "CREB",
  // "your MLS export") + a real headline-safe fact count for the meta row.
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

  // ── Finalize — only the current lease holder may write the result ───
  // Guarded on `leaseToken`: if a concurrent request took over our claim while
  // we were generating (upload changed mid-flight), count===0 — we discard our
  // result instead of overwriting the new owner's row, and we don't charge for
  // work that won't be served.
  const finalized = await prisma.monthlyBriefing.updateMany({
    where: { userId, monthYear, generatedAt: leaseToken },
    data: {
      uploadId: upload.id,
      ideas: ideas as unknown as object,
      factsValidated,
      sources: resolvedSources as unknown as object,
      generatedAt: new Date(),
    },
  });
  if (finalized.count === 0) {
    return pendingResponse();
  }

  // Charge once — tied to successful ownership finalization so a discarded
  // (lost-claim) generation never bills the member.
  if (result.inputTokens || result.outputTokens) {
    await logUsage(userId, "content_engine_v2", result.inputTokens, result.outputTokens);
  }

  return NextResponse.json({
    empty: false,
    monthYear,
    monthLabel,
    factsValidated,
    sources: resolvedSources,
    ideas,
    estReadMinutes: estReadMinutes(ideas),
  });
}

/** Rough "~X minutes" to review the briefing — ~1.5 min of consideration per
 *  idea card, floored at 2 so it never reads "~0 minutes". */
function estReadMinutes(ideas: BriefingIdea[]): number {
  return Math.max(2, Math.round(ideas.length * 1.5));
}
