// Knowledge-Base cleanup — per-name decision data.
//
// Surfaces, for each RAW neighbourhood name the member sees in the cleanup /
// vocab lists, enough context to judge whether two names are the same place:
//   • homes   — total rows carrying that name in the latest validated upload
//   • sold    — Sold rows (uses the member's proven status mapping)
//   • city    — most-common city value (only when a City column is mapped or
//               obviously present in the CSV; null otherwise)
//   • sampleAddress — one example street address (only when an address column is
//               present; null otherwise)
//
// Read-only. NO writes, NO re-aggregation, NO canonical resolution — this is
// pure context for the human, sourced straight from the raw CSV so it reflects
// the exact raw names (pre-merge) the member is comparing. Reconciliation /
// persistence (the proven engine) is untouched.

import prisma from "@/lib/prisma";
import { parseCsvRecords } from "@/lib/csv-parse-options";
import { readUploadFile } from "@/lib/market-csv";
import {
  resolveStatusMapping,
  bucketStatus,
  type StatusMapping,
} from "@/lib/market-status-buckets";
import type { ColumnMapping } from "@/lib/market-config";

export interface AreaNameStat {
  /** Original (raw) display of the name, as first seen in the CSV. */
  name: string;
  /** Total rows carrying this name. */
  homes: number;
  /** Sold rows (per the member's status mapping; all rows when no status col). */
  sold: number;
  /** Most-common non-empty city for this name, or null when unavailable. */
  city: string | null;
  /** One example address for this name, or null when no address column. */
  sampleAddress: string | null;
}

export interface AreaStatsResult {
  /** lowercased-trimmed name → stat. */
  stats: Record<string, AreaNameStat>;
  /** True when a city column was found, so the UI can show city. */
  hasCity: boolean;
  /** True when an address column was found. */
  hasAddress: boolean;
  /** monthYear of the upload these stats came from, for the UI caption. */
  monthYear: string | null;
  /** False when no validated upload / CSV could be read (UI degrades to names). */
  available: boolean;
}

const EMPTY: AreaStatsResult = {
  stats: {},
  hasCity: false,
  hasAddress: false,
  monthYear: null,
  available: false,
};

const CITY_HEADER_CANDIDATES = ["city", "municipality", "town", "cityname"];
const ADDRESS_HEADER_CANDIDATES = [
  "address",
  "streetaddress",
  "propertyaddress",
  "fulladdress",
  "unparsedaddress",
  "street",
  "addressline1",
];

function normalizeHeader(h: string): string {
  return h.toString().trim().toLowerCase().replace(/[\s_]+/g, "");
}

/** Bound the Object Storage read — the SDK has no built-in timeout. */
async function readWithTimeout(
  storageKey: string,
  ms: number,
): Promise<Buffer | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<Buffer | null>([
      readUploadFile(storageKey),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Compute per-raw-name stats from the member's latest validated upload. Returns
 * an empty (available:false) result on any failure so callers can degrade to
 * plain names without surfacing an error.
 */
export async function loadAreaStats(userId: string): Promise<AreaStatsResult> {
  const upload = await prisma.marketDataUpload.findFirst({
    where: { userId, status: "validated", csvStorageUrl: { not: null } },
    orderBy: { uploadedAt: "desc" },
    select: { csvStorageUrl: true, monthYear: true },
  });
  if (!upload?.csvStorageUrl) return EMPTY;

  const buf = await readWithTimeout(upload.csvStorageUrl, 10_000);
  if (!buf) return { ...EMPTY, monthYear: upload.monthYear };

  const { getMarketConfigForUser } = await import("@/lib/market-config-server");
  const config = await getMarketConfigForUser(userId);
  if (!config) return { ...EMPTY, monthYear: upload.monthYear };

  const mapping: ColumnMapping = config.columnMapping ?? {};
  if (!mapping.neighbourhood) return { ...EMPTY, monthYear: upload.monthYear };

  let rows: Record<string, string>[];
  try {
    const text = buf.toString("utf8").replace(/^\uFEFF/, "");
    rows = parseCsvRecords<Record<string, string>>(text, { columns: true });
  } catch {
    return { ...EMPTY, monthYear: upload.monthYear };
  }
  if (rows.length === 0) return { ...EMPTY, monthYear: upload.monthYear };

  const headers = Object.keys(rows[0]);
  const headerLookup = new Map<string, string>();
  for (const h of headers) headerLookup.set(normalizeHeader(h), h);

  const resolveHeader = (mapped: string | undefined): string | null => {
    if (!mapped) return null;
    if (mapped in (rows[0] ?? {})) return mapped;
    return headerLookup.get(normalizeHeader(mapped)) ?? null;
  };
  const detectHeader = (candidates: string[]): string | null => {
    for (const c of candidates) {
      const actual = headerLookup.get(c);
      if (actual) return actual;
    }
    return null;
  };

  const neighbourhoodHeader = resolveHeader(mapping.neighbourhood);
  if (!neighbourhoodHeader) return { ...EMPTY, monthYear: upload.monthYear };

  const statusHeader = resolveHeader(mapping.status);
  const statusMapping: StatusMapping = resolveStatusMapping(config);
  const cityHeader = resolveHeader(mapping.city) ?? detectHeader(CITY_HEADER_CANDIDATES);
  const addressHeader = detectHeader(ADDRESS_HEADER_CANDIDATES);

  interface Acc {
    name: string;
    homes: number;
    sold: number;
    cityCounts: Map<string, number>;
    sampleAddress: string | null;
  }
  const byName = new Map<string, Acc>();

  for (const row of rows) {
    const rawName = (row[neighbourhoodHeader] ?? "").toString().trim();
    if (!rawName) continue;
    const key = rawName.toLowerCase();
    let acc = byName.get(key);
    if (!acc) {
      acc = { name: rawName, homes: 0, sold: 0, cityCounts: new Map(), sampleAddress: null };
      byName.set(key, acc);
    }
    acc.homes += 1;

    // No status column mapped → treat every row as sold (mirrors csv-aggregate).
    const isSold = statusHeader
      ? bucketStatus(row[statusHeader], statusMapping) === "sold"
      : true;
    if (isSold) acc.sold += 1;

    if (cityHeader) {
      const city = (row[cityHeader] ?? "").toString().trim();
      if (city) acc.cityCounts.set(city, (acc.cityCounts.get(city) ?? 0) + 1);
    }
    if (addressHeader && !acc.sampleAddress) {
      const addr = (row[addressHeader] ?? "").toString().trim();
      if (addr) acc.sampleAddress = addr;
    }
  }

  const stats: Record<string, AreaNameStat> = {};
  for (const [key, acc] of byName) {
    let city: string | null = null;
    let best = 0;
    for (const [c, n] of acc.cityCounts) {
      if (n > best) {
        best = n;
        city = c;
      }
    }
    stats[key] = {
      name: acc.name,
      homes: acc.homes,
      sold: acc.sold,
      city,
      sampleAddress: acc.sampleAddress,
    };
  }

  return {
    stats,
    hasCity: !!cityHeader,
    hasAddress: !!addressHeader,
    monthYear: upload.monthYear,
    available: true,
  };
}
