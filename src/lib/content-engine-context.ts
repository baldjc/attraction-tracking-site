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
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";
import {
  resolveMarketDefaults,
  type MoiThresholds,
  type HighEndException,
  type MoiHighEndExceptionFloor,
} from "@/lib/market-config";

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
    where: { uploadId, usageClass: "headline_safe", ...EXCLUDE_LEGACY_FAILURE_RATE },
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

/**
 * Texture-only facts for an upload — rows the validator graded
 * `supporting_texture_only` (real, member-owned numbers, but NOT durable enough
 * to headline a video: thin samples, off-market sub-buckets, etc). Same compact
 * shape as loadHeadlineSafeFacts so callers can treat both uniformly; the
 * caller is responsible for flagging to the consumer that these carry a "use as
 * background colour, not a headline claim" caveat. Used by Jarvis get_facts as
 * a transparent fallback when an upload validated but yielded zero
 * headline-safe facts (or none match the requested filter).
 */
export async function loadTextureOnlyFacts(
  uploadId: string,
  monthYear: string,
  opts: { limit?: number; orderByNeighbourhoodFirst?: boolean } = {},
): Promise<CompactFact[]> {
  const limit = opts.limit ?? 200;
  const orderBy = opts.orderByNeighbourhoodFirst
    ? [{ neighbourhood: "asc" as const }, { metricFamily: "asc" as const }]
    : [{ metricFamily: "asc" as const }, { neighbourhood: "asc" as const }];
  const rows = await prisma.marketFact.findMany({
    where: {
      uploadId,
      usageClass: "supporting_texture_only",
      ...EXCLUDE_LEGACY_FAILURE_RATE,
    },
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
  // Member's configured market-state boundaries + high-end exception. Raw JSON
  // from MarketConfig; coerced by `marketStateThresholdsLines` so the Script
  // Builder speaks the member's own sellers/balanced/buyers numbers. When a
  // field is null/malformed the fallback is the PER-MLS seed resolved from
  // `mlsSource` (mirroring the Fact Validator), never a global Calgary default.
  mlsSource: string | null;
  highEndException: unknown;
  moiHighEndExceptionFloor: unknown;
  // Ship B — member-uploaded voice guide markdown. Null when the member is on
  // Foundations tier (no upload UI), or DWY but hasn't uploaded yet.
  voiceGuide: string | null;
  // Active voice selection. "custom"/null → apply voiceGuide above (legacy
  // default); "default" → write in the built-in register, keeping the guide on
  // file. The Script Builder gates the voiceGuide push on this.
  voiceMode: string | null;
  // Original filename of the uploaded voice guide, for display only.
  voiceGuideSourceFile: string | null;
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
 * Fix 1 — the member's PERSONAL credibility prose, the ONLY legal anchor for
 * an Expertise-Bridge "every N hours/days" cadence. Built strictly from the
 * member's team-credibility figures + notes — deliberately NOT neighbourhood
 * or market prose, so a coincidental market number can't legitimise an
 * invented personal cadence. Shared by the generation path (`buildScript`) and
 * the save-script re-validation so the `fabricated_credibility_stat` gate
 * behaves identically in both.
 */
export function credentialsAnchorText(
  marketConfig: Pick<MarketConfigSummary, "teamCredibility">,
): string[] {
  const cred = marketConfig.teamCredibility;
  if (!cred) return [];
  const out: string[] = [];
  if (cred.yearsInBusiness != null)
    out.push(`Years in business: ${cred.yearsInBusiness}`);
  if (cred.familiesHelped != null)
    out.push(`Families helped: ${cred.familiesHelped}`);
  if (cred.annualTransactionCount != null)
    out.push(`Homes sold per year: ${cred.annualTransactionCount}`);
  if (cred.teamSize != null) out.push(`Team size: ${cred.teamSize}`);
  if (cred.notes != null && cred.notes.trim().length > 0)
    out.push(cred.notes.trim());
  return out;
}

/** Coerce a raw MarketConfig.moiThresholds JSON into a typed pair, falling
 *  back to the per-MLS seed default when unset/malformed. */
function coerceMoiThresholds(
  raw: unknown,
  fallback: MoiThresholds,
): MoiThresholds {
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.sellers === "number" && typeof o.buyers === "number")
      return { sellers: o.sellers, buyers: o.buyers };
  }
  return fallback;
}

function coerceHighEndException(
  raw: unknown,
  fallback: HighEndException,
): HighEndException {
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.enabled === "boolean")
      return {
        enabled: o.enabled,
        priceThreshold:
          typeof o.priceThreshold === "number"
            ? o.priceThreshold
            : fallback.priceThreshold,
        propertyTypes: Array.isArray(o.propertyTypes)
          ? (o.propertyTypes.filter((t) => typeof t === "string") as string[])
          : fallback.propertyTypes,
      };
  }
  return fallback;
}

function coerceHighEndFloor(
  raw: unknown,
  fallback: MoiHighEndExceptionFloor,
): MoiHighEndExceptionFloor {
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.detached === "number" && typeof o.condo === "number")
      return { detached: o.detached, condo: o.condo };
  }
  return fallback;
}

/** Format an MOI boundary so an integer reads with one decimal (4 → "4.0")
 *  like the established script prose, while non-integers keep their precision
 *  (2.75 → "2.75"). */
function fmtMoi(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

/** Format a high-end price floor as the compact $X.XM / $XXXK the prose uses. */
function fmtMoneyFloor(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

/**
 * The member's OWN market-state boundaries, rendered for the Script Builder
 * user message (never the cached system prompt — these are per-member dynamic
 * content). The generic READING MOI framework in the cached prompt lists
 * illustrative 2.5/4.0 defaults; this block is the authoritative source for the
 * sellers/balanced/buyers numbers the script may speak, mirroring the Fact
 * Validator's `buildMoiThresholdsBlock` so labelling and spoken thresholds
 * agree end to end. Returns [] only if the caller passes nothing usable (the
 * coercers always resolve to seed defaults, so in practice it always renders).
 */
export function marketStateThresholdsLines(
  marketConfig: Pick<
    MarketConfigSummary,
    "moiThresholds" | "mlsSource" | "highEndException" | "moiHighEndExceptionFloor"
  >,
): string[] {
  const seed = resolveMarketDefaults(marketConfig.mlsSource);
  const moi = coerceMoiThresholds(marketConfig.moiThresholds, seed.moiThresholds);
  const he = coerceHighEndException(
    marketConfig.highEndException,
    seed.highEndException,
  );
  const floor = coerceHighEndFloor(
    marketConfig.moiHighEndExceptionFloor,
    seed.moiHighEndExceptionFloor,
  );

  const lines: string[] = [];
  lines.push(
    "## YOUR MARKET'S MOI THRESHOLDS (the ONLY market-state boundary numbers you may speak)",
  );
  lines.push("");
  lines.push(
    `- Below ${fmtMoi(moi.sellers)} MOI → SELLERS market: seller has leverage, competition likely, prices firm or rising.`,
  );
  lines.push(
    `- ${fmtMoi(moi.sellers)} to ${fmtMoi(moi.buyers)} MOI → BALANCED market: neither side has clear leverage, prices stable.`,
  );
  lines.push(
    `- Above ${fmtMoi(moi.buyers)} MOI → BUYERS market: buyer has leverage, inventory soft, prices flat or falling.`,
  );
  if (he.enabled) {
    lines.push(
      `- High-end exception → "balanced (high-end)": at the genuine top of the market (detached ${fmtMoneyFloor(
        floor.detached,
      )}+, condo ${fmtMoneyFloor(
        floor.condo,
      )}+) a higher MOI (≈5-6) is functionally balanced, not a buyers market, because the buyer pool is structurally smaller.`,
    );
  }
  lines.push("");
  lines.push(
    `When you state any market-state boundary out loud, use ONLY these exact numbers (sellers below ${fmtMoi(
      moi.sellers,
    )}, buyers above ${fmtMoi(
      moi.buyers,
    )}). The figures in the generic READING MOI framework are illustrative defaults — defer to the numbers above for THIS member, and never speak a different boundary.`,
  );
  lines.push("");
  return lines;
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
      mlsSource: true,
      highEndException: true,
      moiHighEndExceptionFloor: true,
      voiceGuide: true,
      voiceMode: true,
      voiceGuideSourceFile: true,
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
    mlsSource: cfg.mlsSource,
    highEndException: cfg.highEndException,
    moiHighEndExceptionFloor: cfg.moiHighEndExceptionFloor,
    voiceGuide: cfg.voiceGuide,
    voiceMode: cfg.voiceMode,
    voiceGuideSourceFile: cfg.voiceGuideSourceFile,
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

/* ────────────────────────────────────────────────────────────────────── */
/*  "Use as Video" — turn a Story Lead straight into a ContentPlan with    */
/*  no idea-generation step (no LLM call).                                 */
/* ────────────────────────────────────────────────────────────────────── */

export interface LeadVideoSeed {
  lead: {
    id: string;
    pattern: string;
    whyItMatters: string;
    suggestedRotationSlot: string | null;
    subPersonas: string[];
  };
  uploadId: string;
  /** Fact ids underlying the lead — its hood-anchored headline-safe facts
   *  (or the city/all rollups when the lead is city-wide). Story Leads don't
   *  store fact ids (dataThreads are display strings), so we resolve them by
   *  matching the lead's named neighbourhoods back to the upload's facts. */
  factIds: string[];
  /** Property-type lock implied by the lead's facts, identical logic to the
   *  wizard auto-lock (`deriveLeadPropertyTypeLock`): ≥80% one type → lock. */
  propertyTypeFocus: Exclude<PropertyTypeFocus, "Any"> | null;
  leadSpansMultipleTypes: boolean;
}

/**
 * Load everything needed to mint a ContentPlan directly from a Story Lead,
 * skipping idea generation. Scoped to the user; returns null when the lead or
 * its (validated) upload can't be loaded for this user.
 */
export async function loadLeadVideoSeed(
  userId: string,
  storyLeadId: string,
): Promise<LeadVideoSeed | null> {
  const lead = await prisma.marketStoryLead.findFirst({
    where: { id: storyLeadId, userId },
    select: {
      id: true,
      uploadId: true,
      pattern: true,
      whyItMatters: true,
      dataThreads: true,
      suggestedRotationSlot: true,
      suggestedSubPersonas: true,
    },
  });
  if (!lead) return null;

  // Confirm the lead's upload still belongs to the user and is validated.
  const upload = await prisma.marketDataUpload.findFirst({
    where: { id: lead.uploadId, userId, status: "validated" },
    select: { id: true, monthYear: true },
  });
  if (!upload) return null;

  const config = await loadMarketConfigSummary(userId);
  const vocab = config?.neighbourhoods ?? [];
  const marketLower = (config?.marketName ?? "").toLowerCase();

  const facts = await loadHeadlineSafeFacts(upload.id, upload.monthYear, {
    limit: 500,
  });

  const leadDetail: StoryLeadDetail = {
    id: lead.id,
    scanType: 0,
    pattern: lead.pattern,
    whyItMatters: lead.whyItMatters,
    dataThreads: lead.dataThreads,
    suggestedRotationSlot: lead.suggestedRotationSlot,
    suggestedSubPersonas: lead.suggestedSubPersonas,
    suggestedFramework: null,
    tactileType: null,
    label: null,
  };
  const leadHoods = extractLeadHoodsLower(leadDetail, vocab);

  const factIds: string[] = [];
  const typeCounts = new Map<string, number>();
  let typedTotal = 0;
  for (const f of facts) {
    const hood = (f.neighbourhood ?? "").trim().toLowerCase();
    const isCityRollup =
      !hood || hood === "all" || hood === "city" || hood === marketLower;
    // Lead names neighbourhoods → link those hoods' facts. Lead is city-wide
    // (no hood matched the vocab) → link the city/all rollup facts instead.
    const include =
      leadHoods.length > 0 ? !isCityRollup && leadHoods.includes(hood) : isCityRollup;
    if (!include) continue;
    factIds.push(f.id);
    // Property-type lock counts only hood-anchored, property-typed facts —
    // city rollups (null/All) would dilute the ratio.
    if (!isCityRollup) {
      const pt = f.propertyType;
      if (pt && pt !== "All") {
        typeCounts.set(pt, (typeCounts.get(pt) ?? 0) + 1);
        typedTotal++;
      }
    }
  }

  let propertyTypeFocus: Exclude<PropertyTypeFocus, "Any"> | null = null;
  let leadSpansMultipleTypes = false;
  if (typedTotal > 0) {
    let topType: string | null = null;
    let topCount = 0;
    for (const [pt, n] of typeCounts) {
      if (n > topCount) {
        topType = pt;
        topCount = n;
      }
    }
    if (topType && topCount / typedTotal >= 0.8) {
      propertyTypeFocus = topType as Exclude<PropertyTypeFocus, "Any">;
    } else {
      leadSpansMultipleTypes = true;
    }
  }

  return {
    lead: {
      id: lead.id,
      pattern: lead.pattern,
      whyItMatters: lead.whyItMatters,
      suggestedRotationSlot: lead.suggestedRotationSlot,
      subPersonas: Array.isArray(lead.suggestedSubPersonas)
        ? lead.suggestedSubPersonas.filter(
            (x): x is string => typeof x === "string",
          )
        : [],
    },
    uploadId: upload.id,
    factIds,
    propertyTypeFocus,
    leadSpansMultipleTypes,
  };
}
