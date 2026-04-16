/**
 * Sprint 6 backfill script — for every PRODUCTION_TIERS member's plan in
 * "Scripted" status or later:
 *   1. Ensure the plan has a Drive folder (create if missing).
 *   2. Upload every existing active PlanArtifact to the folder.
 *
 * Runs in chunks of 10 plans with a 2-second pause between chunks to respect
 * Drive API rate limits.
 *
 * Usage: `npm run backfill:drive`
 */
import prisma from "../src/lib/prisma";
import { ensureVideoFolderForPlan, folderIdFromUrl, uploadTextFileToFolder } from "../src/lib/google-drive";
import { ARTIFACT_FILENAMES } from "../src/lib/drive-sync";
import { PRODUCTION_TIERS } from "../src/lib/content-plan-utils";

const LATER_STATUSES = ["Scripted", "Ready to Shoot", "Shooting", "Shot - In Post", "Filmed", "Editing", "Scheduled", "Published"];
const CHUNK_SIZE = 10;
const CHUNK_DELAY_MS = 2000;

function fallbackFilename(type: string): string {
  const cleaned = type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `${cleaned}.md`;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const plans = await prisma.contentPlan.findMany({
    where: {
      status: { in: LATER_STATUSES },
      user: { serviceTier: { in: PRODUCTION_TIERS as any } },
    },
    select: {
      id: true,
      userId: true,
      title: true,
      status: true,
      driveFolderLink: true,
      user: { select: { email: true } },
    },
  });

  console.log(`[backfill] Found ${plans.length} candidate plans in Scripted or later`);

  let foldersCreated = 0;
  let filesUploaded = 0;
  let plansTouched = 0;
  let plansSkipped = 0;

  for (let i = 0; i < plans.length; i += CHUNK_SIZE) {
    const chunk = plans.slice(i, i + CHUNK_SIZE);
    console.log(`\n[backfill] Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(plans.length / CHUNK_SIZE)} (${chunk.length} plans)`);

    for (const plan of chunk) {
      const hadFolder = !!plan.driveFolderLink;
      const folder = await ensureVideoFolderForPlan(plan.id, plan.userId);
      if (!folder) {
        console.log(`  [skip] ${plan.user.email} — "${plan.title}": no folder available`);
        plansSkipped += 1;
        continue;
      }
      if (!hadFolder) foldersCreated += 1;

      const folderId = folderIdFromUrl(folder.folderUrl);
      if (!folderId) {
        plansSkipped += 1;
        continue;
      }

      const artifacts = await prisma.planArtifact.findMany({
        where: { planId: plan.id, supersededById: null },
        select: { type: true, content: true },
      });

      let uploadedForPlan = 0;
      for (const a of artifacts) {
        if (!a.content || typeof a.content !== "string") continue;
        const filename = ARTIFACT_FILENAMES[a.type] ?? fallbackFilename(a.type);
        const result = await uploadTextFileToFolder(folderId, filename, a.content, "text/markdown");
        if (result) {
          uploadedForPlan += 1;
          filesUploaded += 1;
        }
      }

      plansTouched += 1;
      console.log(`  [ok]   ${plan.user.email} — "${plan.title}" (${plan.status}) → ${uploadedForPlan} file(s) uploaded`);
    }

    if (i + CHUNK_SIZE < plans.length) {
      console.log(`[backfill] Sleeping ${CHUNK_DELAY_MS}ms before next chunk…`);
      await sleep(CHUNK_DELAY_MS);
    }
  }

  console.log(`\n[backfill] Done.`);
  console.log(`  Plans scanned:   ${plans.length}`);
  console.log(`  Plans touched:   ${plansTouched}`);
  console.log(`  Plans skipped:   ${plansSkipped}`);
  console.log(`  Folders created: ${foldersCreated}`);
  console.log(`  Files uploaded:  ${filesUploaded}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
