// Knowledge-Base Merge & Clean — canonical resolution. Combines the three
// signals into one raw→canonical mapping for a member:
//   1. Existing AreaAlias decisions (already confirmed — always honoured, for
//      stability across months).
//   2. Stage 1 deterministic normalization (free, certain).
//   3. Stage 2 fuzzy near-duplicate proposals (conservative; >= floor only).
//
// Two entry points:
//   • loadCanonicalResolver(userId) — cheap, no AI. Used at INGESTION so every
//     upload silently folds raw subdivisions into already-known canonical areas
//     (deterministic + previously-confirmed aliases). New ambiguous fuzzy merges
//     are NOT invented here — they require a reviewed merge run.
//   • buildCanonicalProposal(userId, rawNames, …) — the full dry-run computation
//     (deterministic + fuzzy), no writes. persistCanonicalMap applies it.

import prisma from "@/lib/prisma";
import {
  normalizeAreaName,
  isNonAreaKey,
  pickCanonicalDisplay,
  groupByNormKey,
} from "@/lib/kb-merge/normalize";
import {
  runFuzzyPass,
  type FuzzyMergeProposal,
  AUTO_MERGE_CONFIDENCE,
} from "@/lib/kb-merge/fuzzy";

// ── Ingestion-time resolver (no AI) ──────────────────────────────────────────

export interface CanonicalResolver {
  /** Map a raw subdivision string to its canonical display name. */
  resolve(raw: string): string;
  /** Resolve to the canonical area id, if one is persisted. */
  resolveId(raw: string): string | null;
  /** Number of persisted aliases backing this resolver. */
  aliasCount: number;
}

/**
 * Build a cheap, AI-free resolver from the member's persisted canonical areas
 * and aliases. Resolution order for a raw name:
 *   1. exact persisted alias (rawName)         → its canonical area
 *   2. persisted CanonicalArea with same normKey → that area
 *   3. deterministic display of the raw name    → no persisted id
 * Non-area values ("Unknown", "All Neighbourhoods") pass through unchanged.
 */
export async function loadCanonicalResolver(
  userId: string,
): Promise<CanonicalResolver> {
  const [aliases, areas] = await Promise.all([
    prisma.areaAlias.findMany({
      where: { userId },
      select: { rawName: true, canonicalAreaId: true },
    }),
    prisma.canonicalArea.findMany({
      where: { userId },
      select: { id: true, name: true, normKey: true },
    }),
  ]);

  const areaById = new Map(areas.map((a) => [a.id, a]));
  const aliasByRaw = new Map<string, string>(); // rawLower → canonicalAreaId
  for (const a of aliases) aliasByRaw.set(a.rawName.toLowerCase(), a.canonicalAreaId);
  const areaByNormKey = new Map<string, { id: string; name: string }>();
  for (const a of areas) {
    // First-seen wins (areas are unique by name; normKey collisions shouldn't
    // happen after a clean apply, but be defensive).
    if (!areaByNormKey.has(a.normKey))
      areaByNormKey.set(a.normKey, { id: a.id, name: a.name });
  }

  const resolveBoth = (raw: string): { name: string; id: string | null } => {
    const cleaned = (raw ?? "").toString().trim().replace(/\s+/g, " ");
    if (!cleaned) return { name: cleaned, id: null };
    const normKey = normalizeAreaName(cleaned);
    if (isNonAreaKey(normKey)) return { name: cleaned, id: null };

    const aliasAreaId = aliasByRaw.get(cleaned.toLowerCase());
    if (aliasAreaId) {
      const area = areaById.get(aliasAreaId);
      if (area) return { name: area.name, id: area.id };
    }
    const byKey = areaByNormKey.get(normKey);
    if (byKey) return { name: byKey.name, id: byKey.id };
    // Unknown to the canonical set: still strip fragmentation deterministically.
    return { name: pickCanonicalDisplay(normKey, [cleaned]), id: null };
  };

  return {
    resolve: (raw) => resolveBoth(raw).name,
    resolveId: (raw) => resolveBoth(raw).id,
    aliasCount: aliases.length,
  };
}

// ── Dry-run proposal (deterministic + fuzzy) ─────────────────────────────────

export interface CanonicalGroup {
  /** Canonical display name. */
  display: string;
  /** Deterministic key of the dominant member (for persistence/normKey). */
  normKey: string;
  /** All raw variants that fold into this canonical area. */
  variants: string[];
  /** True if a fuzzy auto-merge contributed members beyond the deterministic key. */
  fuzzyMerged: boolean;
}

export interface CanonicalProposal {
  /** rawNameLower → canonical display name. */
  map: Map<string, string>;
  /** Final canonical groups after deterministic + fuzzy auto-merges. */
  groups: CanonicalGroup[];
  /** Fuzzy merges applied automatically (>= floor). */
  fuzzyApplied: FuzzyMergeProposal[];
  /** Fuzzy near-dups below the floor — human review only, NOT applied. */
  reviewQueue: FuzzyMergeProposal[];
  rawCount: number;
  canonicalCount: number;
  fuzzyCostUsd: number;
  fuzzySkippedReason?: string;
}

/**
 * Compute the full canonical mapping for a set of raw names. No DB writes.
 * Honours existing aliases (a previously-confirmed canonical name wins the
 * display for its group). Runs the fuzzy pass unless `applyFuzzy` is false.
 */
export async function buildCanonicalProposal(
  userId: string,
  rawNames: string[],
  opts: { applyFuzzy?: boolean } = {},
): Promise<CanonicalProposal> {
  const applyFuzzy = opts.applyFuzzy !== false;

  // Stage 1: deterministic groups.
  const detGroups = groupByNormKey(rawNames);

  // Honour existing canonical names: if any variant already maps to a persisted
  // canonical area, prefer that area's display name for the whole group.
  const existing = await prisma.areaAlias.findMany({
    where: { userId },
    select: { rawName: true, canonicalArea: { select: { name: true } } },
  });
  const existingByRaw = new Map<string, string>();
  for (const a of existing)
    existingByRaw.set(a.rawName.toLowerCase(), a.canonicalArea.name);

  // display (lower) → group
  const groupByDisplayLower = new Map<string, CanonicalGroup>();
  for (const g of detGroups) {
    let display = g.display;
    for (const v of g.variants) {
      const prior = existingByRaw.get(v.toLowerCase());
      if (prior) {
        display = prior;
        break;
      }
    }
    groupByDisplayLower.set(display.toLowerCase(), {
      display,
      normKey: g.normKey,
      variants: [...g.variants],
      fuzzyMerged: false,
    });
  }

  // Stage 2: fuzzy near-duplicate pass over the deterministic display names.
  let fuzzyApplied: FuzzyMergeProposal[] = [];
  let reviewQueue: FuzzyMergeProposal[] = [];
  let fuzzyCostUsd = 0;
  let fuzzySkippedReason: string | undefined;
  if (applyFuzzy) {
    const displays = [...groupByDisplayLower.values()].map((g) => g.display);
    const fuzzy = await runFuzzyPass(displays);
    fuzzyApplied = fuzzy.autoMerges;
    reviewQueue = fuzzy.reviewQueue;
    fuzzyCostUsd = fuzzy.costUsd;
    fuzzySkippedReason = fuzzy.skippedReason;

    // Fold each auto-merge: move `from`'s variants into `into`'s group.
    for (const m of fuzzyApplied) {
      const fromKey = m.from.toLowerCase();
      const intoKey = m.into.toLowerCase();
      const fromGroup = groupByDisplayLower.get(fromKey);
      const intoGroup = groupByDisplayLower.get(intoKey);
      if (!fromGroup || !intoGroup || fromKey === intoKey) continue;
      for (const v of fromGroup.variants) {
        if (!intoGroup.variants.includes(v)) intoGroup.variants.push(v);
      }
      intoGroup.fuzzyMerged = true;
      groupByDisplayLower.delete(fromKey);
    }
  }

  // Build the final raw→display map.
  const map = new Map<string, string>();
  const groups: CanonicalGroup[] = [];
  for (const g of groupByDisplayLower.values()) {
    g.variants.sort((a, b) => a.localeCompare(b));
    groups.push(g);
    for (const v of g.variants) map.set(v.toLowerCase(), g.display);
  }
  groups.sort((a, b) => b.variants.length - a.variants.length || a.display.localeCompare(b.display));

  const rawCount = new Set(
    rawNames
      .map((r) => (r ?? "").toString().trim().replace(/\s+/g, " "))
      .filter((r) => r && !isNonAreaKey(normalizeAreaName(r))),
  ).size;

  return {
    map,
    groups,
    fuzzyApplied,
    reviewQueue,
    rawCount,
    canonicalCount: groups.length,
    fuzzyCostUsd,
    fuzzySkippedReason,
  };
}

// ── Persistence (apply only) ─────────────────────────────────────────────────

/**
 * Write the proposal's canonical areas + aliases to the DB. Idempotent: upserts
 * CanonicalArea by (userId, name) and AreaAlias by (userId, rawName). Returns
 * a raw(lower)→canonicalAreaId map for stamping facts during re-aggregation.
 */
export async function persistCanonicalMap(
  userId: string,
  proposal: CanonicalProposal,
): Promise<Map<string, string>> {
  const rawToAreaId = new Map<string, string>();

  for (const g of proposal.groups) {
    const area = await prisma.canonicalArea.upsert({
      where: { userId_name: { userId, name: g.display } },
      create: { userId, name: g.display, normKey: g.normKey },
      update: { normKey: g.normKey },
      select: { id: true },
    });

    for (const raw of g.variants) {
      const isFuzzy =
        normalizeAreaName(raw) !== g.normKey; // folded by fuzzy, not determinism
      await prisma.areaAlias.upsert({
        where: { userId_rawName: { userId, rawName: raw } },
        create: {
          userId,
          rawName: raw,
          normKey: normalizeAreaName(raw),
          canonicalAreaId: area.id,
          source: isFuzzy ? "fuzzy" : "deterministic",
          confidence: isFuzzy
            ? (proposal.fuzzyApplied.find(
                (m) =>
                  m.into.toLowerCase() === g.display.toLowerCase() ||
                  m.from.toLowerCase() === raw.toLowerCase(),
              )?.confidence ?? AUTO_MERGE_CONFIDENCE)
            : null,
        },
        update: { canonicalAreaId: area.id, normKey: normalizeAreaName(raw) },
        select: { id: true },
      });
      rawToAreaId.set(raw.toLowerCase(), area.id);
    }
  }

  return rawToAreaId;
}
