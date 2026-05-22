// One-off ops script — resets MarketDataUpload rows whose validation failed
// (e.g. rate-limit cascade from a backfill) back to status='pending' so the
// queue can re-run them. Does NOT touch the CSV blob on Object Storage
// (csvStorageUrl is preserved). Failed runs persist no facts/leads, so
// nothing else needs cleanup.
//
// Usage:
//   npx tsx scripts/reset-failed-uploads.ts <userId>
//
// After running, kick the queue via:
//   curl -X POST $APP_URL/api/debug/validate \
//     -H 'content-type: application/json' \
//     -d '{"secret":"<DEBUG_VALIDATE_SECRET>","userId":"<userId>","mode":"all-pending"}'

import prisma from "@/lib/prisma";

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: tsx scripts/reset-failed-uploads.ts <userId>");
    process.exit(1);
  }

  const failed = await prisma.marketDataUpload.findMany({
    where: { userId, status: "failed", validatedAt: null },
    select: { id: true, monthYear: true, validationError: true },
    orderBy: { monthYear: "asc" },
  });

  if (failed.length === 0) {
    console.log(`No failed uploads for user ${userId}.`);
    return;
  }

  console.log(`Resetting ${failed.length} failed uploads for ${userId}:`);
  for (const f of failed) {
    console.log(`  ${f.monthYear}  ${f.id}`);
  }

  const result = await prisma.marketDataUpload.updateMany({
    where: { userId, status: "failed", validatedAt: null },
    data: { status: "pending", validationError: null, validationCostUsd: null },
  });
  console.log(`Reset ${result.count} rows to status='pending'.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
