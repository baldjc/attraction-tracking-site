/**
 * Story Lead → MarketFact textual resolver.
 *
 * Why this exists: Story Leads persist their supporting data as DISPLAY STRINGS
 * in `dataThreads` (e.g. "Lakeview SP/LP 1.0224"), not as MarketFact primary
 * keys. A lead card can therefore show four real data threads while carrying
 * zero fact PKs. When such a lead is turned into a video, we need to bridge
 * from the displayed text back to the underlying MarketFact rows so the script
 * gate has something to cite.
 *
 * This module never widens scope. It matches each data thread back to facts in
 * the SAME neighbourhood and SAME metric family the thread already names — it
 * only tightens by numeric tolerance and recency. No neighbourhood
 * substitution, no metric-family substitution, no silent defaults. A thread it
 * cannot confidently bridge is simply omitted (never thrown).
 *
 * The pure core (`parseDataThreadStrings`, `matchThreadToFacts`) takes plain
 * data so it is unit-testable without a database; `resolveStoryLeadDataThreadsToFactIds`
 * is the DB-backed entry point used by routes and the lead generator.
 */
import prisma from "@/lib/prisma";
import { matchesHood } from "@/lib/content-engine-validation";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";

/** Canonical MarketFact.metricFamily enum values we resolve against. */
export type ResolverMetricFamily =
  | "MOI"
  | "BENCHMARK"
  | "PSF"
  | "MEDIAN"
  | "DOM"
  | "SP_LP"
  | "AVG"
  | "INVENTORY"
  | "FAILURE_RATE"
  | "OTHER";

export interface DataThread {
  neighbourhood: string;
  metricFamily: string;
  value: number;
  unit?: string;
}

export type MatchConfidence = "exact" | "close" | "fuzzy";

export interface ResolvedFactMatch {
  factId: string;
  confidence: MatchConfidence;
  matchedOn: {
    neighbourhood: boolean;
    metricFamily: boolean;
    valueWithinTolerance: boolean;
    recent: boolean;
  };
}

/** Minimal fact shape the matcher needs — DB-agnostic for unit testing. */
export interface ResolverFact {
  id: string;
  neighbourhood: string | null;
  metricFamily: string;
  /** Numeric value; null when the fact only stored a display string. */
  value: number | null;
  /** dateContext ?? createdAt — used for the recency dimension. */
  date: Date | null;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Value tolerance — two-band model.                                       */
/*                                                                          */
/*  `tight` defines `valueWithinTolerance: true` (an exact-quality value    */
/*  match). `wide` is the inclusion boundary: a candidate whose value is     */
/*  within `wide` but outside `tight` is still a (lower-confidence) match    */
/*  with `valueWithinTolerance: false`. Beyond `wide` the candidate is       */
/*  dropped entirely. The two bands are what make a genuine "fuzzy" (2/4)    */
/*  match reachable while still rejecting values that are simply wrong.      */
/* ─────────────────────────────────────────────────────────────────────── */
type ToleranceKind = "ratio" | "percent" | "dollars" | "count";

function toleranceKindFor(metricFamily: string): ToleranceKind {
  switch (metricFamily) {
    case "SP_LP":
      return "ratio";
    case "FAILURE_RATE":
      return "percent";
    case "MEDIAN":
    case "AVG":
    case "BENCHMARK":
    case "PSF":
      return "dollars";
    case "DOM":
    case "MOI":
    case "INVENTORY":
      return "count";
    default:
      return "count";
  }
}

/**
 * Returns the absolute tight/wide tolerance window around `value` for a metric
 * kind. Relative kinds (dollars/counts) scale with the value; absolute kinds
 * (ratio/percent) do not.
 */
function toleranceWindow(
  kind: ToleranceKind,
  value: number,
): { tight: number; wide: number } {
  switch (kind) {
    case "ratio":
      // SP/LP: within ±0.005 absolute.
      return { tight: 0.005, wide: 0.01 };
    case "percent":
      // Percentages: within ±0.5 percentage points.
      return { tight: 0.5, wide: 1.0 };
    case "dollars":
      // Dollars: within ±10%.
      return { tight: Math.abs(value) * 0.1, wide: Math.abs(value) * 0.2 };
    case "count":
      // Counts (DOM, MOI, sold count): within ±10%.
      return { tight: Math.abs(value) * 0.1, wide: Math.abs(value) * 0.2 };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure matcher: given a thread and a candidate pool already loaded from the DB,
 * pick the best matching fact (or null). Hard scope filters: neighbourhood
 * (case-insensitive, hyphen-aware via `matchesHood`) AND metric family. Soft
 * dimensions (scored, not filtered): value-within-tolerance and recency.
 *
 * Inclusion requires the value to be within the WIDE band. Among included
 * candidates the most recent is chosen; confidence reflects how many of the
 * four dimensions hold (4 → exact, 3 → close, 2 → fuzzy).
 */
export function matchThreadToFacts(
  thread: DataThread,
  facts: ResolverFact[],
  opts: { recencyDays?: number; now?: Date } = {},
): ResolvedFactMatch | null {
  const recencyDays = opts.recencyDays ?? 90;
  const now = opts.now ?? new Date();
  const kind = toleranceKindFor(thread.metricFamily);
  const { tight, wide } = toleranceWindow(kind, thread.value);

  type Scored = {
    fact: ResolverFact;
    match: ResolvedFactMatch;
    date: number;
  };
  const scored: Scored[] = [];

  for (const fact of facts) {
    // Hard scope filter 1: same neighbourhood (never substitute).
    const hoodOk =
      !!fact.neighbourhood &&
      matchesHood(fact.neighbourhood.toLowerCase(), thread.neighbourhood);
    if (!hoodOk) continue;
    // Hard scope filter 2: same metric family (never substitute).
    if (fact.metricFamily !== thread.metricFamily) continue;

    // Soft dimension: value within tolerance. A fact with no numeric value
    // can never satisfy the value dimension, but it can still be a (fuzzy)
    // structural match on hood + family if it is recent.
    let valueWithinTolerance = false;
    let valueDropped = false;
    if (fact.value !== null && Number.isFinite(fact.value)) {
      const diff = Math.abs(fact.value - thread.value);
      if (diff <= tight) valueWithinTolerance = true;
      else if (diff > wide) valueDropped = true; // beyond wide → not a match
    }
    if (valueDropped) continue;

    // Soft dimension: recency.
    const recent =
      !!fact.date && now.getTime() - fact.date.getTime() <= recencyDays * DAY_MS;

    const matchedOn = {
      neighbourhood: true,
      metricFamily: true,
      valueWithinTolerance,
      recent,
    };
    const trueCount =
      (matchedOn.neighbourhood ? 1 : 0) +
      (matchedOn.metricFamily ? 1 : 0) +
      (matchedOn.valueWithinTolerance ? 1 : 0) +
      (matchedOn.recent ? 1 : 0);
    const confidence: MatchConfidence =
      trueCount >= 4 ? "exact" : trueCount === 3 ? "close" : "fuzzy";

    scored.push({
      fact,
      match: { factId: fact.id, confidence, matchedOn },
      date: fact.date ? fact.date.getTime() : 0,
    });
  }

  if (scored.length === 0) return null;
  // Multiple matches → pick the most recent. Ties break on a tighter value
  // match (exact > close > fuzzy) so the better-quality row wins.
  scored.sort((a, b) => {
    if (b.date !== a.date) return b.date - a.date;
    const rank = (c: MatchConfidence) =>
      c === "exact" ? 0 : c === "close" ? 1 : 2;
    return rank(a.match.confidence) - rank(b.match.confidence);
  });
  return scored[0].match;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  dataThread string parsing.                                              */
/*                                                                          */
/*  Story Leads store dataThreads as free-text display strings. We parse a   */
/*  neighbourhood + metric family + numeric value out of each, using the     */
/*  member's known neighbourhood names to anchor the hood (longest match     */
/*  wins so composite hoods aren't shadowed by a shorter substring).        */
/* ─────────────────────────────────────────────────────────────────────── */

const METRIC_KEYWORDS: Array<{ re: RegExp; family: ResolverMetricFamily }> = [
  { re: /\bsp\s*\/\s*lp\b|\bsp_lp\b|sale[- ]to[- ]list|list[- ]to[- ]sale/i, family: "SP_LP" },
  { re: /\bmonths?\s+of\s+inventory\b|\bmoi\b/i, family: "MOI" },
  { re: /\bdays?\s+on\s+market\b|\bdom\b/i, family: "DOM" },
  { re: /\bper\s+(?:sq|square)\b|\bpsf\b|\$\/sq/i, family: "PSF" },
  { re: /\bbenchmark\b/i, family: "BENCHMARK" },
  { re: /\bmedian\b/i, family: "MEDIAN" },
  { re: /\baverage\b|\bavg\b/i, family: "AVG" },
  { re: /\bfailure\s+rate\b|\bexpired\b|\bterminated\b|\bwithdrawn\b/i, family: "FAILURE_RATE" },
  { re: /\binventory\b|\blistings?\b|\bactive\b/i, family: "INVENTORY" },
];

/** Map a free-text fragment to a canonical metric family (OTHER if unknown). */
export function detectMetricFamily(text: string): ResolverMetricFamily {
  for (const { re, family } of METRIC_KEYWORDS) {
    if (re.test(text)) return family;
  }
  return "OTHER";
}

/**
 * Extract a numeric value from a thread string. Handles $1,234,000, 12.5%,
 * ratios like 1.0224, and bare integers/decimals. Returns the LAST numeric
 * token (data threads put the value at the end: "Lakeview SP/LP 1.0224").
 */
export function parseThreadValue(text: string): number | null {
  // Strip thousands separators only inside number groups.
  const matches = text.match(/-?\$?\s?\d[\d,]*(?:\.\d+)?\s?%?/g);
  if (!matches || matches.length === 0) return null;
  const raw = matches[matches.length - 1];
  const cleaned = raw.replace(/[$,%\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse display dataThread strings into structured threads, anchoring the
 * neighbourhood against the member's known neighbourhood names. Threads we
 * cannot parse (no neighbourhood OR no value OR unknown metric family) are
 * omitted — they would only produce scope-less guesses.
 */
export function parseDataThreadStrings(
  strings: string[],
  knownNeighbourhoods: string[],
): DataThread[] {
  // Longest names first so "Upper Mount Royal" wins over "Mount Royal".
  const hoods = [...knownNeighbourhoods]
    .filter((h) => typeof h === "string" && h.trim().length >= 3)
    .sort((a, b) => b.length - a.length);

  const out: DataThread[] = [];
  for (const s of strings) {
    if (typeof s !== "string" || !s.trim()) continue;
    const lower = s.toLowerCase();

    let neighbourhood: string | null = null;
    for (const h of hoods) {
      if (matchesHood(lower, h)) {
        neighbourhood = h;
        break;
      }
    }
    if (!neighbourhood) continue;

    const metricFamily = detectMetricFamily(s);
    if (metricFamily === "OTHER") continue;

    const value = parseThreadValue(s);
    if (value === null) continue;

    out.push({ neighbourhood, metricFamily, value });
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  DB-backed entry point.                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Resolve a Story Lead's data threads to MarketFact ids for a member.
 *
 * Scope note: MarketFact carries no `marketConfigId` column in this schema — a
 * member has exactly one MarketConfig, so member scope IS market scope. Facts
 * are loaded by `memberId` and, when `uploadId` is supplied, tightened to that
 * upload (the lead's own upload — the tightest honest scope). `recencyDays`
 * filters nothing at load time; recency is scored per-match by the pure matcher
 * so it can contribute to confidence.
 */
export async function resolveStoryLeadDataThreadsToFactIds(params: {
  memberId: string;
  uploadId?: string | null;
  dataThreads: DataThread[];
  recencyDays?: number;
}): Promise<ResolvedFactMatch[]> {
  const { memberId, uploadId, dataThreads } = params;
  if (dataThreads.length === 0) return [];

  const rows = await prisma.marketFact.findMany({
    where: {
      userId: memberId,
      ...(uploadId ? { uploadId } : {}),
      ...EXCLUDE_LEGACY_FAILURE_RATE,
    },
    select: {
      id: true,
      neighbourhood: true,
      metricFamily: true,
      metricValue: true,
      dateContext: true,
      createdAt: true,
    },
  });

  const facts: ResolverFact[] = rows.map((r) => ({
    id: r.id,
    neighbourhood: r.neighbourhood,
    metricFamily: String(r.metricFamily),
    value: r.metricValue,
    date: r.dateContext ?? r.createdAt,
  }));

  const matches: ResolvedFactMatch[] = [];
  const seen = new Set<string>();
  for (const thread of dataThreads) {
    const m = matchThreadToFacts(thread, facts, {
      recencyDays: params.recencyDays,
    });
    if (m && !seen.has(m.factId)) {
      seen.add(m.factId);
      matches.push(m);
    }
  }
  return matches;
}
