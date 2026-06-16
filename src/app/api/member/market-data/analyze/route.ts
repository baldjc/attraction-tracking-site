import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireMarketAccess } from "@/lib/market-config-server";
import { toShape } from "@/lib/market-config";
import {
  REQUIRED_MAPPING_FIELDS,
  MAPPER_OPTIONAL_FIELDS,
  FIELD_LABELS,
  validateColumnMapping,
  suggestMappingFromHeaders,
  type ColumnMapping,
  type AnyMappedField,
} from "@/lib/market-config";
import { resolveEffectiveMapping } from "@/lib/csv-aggregate";
import {
  resolveStatusMapping,
  countByBucket,
  proposeStatusBucket,
  type StatusMapping,
  type MappableBucket,
} from "@/lib/market-status-buckets";
import { parseCsvPreview } from "@/lib/market-csv";

export const runtime = "nodejs";

/** Normalize a header for case/whitespace-insensitive matching (mirrors the
 *  aggregator's normalizeHeader so analyze and aggregation agree on which
 *  column a mapped field resolves to). */
function normHeader(h: string): string {
  return h.toString().trim().toLowerCase().replace(/[\s_]+/g, "");
}

/** Resolve a mapped header to its column index in this file (exact, then
 *  normalized). Returns -1 if the column isn't present. */
function headerIndex(headers: string[], mappedHeader: string | undefined): number {
  if (!mappedHeader) return -1;
  const exact = headers.indexOf(mappedHeader);
  if (exact >= 0) return exact;
  const target = normHeader(mappedHeader);
  return headers.findIndex((h) => normHeader(h) === target);
}

interface StatusValueRow {
  value: string;
  count: number;
  bucket: "sold" | "offMarket" | "active" | "pending" | "unknown";
  alreadyMapped: boolean;
  proposed: MappableBucket | null;
}

/**
 * POST multipart — Task #66 pre-upload analysis.
 *
 * Fields:
 *   file: one CSV (the representative/oldest file from the batch)
 *   columnMapping: optional JSON object (a not-yet-saved mapping the member is
 *     about to use; falls back to their saved MarketConfig.columnMapping)
 *
 * Deterministic + ZERO AI cost. Returns everything the client needs to render
 * the column-mapping / status-mapping / preview steps before paying for a
 * Claude validation run:
 *   - column-mapping completeness against THIS file's headers
 *   - distinct status values + counts, each with a proposed bucket + whether it
 *     already resolves under the member's mapping
 *   - classified bucket counts (the preview gate)
 *   - one sample row read through the effective mapping
 */
export async function POST(req: NextRequest) {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;
  const userId = access.user.id;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  // Optional not-yet-saved mapping the member is about to upload with.
  let requestMapping: ColumnMapping | null = null;
  const mappingRaw = form.get("columnMapping");
  if (typeof mappingRaw === "string" && mappingRaw.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(mappingRaw);
    } catch {
      return Response.json({ error: "Invalid columnMapping JSON" }, { status: 400 });
    }
    const validated = validateColumnMapping(parsed);
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: 400 });
    }
    requestMapping = validated.mapping;
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let preview;
  try {
    preview = parseCsvPreview(buf);
  } catch {
    return Response.json(
      { error: "Could not parse this file as a CSV." },
      { status: 400 },
    );
  }
  const headers = preview.headers;
  const rows = preview.allRows ?? preview.sampleRows;
  if (headers.length === 0) {
    return Response.json(
      { error: "Could not read any column headers from this file." },
      { status: 400 },
    );
  }

  const row = await prisma.marketConfig.findUnique({ where: { userId } });
  const config = toShape(row);

  // Effective column mapping for THIS file: the request mapping (if supplied,
  // already the member's intent) or the saved mapping resolved against this
  // file's real headers (so a drifted old-format export still resolves where a
  // high-confidence header substitution exists). Never mutates the saved one.
  const baseMapping: ColumnMapping = requestMapping ?? config.columnMapping ?? {};
  const { mapping: effectiveMapping } = resolveEffectiveMapping(
    baseMapping,
    headers,
  );

  // Column completeness: every required field must map to a column present in
  // this file. Drives whether the client opens the ColumnMapper first.
  const missingRequiredFields = REQUIRED_MAPPING_FIELDS.filter(
    (f) => headerIndex(headers, effectiveMapping[f]) < 0,
  );
  const columnMappingComplete = missingRequiredFields.length === 0;

  // Seed for the ColumnMapper: effective mapping ∪ deterministic suggestions
  // for any field not yet resolved in this file.
  const suggestions = suggestMappingFromHeaders(headers);
  const suggestedColumnMapping: ColumnMapping = { ...effectiveMapping };
  for (const f of [...REQUIRED_MAPPING_FIELDS, ...MAPPER_OPTIONAL_FIELDS]) {
    if (headerIndex(headers, suggestedColumnMapping[f]) >= 0) continue;
    const s = suggestions[f];
    if (s && headerIndex(headers, s.header) >= 0) {
      suggestedColumnMapping[f] = s.header;
    }
  }

  // ── Status analysis ────────────────────────────────────────────────────────
  const statusMapping: StatusMapping = resolveStatusMapping(config);
  const statusIdx = headerIndex(headers, effectiveMapping.status);
  const statusColumnFound = statusIdx >= 0;

  const rawStatuses: string[] = statusColumnFound
    ? rows.map((r) => (r[statusIdx] ?? "").toString())
    : [];
  const { counts, unknownLabels } = countByBucket(rawStatuses, statusMapping);

  // Distinct raw values (mapped + unknown) with counts, proposal, and whether
  // they already resolve. The client only prompts for the unknown ones.
  const distinct = new Map<string, number>();
  for (const s of rawStatuses) {
    const label = s.trim() || "(blank)";
    distinct.set(label, (distinct.get(label) ?? 0) + 1);
  }
  const statusValues: StatusValueRow[] = [...distinct.entries()]
    .map(([value, count]) => {
      const isUnknown = unknownLabels.has(value);
      return {
        value,
        count,
        bucket: isUnknown
          ? ("unknown" as const)
          : // re-bucket the single label to report its resolved bucket
            (() => {
              const single = countByBucket([value], statusMapping).counts;
              if (single.sold) return "sold" as const;
              if (single.offMarket) return "offMarket" as const;
              if (single.active) return "active" as const;
              if (single.pending) return "pending" as const;
              return "unknown" as const;
            })(),
        alreadyMapped: !isUnknown,
        proposed: isUnknown ? proposeStatusBucket(value) : null,
      };
    })
    .sort((a, b) => b.count - a.count);

  const unknownCount = statusValues.filter((s) => !s.alreadyMapped).length;

  // ── Sample row read through the mapping ─────────────────────────────────────
  const sampleSource = rows.find((r) => r.some((c) => (c ?? "").trim())) ?? rows[0] ?? [];
  const sampleFields: AnyMappedField[] = [
    ...REQUIRED_MAPPING_FIELDS,
    ...MAPPER_OPTIONAL_FIELDS,
  ];
  const sampleRow = sampleFields
    .map((field) => {
      const idx = headerIndex(headers, effectiveMapping[field]);
      return {
        field,
        label: FIELD_LABELS[field],
        column: idx >= 0 ? headers[idx] : null,
        value: idx >= 0 ? (sampleSource[idx] ?? "").toString() : null,
        mapped: idx >= 0,
      };
    })
    // Show every required field (even unmapped, so gaps are visible) plus only
    // the optional fields that actually resolved.
    .filter(
      (s) =>
        REQUIRED_MAPPING_FIELDS.includes(s.field) || s.mapped,
    );

  return Response.json({
    filename: file.name,
    rowCount: preview.rowCount,
    headers,
    columnMapping: effectiveMapping,
    suggestedColumnMapping,
    columnMappingComplete,
    missingRequiredFields,
    statusColumnFound,
    resolvedStatusMapping: statusMapping,
    statusValues,
    unknownCount,
    previewCounts: counts,
    sampleRow,
  });
}
