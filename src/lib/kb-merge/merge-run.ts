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
import { isMarketReaggKillSwitchActiveForUser } from "@/lib/feature-flags";

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
    // Wave 6a (Phase 1) parity: floor-clearing sums the overall rollups only, so
    // tier subgroups (which would double-count a hood's samples) are excluded.
    where: { userId, uploadId: latest.id, priceTier: null },
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

/** Rebuild the "biggest merges" summary after the group set changes. */
function rebuildTopMerges(groups: CanonicalGroup[]): MergeRunGroupSummary[] {
  return groups
    .filter((g) => g.variants.length > 1)
    .map((g) => ({
      canonical: g.display,
      variantCount: g.variants.length,
      variants: g.variants,
    }))
    .sort((a, b) => b.variantCount - a.variantCount)
    .slice(0, 50);
}

/**
 * Fold member-approved review-queue items into the proposal in place. Each key is
 * `${from}->${into}` (matching the review UI). For every match we move `from`'s
 * group variants into `into`'s group, drop the `from` group, move the proposal
 * from reviewQueue → fuzzyApplied (so persistence records it as a fuzzy alias
 * with its confidence), then rebuild the raw→display map + canonicalCount. This
 * is the SAME fold an auto-merge does in buildCanonicalProposal — the only
 * difference is the member, not the confidence threshold, approved it.
 *
 * Idempotent: a key whose `from` group is already gone (e.g. a resumed apply
 * after the augmented report was persisted) is skipped. Returns the number of
 * groups actually folded.
 */
function foldReviewSelections(
  proposal: CanonicalProposal,
  selectedKeys: string[],
): number {
  if (selectedKeys.length === 0) return 0;
  const selected = new Set(selectedKeys);
  const byDisplay = new Map<string, CanonicalGroup>();
  for (const g of proposal.groups) byDisplay.set(g.display.toLowerCase(), g);

  let folded = 0;
  for (const item of [...proposal.reviewQueue]) {
    const key = `${item.from}->${item.into}`;
    if (!selected.has(key)) continue;
    // It's been actioned — remove from the review queue regardless of outcome.
    proposal.reviewQueue = proposal.reviewQueue.filter((r) => r !== item);

    const fromGroup = byDisplay.get(item.from.toLowerCase());
    const intoGroup = byDisplay.get(item.into.toLowerCase());
    if (!fromGroup || !intoGroup || fromGroup === intoGroup) continue;

    for (const v of fromGroup.variants) {
      if (!intoGroup.variants.includes(v)) intoGroup.variants.push(v);
    }
    intoGroup.variants.sort((a, b) => a.localeCompare(b));
    intoGroup.fuzzyMerged = true;
    byDisplay.delete(fromGroup.display.toLowerCase());
    proposal.groups = proposal.groups.filter((g) => g !== fromGroup);
    proposal.fuzzyApplied = [...proposal.fuzzyApplied, item];
    folded++;
  }

  if (folded > 0) {
    const map = new Map<string, string>();
    for (const g of proposal.groups)
      for (const v of g.variants) map.set(v.toLowerCase(), g.display);
    proposal.map = map;
    proposal.canonicalCount = proposal.groups.length;
  }
  return folded;
}

export interface ApplyResult {
  mergeRunId: string;
  uploadsReaggregated: number;
  factsRelabelled: number;
  canonicalCount: number;
  floorClearing: MergeRunReport["floorClearing"];
}

/**
 * Persist a proposal whose review-queue selections have been folded back onto the
 * run's report (groups/counts/topMerges). Shared by the in-apply fold and the
 * pre-enqueue fold (foldReviewSelectionsIntoRun) so the two paths can never drift.
 */
async function persistFoldedReport(
  mergeRunId: string,
  report: MergeRunReport,
  proposal: CanonicalProposal,
): Promise<void> {
  const updatedReport: MergeRunReport = {
    ...report,
    groups: proposal.groups,
    fuzzyApplied: proposal.fuzzyApplied,
    reviewQueue: proposal.reviewQueue,
    fuzzyAppliedCount: proposal.fuzzyApplied.length,
    reviewQueueCount: proposal.reviewQueue.length,
    canonicalCount: proposal.canonicalCount,
    collapsed: Math.max(0, report.rawCount - proposal.canonicalCount),
    topMerges: rebuildTopMerges(proposal.groups),
  };
  await prisma.mergeRun.update({
    where: { id: mergeRunId },
    data: {
      report: updatedReport as unknown as object,
      canonicalCount: updatedReport.canonicalCount,
      reviewQueueCount: updatedReport.reviewQueueCount,
      fuzzyProposedCount: updatedReport.fuzzyAppliedCount,
    },
  });
}

/**
 * Durably fold the member's ticked review-queue selections into a DRY_RUN run's
 * plan BEFORE the apply is handed to the background worker.
 *
 * WHY: the durable path enqueues a pg-boss job keyed by mergeRunId. A second
 * apply click (e.g. a different selection) would be DEDUPED by that singletonKey,
 * so a selection carried only in the job payload could be silently dropped. By
 * recording the selection on the run here, the persisted report — not a
 * droppable payload — is the source of truth; the worker then applies with an
 * empty selection and reproduces the plan from the report. Idempotent (re-folding
 * an already-folded selection is a no-op) and a no-op unless the run is DRY_RUN.
 */
export async function foldReviewSelectionsIntoRun(
  userId: string,
  mergeRunId: string,
  selectedReviewKeys: string[],
): Promise<void> {
  if (selectedReviewKeys.length === 0) return;
  const run = await prisma.mergeRun.findFirst({
    where: { id: mergeRunId, userId },
    select: { status: true, report: true },
  });
  if (!run || run.status !== "DRY_RUN") return;
  const report = run.report as unknown as MergeRunReport;
  const proposal = proposalFromReport(report);
  const foldedCount = foldReviewSelections(proposal, selectedReviewKeys);
  if (foldedCount === 0) return;
  await persistFoldedReport(mergeRunId, report, proposal);
}

// ── Manual group edits (member-driven, DRY_RUN only) ─────────────────────────
// Members can rename a group's master, merge groups together, or move/split a
// variant out — even when "0 needs review". Every edit mutates the DRY_RUN
// run's report.groups in place and re-persists it, so the existing applyMergeRun
// reproduces the edited plan and inherits ALL safety guarantees (kill-switch,
// CAS claim, roll-up re-aggregation, fact relabel, audit trail). Nothing is
// applied until the member confirms. Edits are rejected once a run leaves
// DRY_RUN.

const cleanLower = (s: string) =>
  (s ?? "").toString().trim().replace(/\s+/g, " ").toLowerCase();
const cleanName = (s: string) => (s ?? "").toString().trim().replace(/\s+/g, " ");

/**
 * Load a DRY_RUN run, hand its (cloned) groups to `mutate` for in-place editing,
 * then rebuild the derived report fields (map-driven floor estimate, counts,
 * topMerges) and persist. `mutate` throws member-facing Errors on validation
 * failure; nothing is written when it throws.
 */
async function applyGroupEdit(
  userId: string,
  mergeRunId: string,
  mutate: (groups: CanonicalGroup[]) => void,
): Promise<MergeRunReport> {
  const run = await prisma.mergeRun.findFirst({
    where: { id: mergeRunId, userId },
    select: { status: true, report: true },
  });
  if (!run) throw new Error("Merge run not found");
  if (run.status !== "DRY_RUN")
    throw new Error(
      `This cleanup is ${run.status.toLowerCase()} and can no longer be edited.`,
    );

  const report = run.report as unknown as MergeRunReport;
  const groups: CanonicalGroup[] = report.groups.map((g) => ({
    ...g,
    variants: [...g.variants],
  }));

  mutate(groups);

  // Drop any group emptied by a move, then rebuild the raw→display map.
  const cleaned = groups.filter((g) => g.variants.length > 0);
  const map = new Map<string, string>();
  for (const g of cleaned)
    for (const v of g.variants) map.set(cleanLower(v), g.display);

  const floorClearing = await estimateFloorClearing(userId, map, report.floor);

  const updated: MergeRunReport = {
    ...report,
    groups: cleaned,
    canonicalCount: cleaned.length,
    collapsed: Math.max(0, report.rawCount - cleaned.length),
    topMerges: rebuildTopMerges(cleaned),
    floorClearing: { ...floorClearing, estimated: true },
  };

  await prisma.mergeRun.update({
    where: { id: mergeRunId },
    data: {
      report: updated as unknown as object,
      canonicalCount: updated.canonicalCount,
    },
  });
  return updated;
}

/** Rename a group's canonical master name (e.g. "Trinity Falls Planning East" → "Trinity Falls"). */
export async function renameGroupMaster(
  userId: string,
  mergeRunId: string,
  opts: { groupDisplay: string; newDisplay: string },
): Promise<MergeRunReport> {
  const newDisplay = cleanName(opts.newDisplay);
  if (!newDisplay) throw new Error("Enter a name for this area.");
  return applyGroupEdit(userId, mergeRunId, (groups) => {
    const g = groups.find(
      (x) => cleanLower(x.display) === cleanLower(opts.groupDisplay),
    );
    if (!g) throw new Error("That area is no longer in this cleanup.");
    // Case-only rename of the same group is always allowed.
    if (cleanLower(g.display) !== cleanLower(newDisplay)) {
      if (
        groups.some(
          (x) => x !== g && cleanLower(x.display) === cleanLower(newDisplay),
        )
      )
        throw new Error(
          `"${newDisplay}" is already another area. Merge them instead, or pick a different name.`,
        );
      if (
        groups.some(
          (x) =>
            x !== g &&
            x.variants.some((v) => cleanLower(v) === cleanLower(newDisplay)),
        )
      )
        throw new Error(
          `"${newDisplay}" is currently folded into another area. Move it out first, or pick a different name.`,
        );
    }
    g.display = newDisplay;
    g.manual = true;
  });
}

/**
 * Merge areas into one master. The `master` may be:
 *  - one of the selected `displays` (combine the selection under that name),
 *  - a brand-new name not used by any area (rename the combined group), or
 *  - an EXISTING area not in the selection — in which case the selected groups
 *    fold INTO that existing area (the common "merge this group into the real
 *    community" action) and the existing area's exact name is preserved.
 * Variants from every contributing group combine; counts roll up at apply.
 */
export async function mergeGroups(
  userId: string,
  mergeRunId: string,
  opts: { displays: string[]; master: string },
): Promise<MergeRunReport> {
  const master = cleanName(opts.master);
  if (!master) throw new Error("Enter a master name for the merged area.");
  const wanted = new Set((opts.displays ?? []).map(cleanLower));
  if (wanted.size < 1) throw new Error("Pick at least one area to merge.");
  return applyGroupEdit(userId, mergeRunId, (groups) => {
    const targets = groups.filter((g) => wanted.has(cleanLower(g.display)));
    if (targets.length === 0)
      throw new Error(
        "Some of those areas are no longer in this cleanup. Refresh and try again.",
      );

    // If the master names an EXISTING area that wasn't selected, fold the
    // selection INTO it (merge-into-existing) rather than rejecting the name.
    const masterGroup = groups.find(
      (g) => cleanLower(g.display) === cleanLower(master),
    );
    if (masterGroup && !targets.includes(masterGroup)) targets.push(masterGroup);

    if (targets.length < 2)
      throw new Error(
        "Pick at least two areas to merge — or choose a different existing area to merge into.",
      );

    // Only a BRAND-NEW master name needs the variant-collision guard: it must
    // not clash with a name currently folded inside a group we're not touching
    // (that would create an ambiguous second home for the same raw name).
    if (!masterGroup) {
      const outside = groups.filter((g) => !targets.includes(g));
      if (
        outside.some((g) =>
          g.variants.some((v) => cleanLower(v) === cleanLower(master)),
        )
      )
        throw new Error(
          `"${master}" is currently folded into another area. Move it out first, or pick a different master.`,
        );
    }

    // Preserve the existing area's exact name when merging into it; otherwise
    // use the typed master. normKey comes from the master area, else the largest.
    const display = masterGroup ? masterGroup.display : master;
    const baseGroup =
      masterGroup ??
      [...targets].sort((a, b) => b.variants.length - a.variants.length)[0];

    const mergedVariants: string[] = [];
    const seen = new Set<string>();
    for (const g of targets)
      for (const v of g.variants) {
        const k = cleanLower(v);
        if (!seen.has(k)) {
          seen.add(k);
          mergedVariants.push(v);
        }
      }
    mergedVariants.sort((a, b) => a.localeCompare(b));

    const firstIdx = groups.findIndex((g) => targets.includes(g));
    for (let i = groups.length - 1; i >= 0; i--)
      if (targets.includes(groups[i])) groups.splice(i, 1);
    groups.splice(Math.max(0, firstIdx), 0, {
      display,
      normKey: baseGroup.normKey,
      variants: mergedVariants,
      fuzzyMerged: true,
      manual: true,
    });
  });
}

/**
 * Move a single variant out of its current group and into `toDisplay` — an
 * existing group, or a brand-new one (split-out). Pass `toDisplay === variant`
 * to split it into its own standalone area.
 */
export async function moveVariant(
  userId: string,
  mergeRunId: string,
  opts: { variant: string; toDisplay: string },
): Promise<MergeRunReport> {
  const variant = cleanName(opts.variant);
  const toDisplay = cleanName(opts.toDisplay);
  if (!variant) throw new Error("No area selected to move.");
  if (!toDisplay) throw new Error("Enter where to move this area.");
  return applyGroupEdit(userId, mergeRunId, (groups) => {
    const from = groups.find((g) =>
      g.variants.some((v) => cleanLower(v) === cleanLower(variant)),
    );
    if (!from) throw new Error("That name is no longer in this cleanup.");
    from.variants = from.variants.filter(
      (v) => cleanLower(v) !== cleanLower(variant),
    );

    let to = groups.find((g) => cleanLower(g.display) === cleanLower(toDisplay));
    if (!to) {
      to = {
        display: toDisplay,
        normKey: normalizeAreaName(variant) || normalizeAreaName(toDisplay),
        variants: [],
        fuzzyMerged: false,
        manual: true,
      };
      groups.push(to);
    } else if (to !== from) {
      to.manual = true;
    }
    if (!to.variants.some((v) => cleanLower(v) === cleanLower(variant)))
      to.variants.push(variant);
    to.variants.sort((a, b) => a.localeCompare(b));
  });
}

/**
 * Estimate the combined "sold" sample a proposed master would carry from the
 * latest validated upload, so the member can see it clears the floor BEFORE
 * confirming. Read-only. Mirrors estimateFloorClearing's "after" representative
 * (sum sampleSize within propertyType||metricKey, then max across buckets).
 */
export async function previewCombinedSamples(
  userId: string,
  variants: string[],
): Promise<{ combined: number; floorSold: number; clears: boolean }> {
  const settings = await loadMemberMetricSettings(userId);
  const floor = sampleFloorFor(settings.sampleSizeVariant);
  const wanted = new Set((variants ?? []).map(cleanLower));
  if (wanted.size === 0)
    return { combined: 0, floorSold: floor.sold, clears: false };

  const latest = await prisma.marketDataUpload.findFirst({
    where: { userId, status: "validated" },
    orderBy: { uploadedAt: "desc" },
    select: { id: true },
  });
  if (!latest) return { combined: 0, floorSold: floor.sold, clears: false };

  const rows = await prisma.aggregatedMetric.findMany({
    // Wave 6a (Phase 1) parity: overall rollups only (tier subgroups would
    // double-count a hood's samples in the combined-floor estimate).
    where: { userId, uploadId: latest.id, priceTier: null },
    select: {
      neighbourhood: true,
      propertyType: true,
      metricKey: true,
      sampleSize: true,
    },
  });

  const buckets = new Map<string, number>();
  for (const r of rows) {
    if (!r.neighbourhood || !wanted.has(cleanLower(r.neighbourhood))) continue;
    const k = `${r.propertyType}||${r.metricKey}`;
    buckets.set(k, (buckets.get(k) ?? 0) + r.sampleSize);
  }
  let combined = 0;
  for (const v of buckets.values()) combined = Math.max(combined, v);
  return { combined, floorSold: floor.sold, clears: combined >= floor.sold };
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
  opts: { selectedReviewKeys?: string[] } = {},
): Promise<ApplyResult> {
  // Market re-aggregation break-glass — deepest backstop for EVERY apply path
  // (member route, Jarvis route, Jarvis orchestrator tool, and the durable
  // worker, which can run an already-enqueued apply after the flag flips on).
  // Thrown BEFORE the CAS claim below, so a frozen run stays in DRY_RUN and is
  // fully resumable once the freeze is lifted. The HTTP/chat callers short-
  // circuit with a clean 423/message before reaching here; this throw only
  // fires for paths that bypassed those guards.
  if (await isMarketReaggKillSwitchActiveForUser(userId)) {
    throw new Error(
      "Market re-aggregation is paused (kill-switch active); merge apply refused.",
    );
  }

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

  // 0. Fold any review-queue near-duplicates the member explicitly ticked into
  //    the plan (human-approved, same fold as an auto-merge). For the durable
  //    (worker) path the selection was already folded + persisted at enqueue time
  //    (foldReviewSelectionsIntoRun), so here it re-folds an EMPTY selection
  //    (no-op) and simply reproduces the plan from the persisted report. For the
  //    in-request path it folds the passed selection now. Either way we persist
  //    the augmented report up front so a resumed apply reproduces the same plan.
  //    Idempotent on resume.
  const foldedCount = foldReviewSelections(
    proposal,
    opts.selectedReviewKeys ?? [],
  );
  if (foldedCount > 0) {
    await persistFoldedReport(mergeRunId, report, proposal);
  }

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
  // Renew the APPLYING lease as we go. The stale-reclaim window above is 5 min,
  // but a first big backlog re-aggregates every upload and can run far longer
  // (~30 min on the worker). Without a renewal, a live apply would look "stale"
  // after 5 min and a concurrent trigger could reclaim it and run the heavy
  // mutation a second time. Bumping updatedAt (status APPLYING → APPLYING) keeps
  // a living apply's lease fresh; only a genuinely dead holder lets it expire.
  const LEASE_RENEW_MS = 60 * 1000;
  let lastLeaseRenewAt = Date.now();
  for (const u of uploads) {
    if (Date.now() - lastLeaseRenewAt > LEASE_RENEW_MS) {
      await prisma.mergeRun.updateMany({
        where: { id: mergeRunId, userId, status: "APPLYING" },
        data: { status: "APPLYING" },
      });
      lastLeaseRenewAt = Date.now();
    }
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
