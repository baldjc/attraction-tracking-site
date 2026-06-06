// Knowledge-Base Merge & Clean — merge-run orchestration. A MergeRun is the
// ONLY sanctioned mutation path for a member's neighbourhood knowledge base.
// Flow: buildMergeRunReport() produces a DRY_RUN (no destructive writes, full
// before/after report incl. an estimate of how many fact-bearing areas clear
// the sample floor). The member (or Jarvis, through its confirm gate) then
// either applyMergeRun() — which persists canonical areas/aliases and
// re-aggregates every upload — or discardMergeRun().
//
// Non-destructive audit trail: AreaAlias + CanonicalArea + the retained
// MergeRun.report + the original CSVs in Object Storage mean an applied merge is
// always explainable and the raw data is never lost.

import prisma from "@/lib/prisma";
import {
  buildCanonicalProposal,
  persistCanonicalMap,
  type CanonicalGroup,
  type CanonicalProposal,
} from "@/lib/kb-merge/canonical";
import { normalizeAreaName, isNonAreaKey } from "@/lib/kb-merge/normalize";
import type { FuzzyMergeProposal } from "@/lib/kb-merge/fuzzy";
import { loadMemberMetricSettings } from "@/lib/member-metric-settings-server";
import { sampleFloorFor, type SampleFloor } from "@/lib/member-metric-settings";

// ── Report shape (persisted in MergeRun.report JSON) ─────────────────────────

export interface MergeRunGroupSummary {
  canonical: string;
  variantCount: number;
  variants: string[];
}

export interface MergeRunReport {
  generatedAt: string;
  rawCount: number;
  canonicalCount: number;
  /** rawCount − canonicalCount: total names removed from the KB. */
  collapsed: number;
  fuzzyAppliedCount: number;
  reviewQueueCount: number;
  fuzzyApplied: FuzzyMergeProposal[];
  reviewQueue: FuzzyMergeProposal[];
  /** Largest collapses first — what the member sees in the review modal. */
  topMerges: MergeRunGroupSummary[];
  floor: SampleFloor;
  floorClearing: {
    before: number;
    after: number;
    latestUploadId: string | null;
    estimated: true;
  };
  fuzzyCostUsd: number;
  fuzzySkippedReason?: string;
  /** Full canonical groups — persisted so apply() reproduces the reviewed plan. */
  groups: CanonicalGroup[];
}

// ── Gather the member's raw neighbourhood universe ───────────────────────────

/**
 * Collect every raw neighbourhood string the member's KB knows about, focused
 * on fact-bearing areas: distinct AggregatedMetric + MarketFact neighbourhoods
 * (the names that actually carry numbers) unioned with the curated vocab. The
 * long zero-sale tail in the vocab is included but, because merge quality is
 * driven by the deterministic + fuzzy passes, it costs little and keeps later
 * uploads consistent.
 */
async function gatherRawNames(userId: string): Promise<string[]> {
  const [metrics, facts, cfg] = await Promise.all([
    prisma.aggregatedMetric.findMany({
      where: { userId },
      distinct: ["neighbourhood"],
      select: { neighbourhood: true },
    }),
    prisma.marketFact.findMany({
      where: { userId },
      distinct: ["neighbourhood"],
      select: { neighbourhood: true },
    }),
    prisma.marketConfig.findUnique({
      where: { userId },
      select: { neighbourhoodVocab: true },
    }),
  ]);

  const vocab = Array.isArray(cfg?.neighbourhoodVocab)
    ? (cfg!.neighbourhoodVocab as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];

  const set = new Set<string>();
  for (const m of metrics) if (m.neighbourhood) set.add(m.neighbourhood);
  for (const f of facts) if (f.neighbourhood) set.add(f.neighbourhood);
  for (const v of vocab) set.add(v);

  return [...set]
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s && !isNonAreaKey(normalizeAreaName(s)));
}

// ── Floor-clearing estimate ──────────────────────────────────────────────────

/**
 * Estimate, from the latest upload's deterministic aggregations, how many
 * neighbourhoods clear the member's "sold" sample floor BEFORE vs AFTER the
 * proposed merge. Estimate (not exact) because it sums each metric's sampleSize
 * across the raws folding into a canonical area rather than re-reading the CSV;
 * the true count is produced when apply() re-aggregates. Good enough to show the
 * member the payoff ("18 → 47 areas now citable").
 */
async function estimateFloorClearing(
  userId: string,
  map: Map<string, string>,
  floor: SampleFloor,
): Promise<{ before: number; after: number; latestUploadId: string | null }> {
  const latest = await prisma.marketDataUpload.findFirst({
    where: { userId, status: "validated" },
    orderBy: { uploadedAt: "desc" },
    select: { id: true },
  });
  if (!latest) return { before: 0, after: 0, latestUploadId: null };

  const rows = await prisma.aggregatedMetric.findMany({
    where: { userId, uploadId: latest.id },
    select: {
      neighbourhood: true,
      propertyType: true,
      metricKey: true,
      sampleSize: true,
    },
  });

  // BEFORE: representative sample per raw neighbourhood = max sampleSize across
  // its metric rows.
  const beforeRep = new Map<string, number>();
  // AFTER: sum sampleSize within (canonical|propertyType|metricKey), then the
  // representative per canonical = max across those summed buckets.
  const afterBuckets = new Map<string, number>();
  const canonicalOf = (raw: string) =>
    map.get(raw.trim().replace(/\s+/g, " ").toLowerCase()) ?? raw;

  for (const r of rows) {
    if (!r.neighbourhood || isNonAreaKey(normalizeAreaName(r.neighbourhood)))
      continue;
    const rawKey = r.neighbourhood;
    beforeRep.set(rawKey, Math.max(beforeRep.get(rawKey) ?? 0, r.sampleSize));

    const canonical = canonicalOf(r.neighbourhood);
    const bucket = `${canonical}||${r.propertyType}||${r.metricKey}`;
    afterBuckets.set(bucket, (afterBuckets.get(bucket) ?? 0) + r.sampleSize);
  }

  const afterRep = new Map<string, number>();
  for (const [bucket, sum] of afterBuckets) {
    const canonical = bucket.split("||")[0];
    afterRep.set(canonical, Math.max(afterRep.get(canonical) ?? 0, sum));
  }

  let before = 0;
  for (const v of beforeRep.values()) if (v >= floor.sold) before++;
  let after = 0;
  for (const v of afterRep.values()) if (v >= floor.sold) after++;

  return { before, after, latestUploadId: latest.id };
}

// ── Build a dry-run report ───────────────────────────────────────────────────

export async function buildMergeRunReport(
  userId: string,
  opts: {
    applyFuzzy?: boolean;
    source?: "manual" | "upload" | "jarvis";
    uploadId?: string | null;
    /** When true, return without persisting if there's nothing to clean up. */
    skipIfNoop?: boolean;
  } = {},
): Promise<{ mergeRunId: string | null; report: MergeRunReport }> {
  const rawNames = await gatherRawNames(userId);
  const proposal = await buildCanonicalProposal(userId, rawNames, {
    applyFuzzy: opts.applyFuzzy,
  });

  const settings = await loadMemberMetricSettings(userId);
  const floor = sampleFloorFor(settings.sampleSizeVariant);
  const floorClearing = await estimateFloorClearing(userId, proposal.map, floor);

  const topMerges: MergeRunGroupSummary[] = proposal.groups
    .filter((g) => g.variants.length > 1)
    .map((g) => ({
      canonical: g.display,
      variantCount: g.variants.length,
      variants: g.variants,
    }))
    .sort((a, b) => b.variantCount - a.variantCount)
    .slice(0, 50);

  const report: MergeRunReport = {
    generatedAt: new Date().toISOString(),
    rawCount: proposal.rawCount,
    canonicalCount: proposal.canonicalCount,
    collapsed: Math.max(0, proposal.rawCount - proposal.canonicalCount),
    fuzzyAppliedCount: proposal.fuzzyApplied.length,
    reviewQueueCount: proposal.reviewQueue.length,
    fuzzyApplied: proposal.fuzzyApplied,
    reviewQueue: proposal.reviewQueue,
    topMerges,
    floor,
    floorClearing: { ...floorClearing, estimated: true },
    fuzzyCostUsd: proposal.fuzzyCostUsd,
    fuzzySkippedReason: proposal.fuzzySkippedReason,
    groups: proposal.groups,
  };

  if (
    opts.skipIfNoop &&
    report.collapsed === 0 &&
    report.reviewQueueCount === 0
  ) {
    return { mergeRunId: null, report };
  }

  const run = await prisma.mergeRun.create({
    data: {
      userId,
      status: "DRY_RUN",
      source: opts.source ?? "manual",
      uploadId: opts.uploadId ?? null,
      rawCount: report.rawCount,
      canonicalCount: report.canonicalCount,
      fuzzyProposedCount: report.fuzzyAppliedCount,
      reviewQueueCount: report.reviewQueueCount,
      report: report as unknown as object,
    },
    select: { id: true },
  });

  return { mergeRunId: run.id, report };
}

// ── Apply / discard ──────────────────────────────────────────────────────────

/** Reconstruct a CanonicalProposal from a persisted report (no AI re-run). */
function proposalFromReport(report: MergeRunReport): CanonicalProposal {
  const map = new Map<string, string>();
  for (const g of report.groups) {
    for (const v of g.variants) map.set(v.toLowerCase(), g.display);
  }
  return {
    map,
    groups: report.groups,
    fuzzyApplied: report.fuzzyApplied,
    reviewQueue: report.reviewQueue,
    rawCount: report.rawCount,
    canonicalCount: report.canonicalCount,
    fuzzyCostUsd: report.fuzzyCostUsd,
    fuzzySkippedReason: report.fuzzySkippedReason,
  };
}

export interface ApplyResult {
  mergeRunId: string;
  uploadsReaggregated: number;
  factsRelabelled: number;
  canonicalCount: number;
  floorClearing: MergeRunReport["floorClearing"];
}

/**
 * Apply a DRY_RUN merge run: persist canonical areas/aliases, re-aggregate every
 * upload onto canonical names, relabel existing facts, refresh the vocab. Raw
 * CSVs and the report are retained, so this is reversible in principle and fully
 * auditable. Idempotent on the canonical map (upserts); safe to retry.
 */
export async function applyMergeRun(
  userId: string,
  mergeRunId: string,
): Promise<ApplyResult> {
  const run = await prisma.mergeRun.findFirst({
    where: { id: mergeRunId, userId },
    select: { id: true, status: true, report: true },
  });
  if (!run) throw new Error("Merge run not found");
  if (run.status === "APPLIED")
    throw new Error("Merge run is APPLIED, cannot apply");
  if (run.status === "DISCARDED")
    throw new Error("Merge run is DISCARDED, cannot apply");

  // ── Atomic claim (CAS) ────────────────────────────────────────────────────
  // Flip DRY_RUN → APPLYING in a single conditional UPDATE so two concurrent
  // apply requests (double-click, or Jarvis + UI racing) can't both run the
  // heavy mutation path. The winner gets count===1; the loser falls through to
  // the resume branch below. A crashed apply leaves the run stuck in APPLYING;
  // we let a *stale* APPLYING (no heartbeat for STALE_APPLYING_MS) be re-claimed
  // so a member can retry — every downstream step is idempotent (canonical
  // upserts, updateMany relabels, per-upload delete+recreate aggregation), so a
  // resume converges to the same state rather than double-applying.
  const STALE_APPLYING_MS = 5 * 60 * 1000;
  const claim = await prisma.mergeRun.updateMany({
    where: { id: mergeRunId, userId, status: "DRY_RUN" },
    data: { status: "APPLYING" },
  });
  if (claim.count === 0) {
    // Someone else moved it since our read. Re-read and decide.
    const cur = await prisma.mergeRun.findFirst({
      where: { id: mergeRunId, userId },
      select: { status: true, updatedAt: true },
    });
    if (!cur) throw new Error("Merge run not found");
    if (cur.status === "APPLIED")
      throw new Error("Merge run is APPLIED, cannot apply");
    if (cur.status === "DISCARDED")
      throw new Error("Merge run is DISCARDED, cannot apply");
    // status === APPLYING: only resume if it has gone stale (crashed mid-apply).
    const ageMs = Date.now() - cur.updatedAt.getTime();
    if (ageMs < STALE_APPLYING_MS) {
      throw new Error(
        "This cleanup is already being applied. Give it a moment and refresh.",
      );
    }
    const reclaim = await prisma.mergeRun.updateMany({
      where: {
        id: mergeRunId,
        userId,
        status: "APPLYING",
        updatedAt: { lt: new Date(Date.now() - STALE_APPLYING_MS) },
      },
      data: { status: "APPLYING" }, // touches updatedAt via @updatedAt → renews lease
    });
    if (reclaim.count === 0) {
      throw new Error(
        "This cleanup is already being applied. Give it a moment and refresh.",
      );
    }
  }

  const report = run.report as unknown as MergeRunReport;
  const proposal = proposalFromReport(report);

  // 1. Persist canonical areas + aliases.
  await persistCanonicalMap(userId, proposal);

  // 2. Re-aggregate every upload onto canonical names. aggregateUploadFromDb now
  //    builds a resolver that reflects the aliases we just wrote.
  const { aggregateUploadFromDb } = await import("@/lib/csv-aggregate");
  const { persistAggregatedMetrics } = await import("@/lib/aggregated-metrics");
  const uploads = await prisma.marketDataUpload.findMany({
    where: { userId, csvStorageUrl: { not: null } },
    select: { id: true },
    orderBy: { uploadedAt: "asc" },
  });
  let uploadsReaggregated = 0;
  const failedUploads: string[] = [];
  for (const u of uploads) {
    try {
      const { table } = await aggregateUploadFromDb(u.id);
      await persistAggregatedMetrics(u.id, userId, table);
      uploadsReaggregated++;
    } catch (err) {
      console.error(`[kb-merge][apply] re-aggregate failed upload=${u.id}`, err);
      failedUploads.push(u.id);
    }
  }
  // A partial re-aggregation leaves mixed old/new aggregates. Do NOT mark the
  // run APPLIED — leave it APPLYING (resumable) and surface the failure so the
  // member/admin can retry rather than trusting a half-applied state.
  if (failedUploads.length > 0) {
    throw new Error(
      `Re-aggregation failed for ${failedUploads.length} upload(s); ` +
        `cleanup left in APPLYING state for retry (run ${mergeRunId}).`,
    );
  }

  // 3. Relabel existing facts to canonical names + stamp canonicalAreaId.
  const areas = await prisma.canonicalArea.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const areaIdByName = new Map(areas.map((a) => [a.name.toLowerCase(), a.id]));
  let factsRelabelled = 0;
  for (const g of proposal.groups) {
    const areaId = areaIdByName.get(g.display.toLowerCase()) ?? null;
    // Match any stored fact whose neighbourhood is one of this group's variants
    // (or already the canonical display). Folds raw + previously-canonical rows.
    const names = Array.from(new Set([...g.variants, g.display]));
    const res = await prisma.marketFact.updateMany({
      where: { userId, neighbourhood: { in: names } },
      data: { neighbourhood: g.display, canonicalAreaId: areaId },
    });
    factsRelabelled += res.count;
  }

  // 4. Stamp AggregatedMetric.canonicalAreaId by canonical-name match.
  for (const a of areas) {
    await prisma.aggregatedMetric.updateMany({
      where: { userId, neighbourhood: a.name },
      data: { canonicalAreaId: a.id },
    });
  }

  // 5. Refresh the vocab to the canonical set (preserve any names we don't own).
  await refreshVocab(userId, proposal);

  // 6. Mark applied.
  await prisma.mergeRun.update({
    where: { id: mergeRunId },
    data: { status: "APPLIED", appliedAt: new Date() },
  });

  return {
    mergeRunId,
    uploadsReaggregated,
    factsRelabelled,
    canonicalCount: proposal.canonicalCount,
    floorClearing: report.floorClearing,
  };
}

/** Replace mapped raw vocab entries with their canonical display names. */
async function refreshVocab(
  userId: string,
  proposal: CanonicalProposal,
): Promise<void> {
  const cfg = await prisma.marketConfig.findUnique({
    where: { userId },
    select: { neighbourhoodVocab: true },
  });
  if (!cfg) return;
  const existing = Array.isArray(cfg.neighbourhoodVocab)
    ? (cfg.neighbourhoodVocab as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];

  const out = new Set<string>();
  for (const name of existing) {
    const mapped = proposal.map.get(name.trim().replace(/\s+/g, " ").toLowerCase());
    out.add(mapped ?? name);
  }
  // Ensure every canonical display is present.
  for (const g of proposal.groups) out.add(g.display);

  const merged = [...out].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  await prisma.marketConfig.update({
    where: { userId },
    data: { neighbourhoodVocab: merged },
  });
}

export async function discardMergeRun(
  userId: string,
  mergeRunId: string,
): Promise<void> {
  const run = await prisma.mergeRun.findFirst({
    where: { id: mergeRunId, userId },
    select: { id: true, status: true },
  });
  if (!run) throw new Error("Merge run not found");
  if (run.status !== "DRY_RUN")
    throw new Error(`Merge run is ${run.status}, cannot discard`);
  await prisma.mergeRun.update({
    where: { id: mergeRunId },
    data: { status: "DISCARDED" },
  });
}

export async function getLatestMergeRun(userId: string): Promise<{
  id: string;
  status: string;
  report: MergeRunReport;
  createdAt: Date;
  appliedAt: Date | null;
} | null> {
  const run = await prisma.mergeRun.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      report: true,
      createdAt: true,
      appliedAt: true,
    },
  });
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    report: run.report as unknown as MergeRunReport,
    createdAt: run.createdAt,
    appliedAt: run.appliedAt,
  };
}
