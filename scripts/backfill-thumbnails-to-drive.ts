/**
 * One-time backfill — migrate Object-Storage thumbnail variants into each plan's
 * Google Drive folder, now that production Drive uploads work against the Shared
 * Drive.
 *
 * For every non-deleted ContentPlan that HAS a Drive folder and HAS at least one
 * `storage: "object"` thumbnail variant:
 *   1. Read the variant bytes from Object Storage.
 *   2. Upload them into the plan's Drive folder.
 *   3. Verify the Drive copy is readable (fetch it back) BEFORE touching anything.
 *   4. Flip the variant to `storage: "drive"` (driveFileId set, object key dropped)
 *      inside the row lock (updateVariantsLocked) so concurrent edits can't clobber.
 *   5. Only after the DB points at Drive, delete the Object-Storage copy
 *      (best-effort immediate delete — the codebase's object-cleanup pattern).
 *
 * Idempotent: a variant already at `storage: "drive"` is skipped (counted as
 * already-in-drive). Re-running after a partial failure safely retries the rest.
 *
 * Rate-limited: ~100ms pause before every Drive API call to avoid throttling.
 *
 * SAFETY: this connects via NEON_DATABASE_URL/DATABASE_URL (global secrets) which
 * point at the production Neon DB. The current database + host are logged at the
 * start of the run so the target is auditable.
 *
 * Usage: `npm run backfill:thumbnails`
 */
import prisma from "../src/lib/prisma";
import {
  folderIdFromUrl,
  uploadBinaryToFolder,
  fetchDriveFileBytes,
  deleteDriveFile,
} from "../src/lib/google-drive";
import {
  type ThumbnailVariant,
  parseVariants,
  getThumbnailBytes,
  deleteThumbnailBytes,
  extForMime,
  updateVariantsLocked,
} from "../src/lib/content-thumbnails";

const DRIVE_CALL_GAP_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Outcome = "migrated" | "already-in-drive" | "failed";

async function migrateVariant(
  planId: string,
  userId: string,
  folderId: string,
  variant: ThumbnailVariant,
): Promise<{ outcome: Outcome; detail: string }> {
  // Already migrated → idempotent skip.
  if (variant.storage === "drive") {
    return { outcome: "already-in-drive", detail: `driveFileId=${variant.driveFileId ?? "?"}` };
  }
  if (!variant.key) {
    return { outcome: "failed", detail: "object variant has no storage key" };
  }

  // 1. Read source bytes from Object Storage.
  let buf: Buffer;
  try {
    buf = await getThumbnailBytes(variant.key);
  } catch (err) {
    return { outcome: "failed", detail: `object_read_failed: ${String((err as Error).message)}` };
  }
  if (!buf || buf.length === 0) {
    return { outcome: "failed", detail: "object_read_failed: empty buffer" };
  }

  // 2. Upload into the Drive folder.
  const ext = extForMime(variant.mimeType);
  const filename = `thumbnail-${variant.id}.${ext}`;
  await sleep(DRIVE_CALL_GAP_MS);
  const uploaded = await uploadBinaryToFolder(folderId, filename, buf, variant.mimeType);
  if (!uploaded) {
    return { outcome: "failed", detail: "drive_upload_failed (timeout or Drive error; see logs)" };
  }

  // 3. Verify the Drive copy is readable before we trust it.
  await sleep(DRIVE_CALL_GAP_MS);
  const readback = await fetchDriveFileBytes(uploaded.fileId);
  if (!readback || readback.buffer.length !== buf.length) {
    // Don't leave an unverified orphan behind.
    await sleep(DRIVE_CALL_GAP_MS);
    await deleteDriveFile(uploaded.fileId);
    const got = readback ? `${readback.buffer.length}B` : "null";
    return { outcome: "failed", detail: `drive_verify_failed (expected ${buf.length}B, got ${got})` };
  }

  // 4. Flip the variant to drive-backed inside the row lock.
  let wrote: { variants: ThumbnailVariant[]; winnerId: string | null } | null;
  try {
    wrote = await updateVariantsLocked(planId, userId, (current, winnerId) => {
      const idx = current.findIndex((v) => v.id === variant.id);
      if (idx === -1) throw new Error("variant_vanished");
      const cur = current[idx];
      // Skip if a concurrent run already migrated it.
      if (cur.storage === "drive") {
        return { variants: current, winnerId };
      }
      const next: ThumbnailVariant = {
        id: cur.id,
        fileName: cur.fileName,
        mimeType: cur.mimeType,
        storage: "drive",
        driveFileId: uploaded.fileId,
        score: cur.score ?? null,
        scoreNotes: cur.scoreNotes ?? null,
        createdAt: cur.createdAt,
      };
      const variants = [...current];
      variants[idx] = next;
      return { variants, winnerId };
    });
  } catch (err) {
    await sleep(DRIVE_CALL_GAP_MS);
    await deleteDriveFile(uploaded.fileId);
    return { outcome: "failed", detail: `db_write_failed: ${String((err as Error).message)}` };
  }
  if (!wrote) {
    await sleep(DRIVE_CALL_GAP_MS);
    await deleteDriveFile(uploaded.fileId);
    return { outcome: "failed", detail: "db_write_failed: plan not found for owner" };
  }

  // 5. DB now points at Drive — delete the Object-Storage copy (best-effort).
  await deleteThumbnailBytes(variant.key);

  return { outcome: "migrated", detail: `→ driveFileId=${uploaded.fileId}` };
}

async function main() {
  // Auditable target confirmation.
  try {
    const info = await prisma.$queryRaw<Array<{ db: string; host: string | null }>>`
      SELECT current_database() AS db, inet_server_addr()::text AS host`;
    console.log(`[backfill] target DB: ${info[0]?.db} @ ${info[0]?.host ?? "(unix/pooler)"}`);
  } catch {
    console.log("[backfill] target DB: (could not read current_database)");
  }

  const plans = await prisma.contentPlan.findMany({
    where: { deletedAt: null, driveFolderLink: { not: null } },
    select: {
      id: true,
      userId: true,
      title: true,
      driveFolderLink: true,
      thumbnailVariants: true,
      user: { select: { email: true } },
    },
  });

  let migrated = 0;
  let alreadyInDrive = 0;
  let failed = 0;
  let plansWithWork = 0;

  for (const plan of plans) {
    const variants = parseVariants(plan.thumbnailVariants);
    const objectVariants = variants.filter((v) => v.storage === "object");
    if (objectVariants.length === 0) continue;

    const folderId = folderIdFromUrl(plan.driveFolderLink);
    const who = `${plan.user.email} — "${plan.title}"`;
    if (!folderId) {
      failed += objectVariants.length;
      console.log(`  [fail] ${who}: driveFolderLink has no usable folder id (${objectVariants.length} variant(s))`);
      continue;
    }

    plansWithWork += 1;
    for (const variant of objectVariants) {
      const { outcome, detail } = await migrateVariant(plan.id, plan.userId, folderId, variant);
      if (outcome === "migrated") migrated += 1;
      else if (outcome === "already-in-drive") alreadyInDrive += 1;
      else failed += 1;
      const tag = outcome === "migrated" ? "ok  " : outcome === "already-in-drive" ? "skip" : "fail";
      console.log(`  [${tag}] ${who} · variant ${variant.id}: ${outcome} ${detail}`);
    }
  }

  console.log(`\n[backfill] Done.`);
  console.log(`  Plans scanned:        ${plans.length}`);
  console.log(`  Plans with work:      ${plansWithWork}`);
  console.log(`  Thumbnails migrated:  ${migrated}`);
  console.log(`  Already in Drive:     ${alreadyInDrive}`);
  console.log(`  Failed:               ${failed}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
