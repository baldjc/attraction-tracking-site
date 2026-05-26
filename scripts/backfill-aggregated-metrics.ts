// Wave 1 — one-shot backfill of `AggregatedMetric` rows for every
// already-validated MarketDataUpload. Run-once after the schema lands so
// historical uploads have source-of-truth rows available to Script Builder v2.
//
// Idempotent: `persistAggregatedMetrics` deletes existing rows for
// (userId, uploadId) before re-inserting, so re-running this script
// rebuilds the table cleanly. Skips uploads that aren't `validated` and
// uploads with no `csvStorageUrl` (the aggregator requires the CSV).
//
// Usage:
//   npx tsx scripts/backfill-aggregated-metrics.ts
//   npx tsx scripts/backfill-aggregated-metrics.ts --user=<userId>
//   npx tsx scripts/backfill-aggregated-metrics.ts --upload=<uploadId>

import prisma from "@/lib/prisma";
import { aggregateUploadFromDb } from "@/lib/csv-aggregate";
import { persistAggregatedMetrics } from "@/lib/aggregated-metrics";

interface Args {
  userId: string | null;
  uploadId: string | null;
}

function parseArgs(): Args {
  const out: Args = { userId: null, uploadId: null };
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--(\w+)=(.+)$/);
    if (!m) continue;
    if (m[1] === "user") out.userId = m[2];
    if (m[1] === "upload") out.uploadId = m[2];
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const where: {
    status: "validated";
    userId?: string;
    id?: string;
    csvStorageUrl: { not: null };
  } = {
    status: "validated",
    csvStorageUrl: { not: null },
  };
  if (args.userId) where.userId = args.userId;
  if (args.uploadId) where.id = args.uploadId;

  const uploads = await prisma.marketDataUpload.findMany({
    where,
    select: {
      id: true,
      userId: true,
      label: true,
      monthYear: true,
      uploadedAt: true,
    },
    orderBy: { uploadedAt: "asc" },
  });

  console.log(`[backfill] found ${uploads.length} validated upload(s) to process`);
  if (uploads.length === 0) {
    await prisma.$disconnect();
    return;
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalWritten = 0;

  for (const u of uploads) {
    const label = `${u.id.slice(0, 8)} ${u.monthYear} ${u.label.slice(0, 40)}`;
    try {
      const t0 = Date.now();
      const { table, userId } = await aggregateUploadFromDb(u.id);
      if (table.groups.length === 0) {
        console.log(`[backfill] SKIP ${label} — aggregator returned 0 groups`);
        skipped++;
        continue;
      }
      const written = await persistAggregatedMetrics(u.id, userId, table);
      const ms = Date.now() - t0;
      console.log(
        `[backfill] OK   ${label} — groups=${table.groups.length} rows=${written} (${ms}ms)`,
      );
      processed++;
      totalWritten += written;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[backfill] FAIL ${label} — ${msg}`);
    }
  }

  console.log(
    `[backfill] done — processed=${processed} skipped=${skipped} failed=${failed} totalRowsWritten=${totalWritten}`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill] fatal", err);
  process.exit(1);
});
