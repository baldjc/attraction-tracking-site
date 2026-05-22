import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { requireMarketAccess } from "@/lib/market-config-server";
import {
  CANONICAL_FIELDS,
  FIELD_LABELS,
  MAX_CSV_UPLOAD_BATCH,
  type ColumnMapping,
} from "@/lib/market-config";
import {
  parseCsvPreview,
  detectMonthYearFromFilename,
  writeUploadFile,
  uploadPathFor,
} from "@/lib/market-csv";
import { validateUploadAsync } from "@/lib/fact-validator";

export const runtime = "nodejs";
export const maxDuration = 300;

interface UploadEntry {
  field: "files";
  label?: string;
  monthYear?: string;
}

/**
 * Multipart POST. Fields:
 *   files: one or more CSV files (repeat field name)
 *   labels: JSON string array, parallel to files
 *   monthYears: JSON string array, parallel to files (member-confirmed order)
 *   columnMapping: optional JSON object to save to MarketConfig.columnMapping
 *
 * Saves each file to /tmp/uploads/<userId>/<uploadId>.csv and creates one
 * MarketDataUpload row at status='pending' per file. Phase 1 stops here —
 * no aggregation, no validator.
 */
export async function POST(req: NextRequest) {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;
  const userId = access.user.id;

  // Member must have a MarketConfig before uploading.
  const config = await prisma.marketConfig.findUnique({ where: { userId } });
  if (!config) {
    return Response.json(
      { error: "Set up your market first.", redirect: "/member/market-data/setup" },
      { status: 409 },
    );
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "No files provided" }, { status: 400 });
  }
  if (files.length > MAX_CSV_UPLOAD_BATCH) {
    return Response.json(
      { error: `Up to ${MAX_CSV_UPLOAD_BATCH} files per batch.` },
      { status: 400 },
    );
  }

  let labels: string[] = [];
  let monthYears: string[] = [];
  const labelsRaw = form.get("labels");
  const monthYearsRaw = form.get("monthYears");
  try {
    if (typeof labelsRaw === "string") labels = JSON.parse(labelsRaw);
    if (typeof monthYearsRaw === "string") monthYears = JSON.parse(monthYearsRaw);
  } catch {
    return Response.json({ error: "Invalid labels/monthYears JSON" }, { status: 400 });
  }

  let columnMapping: ColumnMapping | null = null;
  const mappingRaw = form.get("columnMapping");
  if (typeof mappingRaw === "string" && mappingRaw.trim().length > 0) {
    try {
      columnMapping = JSON.parse(mappingRaw) as ColumnMapping;
    } catch {
      return Response.json(
        { error: "Invalid columnMapping JSON" },
        { status: 400 },
      );
    }
    // Server-side check: required canonical fields must all be mapped. This
    // mirrors the UI guard so a tampered request can't save a partial mapping
    // that would silently break Phase 2 aggregation.
    const missing = CANONICAL_FIELDS.filter(
      (f) =>
        typeof columnMapping?.[f] !== "string" ||
        (columnMapping[f] as string).trim().length === 0,
    );
    if (missing.length > 0) {
      return Response.json(
        {
          error: `Missing required field mapping: ${missing
            .map((f) => FIELD_LABELS[f])
            .join(", ")}`,
        },
        { status: 400 },
      );
    }
  }

  // Parse + persist files first. Capture row counts + monthYears.
  const prepared: Array<{
    id: string;
    file: File;
    rowCount: number;
    monthYear: string;
    label: string;
    storagePath: string;
  }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const buf = Buffer.from(await file.arrayBuffer());
    const preview = parseCsvPreview(buf);
    const id = randomUUID();
    const storagePath = await writeUploadFile(userId, id, buf);
    const detected = detectMonthYearFromFilename(file.name);
    const monthYear =
      (monthYears[i] && monthYears[i].trim()) ||
      detected ||
      new Date().toISOString().slice(0, 7);
    const label =
      (labels[i] && labels[i].trim()) ||
      monthYear ||
      file.name.replace(/\.[^.]+$/, "");
    prepared.push({
      id,
      file,
      rowCount: preview.rowCount,
      monthYear,
      label,
      storagePath,
    });
  }

  // Atomically: save mapping (if provided) + create all upload rows. Both
  // must succeed together so the member doesn't end up with files queued but
  // mapping lost (or vice versa).
  const uploads = await prisma.$transaction(async (tx) => {
    if (columnMapping) {
      await tx.marketConfig.update({
        where: { userId },
        data: { columnMapping: columnMapping as object },
      });
    }
    const created = [];
    for (const p of prepared) {
      const row = await tx.marketDataUpload.create({
        data: {
          id: p.id,
          userId,
          label: p.label,
          monthYear: p.monthYear,
          csvFileName: p.file.name,
          csvStorageUrl: p.storagePath,
          rowCount: p.rowCount,
          status: "pending",
          configSnapshot: {
            marketName: config.marketName,
            mlsSource: config.mlsSource,
          },
        },
        select: {
          id: true,
          label: true,
          monthYear: true,
          csvFileName: true,
          rowCount: true,
          status: true,
          uploadedAt: true,
        },
      });
      created.push(row);
    }
    return created;
  });

  // Fire-and-forget: auto-trigger validation for each newly-created upload.
  // Phase 2A — member shouldn't have to click a separate "validate" button.
  // The route still returns 200 immediately; validation runs in the background
  // and the UI polls /api/member/market-data/upload/[id] for status.
  for (const u of uploads) {
    validateUploadAsync(u.id);
  }

  return Response.json({ uploads });
}
