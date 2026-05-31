/**
 * Helpers for the Wave 2 Content Engine v2 + Idea Validation routes.
 *
 * Pulls the per-member market context that gets injected into the USER side
 * of Claude calls. Everything in here is dynamic (member-specific) and
 * therefore lives OUTSIDE the cached system prompt — concatenating any of
 * this into the cached prompt would destroy the prompt-caching discount.
 */
import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { PropertyTypeFocus } from "@/lib/property-type-focus";

export interface LatestUpload {
  id: string;
  monthYear: string;
  label: string;
  validatedAt: Date | null;
}

/**
 * The user's most recent successfully-validated upload. Both v2 surfaces
 * (Idea Validation + Content Engine v2) anchor on this — without it the
 * routes return a friendly 409 "upload market data first".
 */
export async function loadLatestValidatedUpload(
  userId: string,
): Promise<LatestUpload | null> {
  const upload = await prisma.marketDataUpload.findFirst({
    where: { userId, status: "validated" },
    orderBy: [{ monthYear: "desc" }, { validatedAt: "desc" }],
    select: {
      id: true,
      monthYear: true,
      label: true,
      validatedAt: true,
    },
  });
  return upload;
}

export interface CompactFact {
  id: string;
  neighbourhood: string;
  propertyType: string | null;
  priceTier: string | null;
  metricName: string;
  metricFamily: string;
  value: string;
  marketType: string | null;
  trajectory: string | null;
  monthYear: string;
  caveat?: string;
}

/**
 * Headline-safe facts for an upload, projected down to the compact shape we
 * send to Claude. We omit raw numerics in favour of pre-formatted strings so
 * Claude doesn't waste tokens parsing decimal/percent formatting — and we
 * tag each fact with a stable `id` so the validation gate can verify that
 * cited fact ids round-trip back to real headline-safe rows.
 */
export async function loadHeadlineSafeFacts(
  uploadId: string,
  monthYear: string,
  opts: { limit?: number; orderByNeighbourhoodFirst?: boolean } = {},
): Promise<CompactFact[]> {
  const limit = opts.limit ?? 200;
  // Default ordering is metricFamily-first (stable for Content Engine callers).
  // Callers that then re-balance across families (Idea Validation) should ask
  // for neighbourhood-first ordering so that when the `take` cap bites in wide
  // markets, every metric family — including ones that sort late in the enum
  // like SP_LP / FAILURE_RATE — is still represented in the candidate window
  // rather than being truncated wholesale.
  const orderBy = opts.orderByNeighbourhoodFirst
    ? [{ neighbourhood: "asc" as const }, { metricFamily: "asc" as const }]
    : [{ metricFamily: "asc" as const }, { neighbourhood: "asc" as const }];
  const rows = await prisma.marketFact.findMany({
    where: { uploadId, usageClass: "headline_safe" },
    orderBy,
    take: limit,
    select: {
      id: true,
      neighbourhood: true,
      propertyType: true,
      priceTier: true,
      metricName: true,
      metricFamily: true,
      metricValue: true,
      metricValueString: true,
      marketType: true,
      trajectory: true,
      viewerCaveat: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    neighbourhood: r.neighbourhood,
    propertyType: r.propertyType,
    priceTier: r.priceTier,
    metricName: r.metricName,
    metricFamily: r.metricFamily,
    value:
      r.metricValueString ??
      (r.metricValue !== null ? String(r.metricValue) : ""),
    marketType: r.marketType,
    trajectory: r.trajectory,
    monthYear,
    ...(r.viewerCaveat ? { caveat: r.viewerCaveat } : {}),
  }));
}

export interface MarketConfigSummary {
  marketName: string;
  neighbourhoods: string[];
  keywordKit: unknown;
  primaryAvatar: unknown;
  subPersonas: unknown;
  moiThresholds: unknown;
  // Ship B — member-uploaded voice guide markdown. Null when the member is on
  // Foundations tier (no upload UI), or DWY but hasn't uploaded yet.
  voiceGuide: string | null;
  // B1 — onboarding Step 5 team-credibility numbers, read STRICTLY from this
  // member's own MarketConfig. The Script Builder uses these for credibility
  // moments and NEVER falls back to a hardcoded presenter. All null until the
  // member fills Step 5.
  teamCredibility: {
    yearsInBusiness: number | null;
    familiesHelped: number | null;
    annualTransactionCount: number | null;
    teamSize: number | null;
    notes: string | null;
  };
}

/**
 * Member's MarketConfig flattened to the bits the Content Engine actually
 * uses. Returns null when the member hasn't configured a market yet — the
 * route layers above turn that into a "configure your market first" error.
 */
export async function loadMarketConfigSummary(
  userId: string,
): Promise<MarketConfigSummary | null> {
  const cfg = await prisma.marketConfig.findUnique({
    where: { userId },
    select: {
      marketName: true,
      neighbourhoodVocab: true,
      keywordKit: true,
      primaryAvatar: true,
      subPersonas: true,
      moiThresholds: true,
      voiceGuide: true,
      teamYearsInBusiness: true,
      teamFamiliesHelped: true,
      teamAnnualTransactionCount: true,
      teamSize: true,
      teamCredibilityNotes: true,
    },
  });
  if (!cfg) return null;
  return {
    marketName: cfg.marketName,
    neighbourhoods: extractNeighbourhoodList(cfg.neighbourhoodVocab),
    keywordKit: cfg.keywordKit,
    primaryAvatar: cfg.primaryAvatar,
    subPersonas: cfg.subPersonas,
    moiThresholds: cfg.moiThresholds,
    voiceGuide: cfg.voiceGuide,
    teamCredibility: {
      yearsInBusiness: cfg.teamYearsInBusiness,
      familiesHelped: cfg.teamFamiliesHelped,
      annualTransactionCount: cfg.teamAnnualTransactionCount,
      teamSize: cfg.teamSize,
      notes: cfg.teamCredibilityNotes,
    },
  };
}

/**
 * The neighbourhood vocab is a Json blob whose exact shape isn't pinned at
 * the schema layer — it can be a flat array of strings, or an object with a
 * `list` / `neighbourhoods` field, or a nested grouping. We try the common
 * shapes and degrade gracefully to an empty list. Used both for prompt
 * context AND for the "title contains a named anchor" validation check.
 */
export function extractNeighbourhoodList(
  vocab: Prisma.JsonValue | null,
): string[] {
  if (!vocab) return [];
  if (Array.isArray(vocab)) {
    return vocab.filter((v): v is string => typeof v === "string");
  }
  if (typeof vocab === "object") {
    const obj = vocab as Record<string, unknown>;
    for (const key of ["list", "neighbourhoods", "names", "vocab"]) {
      const v = obj[key];
      if (Array.isArray(v)) {
        return v.filter((x): x is string => typeof x === "string");
      }
    }
    // Nested grouping: { quadrant: [...], inner: [...] } → flatten string arrays
    const flat: string[] = [];
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) {
        for (const x of v) if (typeof x === "string") flat.push(x);
      }
    }
    if (flat.length) return flat;
  }
  return [];
}

export interface StoryLeadDetail {
  id: string;
  scanType: number;
  pattern: string;
  whyItMatters: string;
  dataThreads: Prisma.JsonValue;
  suggestedRotationSlot: string | null;
  suggestedSubPersonas: Prisma.JsonValue;
  suggestedFramework: string | null;
  tactileType: string | null;
  label: string | null;
}

/** Load a single story lead by id, scoped to the user. Returns null when
 *  the id doesn't exist or doesn't belong to the caller. */
export async function loadStoryLead(
  userId: string,
  storyLeadId: string,
): Promise<StoryLeadDetail | null> {
  return prisma.marketStoryLead.findFirst({
    where: { id: storyLeadId, userId },
    select: {
      id: true,
      scanType: true,
      pattern: true,
      whyItMatters: true,
      dataThreads: true,
      suggestedRotationSlot: true,
      suggestedSubPersonas: true,
      suggestedFramework: true,
      tactileType: true,
      label: true,
    },
  });
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Wave 12 Fix 2 — Story Lead → property-type auto-lock.                 */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Lead-named neighbourhoods (lowercased) parsed out of the lead's
 * pattern + whyItMatters + dataThreads narrative against the member's
 * MarketConfig vocab. Mirrors the in-route helper in content-engine-v2
 * so the wizard draft route can derive the same hood scope without
 * importing from a route file.
 */
function extractLeadHoodsLower(
  lead: StoryLeadDetail,
  vocab: string[],
): string[] {
  const parts: string[] = [];
  if (typeof lead.pattern === "string") parts.push(lead.pattern);
  if (typeof lead.whyItMatters === "string") parts.push(lead.whyItMatters);
  const dt = lead.dataThreads;
  if (Array.isArray(dt)) {
    for (const t of dt) if (typeof t === "string") parts.push(t);
  } else if (dt && typeof dt === "object") {
    for (const v of Object.values(dt as Record<string, unknown>)) {
      if (typeof v === "string") parts.push(v);
      else if (Array.isArray(v)) {
        for (const x of v) if (typeof x === "string") parts.push(x);
      }
    }
  }
  const blob = parts.join(" \n ").toLowerCase();
  if (!blob) return [];
  const matched = new Set<string>();
  for (const hood of vocab) {
    const t = hood?.trim().toLowerCase();
    if (!t || t.length < 3) continue;
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?<![A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`,
      "i",
    );
    if (re.test(blob)) matched.add(t);
  }
  return Array.from(matched);
}

export interface LeadPropertyTypeLock {
  /** The single property type the lead's facts cluster on (≥80%),
   *  or `null` when the lead spans multiple types or has no
   *  property-typed facts. */
  propertyTypeFocus: Exclude<PropertyTypeFocus, "Any"> | null;
  /** `true` when no single property type owns ≥80% of the lead's
   *  hood-anchored property-typed facts. Surfaces the dual-audience
   *  exception to the BUYER AUDIENCE CONSISTENCY hard rule. */
  leadSpansMultipleTypes: boolean;
}

/**
 * Wave 12 Fix 2 — derive the property-type lock implied by picking a
 * Story Lead. Counts propertyType across the lead's hood-anchored
 * facts (city/All rollups excluded — they have null propertyType and
 * would dilute the count):
 *
 *   - ≥80% of facts share one type → lock to that type.
 *   - facts span multiple types → leadSpansMultipleTypes = true,
 *     focus stays null so the wizard prompts the member to keep
 *     dual-audience framing throughout the script.
 *   - no property-typed hood facts (only city rollups) → both null /
 *     false, caller leaves any prior focus untouched.
 *
 * Returns `null` when the lead, market config, or upload can't be
 * loaded — caller should not change the draft's lock state.
 */
export async function deriveLeadPropertyTypeLock(
  userId: string,
  storyLeadId: string,
): Promise<LeadPropertyTypeLock | null> {
  const [lead, config, upload] = await Promise.all([
    loadStoryLead(userId, storyLeadId),
    loadMarketConfigSummary(userId),
    loadLatestValidatedUpload(userId),
  ]);
  if (!lead || !config || !upload) return null;

  const facts = await loadHeadlineSafeFacts(upload.id, upload.monthYear, {
    limit: 500,
  });
  const leadHoods = extractLeadHoodsLower(lead, config.neighbourhoods);
  if (leadHoods.length === 0) {
    return { propertyTypeFocus: null, leadSpansMultipleTypes: false };
  }

  const marketLower = config.marketName.toLowerCase();
  const typeCounts = new Map<string, number>();
  let total = 0;
  for (const f of facts) {
    const hood = (f.neighbourhood ?? "").trim().toLowerCase();
    if (!hood || hood === "all" || hood === "city" || hood === marketLower) {
      continue;
    }
    if (!leadHoods.includes(hood)) continue;
    const pt = f.propertyType;
    if (!pt || pt === "All") continue;
    typeCounts.set(pt, (typeCounts.get(pt) ?? 0) + 1);
    total++;
  }
  if (total === 0) {
    return { propertyTypeFocus: null, leadSpansMultipleTypes: false };
  }
  let topType: string | null = null;
  let topCount = 0;
  for (const [pt, n] of typeCounts) {
    if (n > topCount) {
      topType = pt;
      topCount = n;
    }
  }
  if (topType && topCount / total >= 0.8) {
    return {
      propertyTypeFocus: topType as Exclude<PropertyTypeFocus, "Any">,
      leadSpansMultipleTypes: false,
    };
  }
  return { propertyTypeFocus: null, leadSpansMultipleTypes: true };
}
