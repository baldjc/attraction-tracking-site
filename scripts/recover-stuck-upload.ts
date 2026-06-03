// Manual recovery for a market-data upload stuck in "validating".
//
// WHY THIS EXISTS
// ----------------
// Validation is normally kicked off fire-and-forget from an HTTP route
// (validateUploadAsync → runValidation). On autoscale, the process can be
// terminated (scale-down / redeploy) mid-validation, leaving the upload stuck
// in status="validating" with 0 facts forever. This script runs the EXACT SAME
// code path (runValidation) but synchronously, in a long-lived shell process
// that autoscale won't kill — so the work actually completes.
//
// It does NOT change the validator, the methodology, or the fire-and-forget
// invocation path (that is being replaced separately by a queue+worker).
//
// runValidation is fully self-contained and idempotent:
//   - loads the upload's raw CSV from Object Storage (via aggregateUploadFromDb)
//   - persists deterministic AggregatedMetric rows (deleteMany → createMany)
//   - runs the full Claude fact/leads pipeline (or reuses stored AI output if a
//     prior attempt already paid for it — rawValidatorOutput present)
//   - persists MarketFact + MarketStoryLead rows (deleteMany → createMany)
//   - flips status "validating" → "validated" (or "failed" with a reason)
//   - loads the member's CURRENT methodology settings, which equal the Default
//     preset for any member who never touched the settings panel
//
// USAGE
//   npx tsx scripts/recover-stuck-upload.ts <uploadId>
//   npx tsx scripts/recover-stuck-upload.ts <uploadId> --force   # re-run even if already validated
//
// Find stuck uploads first:
//   psql "$DATABASE_URL" -c "SELECT id, \"userId\", status FROM market_data_uploads WHERE status='validating';"
//   (if psql rejects channel_binding, sanitize:
//    CLEAN=$(printf '%s' "$DATABASE_URL" | tr -d '[:space:]' | sed -E 's/[?&]channel_binding=[^&]*//'); psql "$CLEAN" ... )

import prisma from "@/lib/prisma";
import { runValidation } from "@/lib/fact-validator";

function fmtMs(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${(s - m * 60).toFixed(1)}s`;
}

async function snapshot(uploadId: string) {
  const upload = await prisma.marketDataUpload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      userId: true,
      label: true,
      monthYear: true,
      status: true,
      rowCount: true,
      csvStorageUrl: true,
      validatedAt: true,
      validationCostUsd: true,
      factYieldPct: true,
      validationError: true,
      rawValidatorOutput: true,
      user: { select: { email: true, fullName: true } },
    },
  });
  if (!upload) return null;
  const [facts, metrics, leads] = await Promise.all([
    prisma.marketFact.count({ where: { uploadId } }),
    prisma.aggregatedMetric.count({ where: { uploadId } }),
    prisma.marketStoryLead.count({ where: { uploadId } }),
  ]);
  return { upload, facts, metrics, leads };
}

function printSnapshot(label: string, snap: NonNullable<Awaited<ReturnType<typeof snapshot>>>) {
  const { upload, facts, metrics, leads } = snap;
  console.log(`\n[${label}]`);
  console.log(`  member:      ${upload.user?.fullName ?? "?"} <${upload.user?.email ?? "?"}>`);
  console.log(`  label:       ${upload.label} (${upload.monthYear})`);
  console.log(`  status:      ${upload.status}`);
  console.log(`  rowCount:    ${upload.rowCount}`);
  console.log(`  facts:       ${facts}`);
  console.log(`  metrics:     ${metrics}`);
  console.log(`  storyLeads:  ${leads}`);
  console.log(`  validatedAt: ${upload.validatedAt?.toISOString() ?? "—"}`);
  console.log(`  cost USD:    ${upload.validationCostUsd ?? "—"}`);
  console.log(`  factYield:   ${upload.factYieldPct ?? "—"}`);
  console.log(`  has stored AI output (reuse-eligible): ${Boolean(upload.rawValidatorOutput?.trim())}`);
  if (upload.validationError) {
    console.log(`  validationError: ${upload.validationError.slice(0, 300)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const uploadId = args.find((a) => !a.startsWith("--"));

  if (!uploadId) {
    console.error("Usage: npx tsx scripts/recover-stuck-upload.ts <uploadId> [--force]");
    process.exit(1);
  }

  console.log(`\n===== recover-stuck-upload =====`);
  console.log(`uploadId: ${uploadId}`);
  console.log(`force:    ${force}`);

  const before = await snapshot(uploadId);
  if (!before) {
    console.error(`\nUpload ${uploadId} not found.`);
    process.exit(1);
  }
  printSnapshot("BEFORE", before);

  if (before.upload.status === "validated" && !force) {
    console.log(`\nAlready validated. Pass --force to re-run anyway. Nothing to do.`);
    process.exit(0);
  }
  if (!before.upload.csvStorageUrl) {
    console.error(`\nUpload has no csvStorageUrl — cannot aggregate without the raw CSV. Aborting.`);
    process.exit(1);
  }

  // runValidation refuses to re-run a "validated" upload (idempotency guard).
  // For an explicit --force re-run, drop it back to "validating" first.
  if (before.upload.status === "validated" && force) {
    await prisma.marketDataUpload.update({
      where: { id: uploadId },
      data: { status: "validating", validationError: null },
    });
    console.log(`\n[force] reset status validated → validating to allow re-run.`);
  }

  console.log(`\n----- running full validator pipeline (runValidation) -----`);
  console.log(`(phase logs below are emitted by runValidation itself: "[runValidation] step: ...")\n`);

  const t0 = Date.now();
  let ok = false;
  try {
    await runValidation(uploadId);
    ok = true;
  } catch (err) {
    console.error(`\n[runValidation] THREW after ${fmtMs(Date.now() - t0)}:`, err);
  }
  const elapsed = Date.now() - t0;
  console.log(`\n----- runValidation returned after ${fmtMs(elapsed)} (threw=${!ok}) -----`);

  const after = await snapshot(uploadId);
  if (after) printSnapshot("AFTER", after);

  const finalStatus = after?.upload.status;
  const success = finalStatus === "validated" && (after?.facts ?? 0) > 0;

  console.log(`\n===== RESULT =====`);
  console.log(`uploadId:    ${uploadId}`);
  console.log(`status:      ${before.upload.status} → ${finalStatus}`);
  console.log(`facts:       ${before.facts} → ${after?.facts ?? "?"}`);
  console.log(`metrics:     ${before.metrics} → ${after?.metrics ?? "?"}`);
  console.log(`storyLeads:  ${before.leads} → ${after?.leads ?? "?"}`);
  console.log(`runtime:     ${fmtMs(elapsed)}`);
  console.log(`outcome:     ${success ? "SUCCESS ✓" : finalStatus === "failed" ? "FAILED (see validationError)" : "INCOMPLETE — investigate"}`);

  await prisma.$disconnect();
  process.exit(success ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Fatal:", err);
  await prisma.$disconnect();
  process.exit(1);
});
