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
  opts: { limit?: number } = {},
): Promise<CompactFact[]> {
  const limit = opts.limit ?? 200;
  const rows = await prisma.marketFact.findMany({
    where: { uploadId, usageClass: "headline_safe" },
    orderBy: [{ metricFamily: "asc" }, { neighbourhood: "asc" }],
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
