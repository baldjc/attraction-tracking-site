/**
 * Restore campaign/tracking data from a daily backup JSON file.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/restore-from-backup.ts /tmp/backups/backup-2026-03-26.json
 *
 * Options:
 *   --dry-run     Print what would be inserted without writing to the database
 *   --table=X     Only restore a specific table (users|campaigns|trackingLinks|clicks|leads)
 *
 * The script is UPSERT-safe — it will skip records that already exist (matched by id),
 * so it is safe to run on a live database.
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface BackupPayload {
  exportedAt: string;
  date: string;
  counts: Record<string, number>;
  data: {
    users: Array<{ id: string; fullName: string | null; email: string; role: string }>;
    campaigns: Array<Record<string, unknown>>;
    trackingLinks: Array<Record<string, unknown>>;
    clicks: Array<Record<string, unknown>>;
    leads: Array<Record<string, unknown>>;
  };
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const tableFilter = args.find((a) => a.startsWith("--table="))?.split("=")[1];

  if (!filePath) {
    console.error("Usage: restore-from-backup.ts <path-to-backup.json> [--dry-run] [--table=users|campaigns|trackingLinks|clicks|leads]");
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(resolved, "utf-8");
  const backup: BackupPayload = JSON.parse(raw);

  console.log(`\nBackup file : ${resolved}`);
  console.log(`Exported at : ${backup.exportedAt}`);
  console.log(`Counts      : ${JSON.stringify(backup.counts)}`);
  if (dryRun) console.log("\n⚠️  DRY RUN — no data will be written\n");
  if (tableFilter) console.log(`Restoring only table: ${tableFilter}\n`);

  const should = (name: string) => !tableFilter || tableFilter === name;

  // ── Users (id + fullName + email only — no passwords, no roles overwritten) ─
  if (should("users")) {
    let skipped = 0;
    let inserted = 0;
    for (const u of backup.data.users) {
      const exists = await prisma.user.findUnique({ where: { id: u.id } });
      if (exists) { skipped++; continue; }
      if (!dryRun) {
        await prisma.user.create({
          data: {
            id: u.id,
            email: u.email,
            fullName: u.fullName ?? null,
            role: u.role as never,
            updatedAt: new Date(),
          },
        });
      }
      inserted++;
    }
    console.log(`users         — inserted: ${inserted}, skipped (already exist): ${skipped}`);
  }

  // ── Campaigns ─────────────────────────────────────────────────────────────
  if (should("campaigns")) {
    let skipped = 0;
    let inserted = 0;
    for (const c of backup.data.campaigns) {
      const exists = await prisma.campaign.findUnique({ where: { id: c.id as string } });
      if (exists) { skipped++; continue; }
      if (!dryRun) {
        await prisma.campaign.create({
          data: {
            id: c.id as string,
            userId: c.userId as string,
            name: c.name as string,
            destinationUrl: c.destinationUrl as string,
            sourceType: c.sourceType as never,
            deletedAt: c.deletedAt ? new Date(c.deletedAt as string) : null,
            createdAt: c.createdAt ? new Date(c.createdAt as string) : new Date(),
            updatedAt: c.updatedAt ? new Date(c.updatedAt as string) : new Date(),
          },
        });
      }
      inserted++;
    }
    console.log(`campaigns     — inserted: ${inserted}, skipped (already exist): ${skipped}`);
  }

  // ── Tracking Links ────────────────────────────────────────────────────────
  if (should("trackingLinks")) {
    let skipped = 0;
    let inserted = 0;
    for (const l of backup.data.trackingLinks) {
      const exists = await prisma.trackingLink.findUnique({ where: { id: l.id as string } });
      if (exists) { skipped++; continue; }
      if (!dryRun) {
        await prisma.trackingLink.create({
          data: {
            id: l.id as string,
            campaignId: l.campaignId as string,
            name: l.name as string,
            refCode: l.refCode as string,
            channel: (l.channel as string) ?? null,
            youtubeVideoUrl: (l.youtubeVideoUrl as string) ?? null,
            youtubeVideoId: (l.youtubeVideoId as string) ?? null,
            youtubeThumbnailUrl: (l.youtubeThumbnailUrl as string) ?? null,
            youtubeViewCount: (l.youtubeViewCount as number) ?? 0,
            youtubeViewsUpdatedAt: l.youtubeViewsUpdatedAt ? new Date(l.youtubeViewsUpdatedAt as string) : null,
            deletedAt: l.deletedAt ? new Date(l.deletedAt as string) : null,
            createdAt: l.createdAt ? new Date(l.createdAt as string) : new Date(),
          },
        });
      }
      inserted++;
    }
    console.log(`trackingLinks — inserted: ${inserted}, skipped (already exist): ${skipped}`);
  }

  // ── Clicks ────────────────────────────────────────────────────────────────
  if (should("clicks")) {
    let skipped = 0;
    let inserted = 0;
    for (const c of backup.data.clicks) {
      const exists = await prisma.click.findUnique({ where: { id: c.id as string } });
      if (exists) { skipped++; continue; }
      if (!dryRun) {
        await prisma.click.create({
          data: {
            id: c.id as string,
            trackingLinkId: c.trackingLinkId as string,
            refCode: c.refCode as string,
            sessionId: c.sessionId as string,
            ipAddress: (c.ipAddress as string) ?? null,
            city: (c.city as string) ?? null,
            province: (c.province as string) ?? null,
            country: (c.country as string) ?? null,
            countryCode: (c.countryCode as string) ?? null,
            userAgent: (c.userAgent as string) ?? null,
            referrer: (c.referrer as string) ?? null,
            visitorType: (c.visitorType as string) ?? null,
            timestamp: c.timestamp ? new Date(c.timestamp as string) : new Date(),
          },
        });
      }
      inserted++;
    }
    console.log(`clicks        — inserted: ${inserted}, skipped (already exist): ${skipped}`);
  }

  // ── Leads (conversions) ───────────────────────────────────────────────────
  if (should("leads")) {
    let skipped = 0;
    let inserted = 0;
    for (const l of backup.data.leads) {
      const exists = await prisma.lead.findUnique({ where: { id: l.id as string } });
      if (exists) { skipped++; continue; }
      if (!dryRun) {
        await prisma.lead.create({
          data: {
            id: l.id as string,
            clickId: l.clickId as string,
            timestamp: l.timestamp ? new Date(l.timestamp as string) : new Date(),
          },
        });
      }
      inserted++;
    }
    console.log(`leads         — inserted: ${inserted}, skipped (already exist): ${skipped}`);
  }

  console.log("\nRestore complete.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Restore failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
