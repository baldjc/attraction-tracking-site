// Wave 1 — Deterministic aggregated metrics persistence + read.
//
// Computes per-(neighbourhood, propertyType, metricFamily) ground-truth
// numbers from the in-memory AggregatedTable (output of `csv-aggregate.ts`)
// and persists them to the `AggregatedMetric` table BEFORE the Sonnet
// fact-validator runs. Script Builder v2 later loads these rows as the
// "source of truth" block injected into the Claude prompt, preventing
// the script writer from fabricating or misattributing stats.
//
// Persisted scope: only groups where `priceTier === null` (city-wide +
// neighbourhood-level overall rollups). Tiered subgroups are intentionally
// skipped because the script writer queries on (neighbourhood, propertyType)
// without a price tier, and including them would violate the unique key.
//
// Field-name mapping is anchored to the real `AggregatedGroup` interface
// in `src/lib/csv-aggregate.ts` (verified prior to writing this file —
// the spec's earlier guesses like `moi` / `avgPrice` / `inventoryCount`
// do not exist on the real type).

import prisma from "@/lib/prisma";
import type { AggregatedGroup, AggregatedTable } from "@/lib/csv-aggregate";

export type MetricFamily =
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

/**
 * Per-family minimum sample sizes required to persist (and surface to the
 * script writer as ground truth). Below threshold, the deterministic
 * number is too noisy to publish as "the number" and we skip it — the
 * validator's prose facts will still carry caveats for low-N callouts.
 *
 * Per direction:  INVENTORY=1  FAILURE_RATE=5  AVG=5  MOI=3  OTHER=10.
 * MOI is intentionally permissive (n≥3) so thin neighbourhoods still
 * get a deterministic inventory-pressure read — the script's prose
 * caveats handle the low-volume note.
 * Conventional minimums (MEDIAN/DOM/SP_LP/PSF/BENCHMARK) stay at 5.
 */
const SAMPLE_THRESHOLDS: Record<MetricFamily, number> = {
  MEDIAN: 5,
  MOI: 3,
  DOM: 5,
  SP_LP: 5,
  PSF: 5,
  BENCHMARK: 5,
  AVG: 5,
  INVENTORY: 1,
  FAILURE_RATE: 5,
  OTHER: 10,
};

interface MetricRow {
  neighbourhood: string;
  propertyType: string;
  priceTier: string | null;
  metricFamily: MetricFamily;
  metricKey: string;
  metricValue: number;
  sampleSize: number;
  monthYear: string;
  yoyDelta: number | null;
  rolling90dValue: number | null;
  compositionShiftFlag: boolean;
}

/**
 * Walk an AggregatedGroup and yield one MetricRow per supported family
 * where the value is finite and the sampleSize meets the family-specific
 * floor. Skips tiered subgroups (priceTier !== null).
 */
function rowsFromGroup(
  group: AggregatedGroup,
  monthYear: string,
): MetricRow[] {
  if (group.priceTier !== null) return [];

  const propertyType = group.propertyType ?? "All";
  const out: MetricRow[] = [];

  const push = (
    metricFamily: MetricFamily,
    metricKey: string,
    value: number | null,
    sampleSize: number,
    extras: {
      yoyDelta?: number | null;
      rolling90dValue?: number | null;
    } = {},
  ) => {
    if (value == null || !Number.isFinite(value)) return;
    if (sampleSize < SAMPLE_THRESHOLDS[metricFamily]) return;
    out.push({
      neighbourhood: group.neighbourhood,
      propertyType,
      priceTier: null,
      metricFamily,
      metricKey,
      metricValue: value,
      sampleSize,
      monthYear,
      yoyDelta: extras.yoyDelta ?? null,
      rolling90dValue: extras.rolling90dValue ?? null,
      compositionShiftFlag: group.compositionShiftFlag,
    });
  };

  // Sample size for price/sale-driven metrics is the count of Sold rows
  // (== `group.sampleSize`). Inventory uses activeCount. Failure-rate uses
  // the union of completed-closed and removed-without-sale rows.
  const soldN = group.sampleSize;

  push("MEDIAN", "medianPrice", group.medianPrice, soldN, {
    yoyDelta: group.yoy.medianPriceDelta,
    rolling90dValue: group.rolling90d.medianPrice,
  });
  push("MOI", "moiStrict", group.moiStrict, soldN, {
    yoyDelta: group.yoy.moiStrictDelta,
    rolling90dValue: group.rolling90d.moiStrict,
  });
  push("DOM", "domMedian", group.domMedian, soldN);
  push("SP_LP", "spLpRatio", group.spLpRatio, soldN);
  push("PSF", "psf", group.psf, soldN, {
    yoyDelta: group.yoy.psfDelta,
    rolling90dValue: group.rolling90d.psf,
  });

  // Inventory == count of Active listings in the snapshot. Sample size
  // is the active count itself (it IS the measurement).
  push("INVENTORY", "activeCount", group.activeCount, group.activeCount);

  // Failure rate denominator is sold + removed; that's the meaningful N.
  const failN =
    group.soldCount +
    group.expiredCount +
    group.terminatedCount +
    group.withdrawnCount;
  push("FAILURE_RATE", "failureRate", group.failureRate, failN);

  return out;
}

/**
 * Persist deterministic aggregations for an upload. Idempotent: deletes
 * any prior rows for the same (userId, uploadId) first so a re-run of
 * the validator (or backfill on an already-processed upload) leaves a
 * clean set. Chunks the createMany into 500-row batches.
 *
 * Returns the count of rows written.
 */
export async function persistAggregatedMetrics(
  uploadId: string,
  userId: string,
  table: AggregatedTable,
): Promise<number> {
  const monthYear = table.meta.monthYear;
  const allRows: MetricRow[] = [];
  for (const group of table.groups) {
    allRows.push(...rowsFromGroup(group, monthYear));
  }

  // Atomic replace. If the create fails mid-way, the prior delete still
  // commits — but that's acceptable for this table (it's a deterministic
  // projection, can always be rebuilt from the CSV via the backfill).
  await prisma.aggregatedMetric.deleteMany({
    where: { userId, uploadId },
  });

  if (allRows.length === 0) return 0;

  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const slice = allRows.slice(i, i + CHUNK).map((r) => ({
      userId,
      uploadId,
      neighbourhood: r.neighbourhood,
      propertyType: r.propertyType,
      priceTier: r.priceTier,
      metricFamily: r.metricFamily,
      metricKey: r.metricKey,
      metricValue: r.metricValue,
      sampleSize: r.sampleSize,
      monthYear: r.monthYear,
      yoyDelta: r.yoyDelta,
      rolling90dValue: r.rolling90dValue,
      compositionShiftFlag: r.compositionShiftFlag,
    }));
    const res = await prisma.aggregatedMetric.createMany({
      data: slice,
      skipDuplicates: true,
    });
    written += res.count;
  }
  return written;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read side — Script Builder v2 source-of-truth block.
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceOfTruthMetric {
  neighbourhood: string;
  propertyType: string;
  metricFamily: MetricFamily;
  metricKey: string;
  metricValue: number;
  sampleSize: number;
  monthYear: string;
  yoyDelta: number | null;
  rolling90dValue: number | null;
  compositionShiftFlag: boolean;
}

/**
 * Fetch source-of-truth metrics for the (userId, uploadIds, neighbourhoods)
 * combination cited in a script. Always also includes the "All Neighbourhoods"
 * rollup so the writer can anchor city-wide comparisons.
 *
 * `neighbourhoods` is an inclusive filter — if empty, returns ALL rows for
 * the supplied uploadIds (used by debug / backfill probes).
 */
export async function getSourceOfTruthMetrics(args: {
  userId: string;
  uploadIds: string[];
  neighbourhoods?: string[];
}): Promise<SourceOfTruthMetric[]> {
  const { userId, uploadIds, neighbourhoods } = args;
  if (uploadIds.length === 0) return [];

  const nbhdFilter =
    neighbourhoods && neighbourhoods.length > 0
      ? {
          neighbourhood: {
            in: Array.from(
              new Set([...neighbourhoods, "All Neighbourhoods"]),
            ),
          },
        }
      : {};

  const rows = await prisma.aggregatedMetric.findMany({
    where: {
      userId,
      uploadId: { in: uploadIds },
      ...nbhdFilter,
    },
    orderBy: [
      { neighbourhood: "asc" },
      { propertyType: "asc" },
      { metricFamily: "asc" },
    ],
  });
  return rows.map((r) => ({
    neighbourhood: r.neighbourhood,
    propertyType: r.propertyType,
    metricFamily: r.metricFamily as MetricFamily,
    metricKey: r.metricKey,
    metricValue: r.metricValue,
    sampleSize: r.sampleSize,
    monthYear: r.monthYear,
    yoyDelta: r.yoyDelta,
    rolling90dValue: r.rolling90dValue,
    compositionShiftFlag: r.compositionShiftFlag,
  }));
}

/**
 * Format a tolerant numeric value for the source-of-truth block. Currency
 * (MEDIAN/PSF) gets `$` and thousands separators; ratios/rates get `%`;
 * MOI gets "months"; DOM gets "days"; everything else is bare numeric.
 */
function formatValue(family: MetricFamily, value: number): string {
  switch (family) {
    case "MEDIAN":
    case "AVG":
    case "BENCHMARK":
      return `$${Math.round(value).toLocaleString("en-US")}`;
    case "PSF":
      return `$${value.toFixed(2)}/sqft`;
    case "MOI":
      return `${value.toFixed(1)} months`;
    case "DOM":
      return `${Math.round(value)} days`;
    case "SP_LP":
      // spLpRatio is stored as a ratio (e.g. 0.994). Render as %.
      return value <= 2
        ? `${(value * 100).toFixed(1)}%`
        : `${value.toFixed(1)}%`;
    case "FAILURE_RATE":
      return value <= 1
        ? `${(value * 100).toFixed(1)}%`
        : `${value.toFixed(1)}%`;
    case "INVENTORY":
      return `${Math.round(value)} active`;
    default:
      return value.toString();
  }
}

function formatDelta(value: number | null): string {
  // `yoyDelta` is persisted as a percentage already (csv-aggregate's
  // `pctDelta()` returns `(curr - prev) / prev * 100`), so a stored
  // value of `1.5` means "+1.5%", NOT "+150%". Do not auto-scale
  // — small magnitudes like ±0.4 or ±1.5 are real sub-2% YoY moves.
  if (value == null || !Number.isFinite(value)) return "";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Render the source-of-truth metrics as a compact Markdown block suitable
 * for injection into Claude's user message. Empty rows array → empty string
 * (caller decides whether to emit the section header).
 */
export function renderSourceOfTruthBlock(
  rows: SourceOfTruthMetric[],
): string {
  if (rows.length === 0) return "";

  // Group by (neighbourhood, propertyType, monthYear) so multi-upload
  // requests (e.g. April + March cited together) never merge rows from
  // different months under one header — that would mislabel the
  // deterministic context Claude is told to treat as LAW.
  const byKey = new Map<string, SourceOfTruthMetric[]>();
  for (const r of rows) {
    const k = `${r.neighbourhood}||${r.propertyType}||${r.monthYear}`;
    const arr = byKey.get(k);
    if (arr) arr.push(r);
    else byKey.set(k, [r]);
  }

  const lines: string[] = [];
  for (const [key, group] of byKey) {
    const [neighbourhood, propertyType, monthYear] = key.split("||");
    lines.push(
      `### ${neighbourhood} | ${propertyType} (month: ${monthYear})`,
    );
    for (const m of group) {
      const parts: string[] = [
        `- **${m.metricFamily}** (${m.metricKey}): ${formatValue(
          m.metricFamily,
          m.metricValue,
        )} [n=${m.sampleSize}]`,
      ];
      const yoy = formatDelta(m.yoyDelta);
      if (yoy) parts.push(`YoY ${yoy}`);
      if (m.rolling90dValue != null && Number.isFinite(m.rolling90dValue)) {
        parts.push(
          `90d ${formatValue(m.metricFamily, m.rolling90dValue)}`,
        );
      }
      if (m.compositionShiftFlag) parts.push("⚠ composition-shift");
      lines.push(parts.join(" | "));
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
