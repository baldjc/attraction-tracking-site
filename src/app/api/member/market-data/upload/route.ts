import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import {
  requireMarketAccess,
  getMaxUploadBatchForUser,
} from "@/lib/market-config-server";
import {
  CANONICAL_FIELDS,
  FIELD_LABELS,
  type ColumnMapping,
} from "@/lib/market-config";
import {
  parseCsvPreview,
  detectMonthYearFromFilename,
  writeUploadFile,
} from "@/lib/market-csv";
import { validateUploadAsync } from "@/lib/fact-validator";
import {
  getCostCapStatus,
  averageRecentValidationCostUsd,
} from "@/lib/ai-tool-cost";

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
 * Saves each file to Replit Object Storage at market-data/<userId>/<uploadId>.csv
 * (persistent across container restarts) and creates one MarketDataUpload row
 * at status='pending' per file. The Object Storage key is persisted to
 * `csvStorageUrl` and read back by the aggregator.
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
  // Tier-based upload limit — Foundations get 13 months (1-year YoY backfill),
  // Growth + Done-With-You get 25 months (2-year YoY backfill).
  const { limit: maxBatch, tier } = await getMaxUploadBatchForUser(userId);
  if (files.length > maxBatch) {
    return Response.json(
      {
        error: "tier_limit_exceeded",
        message: `Your plan allows up to ${maxBatch} files per upload (you tried ${files.length}).`,
        limit: maxBatch,
        attempted: files.length,
        tier,
      },
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
    const detected = detectMonthYearFromFilename(file.name);
    const monthYear =
      (monthYears[i] && monthYears[i].trim()) || detected || null;
    if (!monthYear) {
      // No silent current-month fallback — refuse the upload so the member
      // is forced to pick a month explicitly. Otherwise CSVs with
      // un-parseable filenames silently land in whatever the server's
      // current month happens to be (which is how Calgary 2026-04 nearly
      // got mis-filed).
      return Response.json(
        {
          error: `Couldn't determine month/year for ${file.name}. Please rename the file (YYYY-MM format) or pick a month before uploading.`,
          filename: file.name,
          fieldsTried: ["client-confirmed", "filename"],
        },
        { status: 400 },
      );
    }
    const storagePath = await writeUploadFile(userId, id, buf);
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

  // In-batch duplicate guard — two files in the SAME upload request
  // pointing at the same month would both pass the DB check below and
  // create duplicate rows. Refuse before any DB writes.
  {
    const seen = new Map<string, string>(); // monthYear -> label
    const inBatch: Array<{ monthYear: string; label: string }> = [];
    for (const p of prepared) {
      const prior = seen.get(p.monthYear);
      if (prior) {
        inBatch.push({ monthYear: p.monthYear, label: p.label });
        if (!inBatch.some((x) => x.label === prior)) {
          inBatch.unshift({ monthYear: p.monthYear, label: prior });
        }
      } else {
        seen.set(p.monthYear, p.label);
      }
    }
    if (inBatch.length > 0) {
      return Response.json(
        {
          error: "duplicate_month_in_batch",
          message:
            "Two or more files in this upload point at the same month. Remove or remap one before retrying.",
          duplicates: inBatch,
        },
        { status: 400 },
      );
    }
  }

  // Cross-request duplicate-month guard — refuse if any monthYear in the
  // batch already exists for this user in a state that owns facts/leads (or
  // is about to). Member must explicitly delete the prior upload via the
  // Replace UX before re-uploading the same month.
  // NOTE: This is a pre-check without a DB unique constraint, so two
  // concurrent uploads of the same month from the same user could both
  // slip through. Acceptable for now (single-user dashboards, no team
  // multi-tab uploads observed); add `@@unique([userId, monthYear])` and
  // P2002 handling if that changes.
  const conflictRows = await prisma.marketDataUpload.findMany({
    where: {
      userId,
      monthYear: { in: prepared.map((p) => p.monthYear) },
      status: { in: ["validated", "validating", "pending"] },
    },
    select: {
      id: true,
      monthYear: true,
      status: true,
      label: true,
      _count: { select: { facts: true, storyLeads: true } },
    },
  });
  if (conflictRows.length > 0) {
    const conflicts = conflictRows.map(({ _count, ...rest }) => ({
      ...rest,
      factCount: _count.facts,
      storyLeadCount: _count.storyLeads,
    }));
    // Include the user's recent average validation cost so the client can
    // surface a realistic "this will cost ~$X" estimate in the replace
    // confirmation dialog. Falls back to $2.75 on no history.
    const recentAvgCostUsd = await averageRecentValidationCostUsd(userId);
    return Response.json(
      {
        error: "duplicate_month",
        message:
          "One or more months already exist. Delete the existing upload(s) or choose a different month.",
        conflicts,
        recentAvgCostUsd,
      },
      { status: 409 },
    );
  }

  // Server-side belt-and-braces cost guard. The UI shows a confirmation
  // dialog with an estimate, but a tampered client could skip it — so we
  // also refuse here when the estimated batch cost would push the user past
  // their monthly hard cap. Admins are exempted via getCostCapStatus().
  const cap = await getCostCapStatus(userId);
  const avgCost = await averageRecentValidationCostUsd(userId);
  const estimatedBatchCost = prepared.length * avgCost;
  if (cap.monthSpendUsd + estimatedBatchCost > cap.capUsd) {
    const remainingBudget = Math.max(0, cap.capUsd - cap.monthSpendUsd);
    return Response.json(
      {
        error: "estimated_cost_exceeds_cap",
        message:
          `This batch would cost about $${estimatedBatchCost.toFixed(2)} ` +
          `but you have $${remainingBudget.toFixed(2)} of your monthly ` +
          `AI budget left. Upload fewer months or wait until your cap resets.`,
        estimatedCost: estimatedBatchCost,
        remainingBudget,
        avgCostPerMonth: avgCost,
        attemptedCount: prepared.length,
      },
      { status: 402 },
    );
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
    validateUploadAsync(u.id, userId);
  }

  return Response.json({ uploads });
}
