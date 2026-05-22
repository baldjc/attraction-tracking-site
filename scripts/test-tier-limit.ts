// Verifies getMaxUploadBatchForUser returns the right limit per ServiceTier.
// Read-only — does not mutate any rows.

import prisma from "@/lib/prisma";
import { getMaxUploadBatchForUser } from "@/lib/market-config-server";

async function main() {
  const samples = await prisma.user.findMany({
    where: {
      serviceTier: { in: ["foundations", "editing_4", "mastery_4", "done_with_you"] },
    },
    select: { id: true, email: true, serviceTier: true },
    distinct: ["serviceTier"],
  });

  console.log("Per-tier samples:");
  for (const u of samples) {
    const r = await getMaxUploadBatchForUser(u.id);
    const expected = u.serviceTier === "foundations" ? 13 : 25;
    const ok = r.limit === expected ? "OK" : "FAIL";
    console.log(`  [${ok}] ${u.serviceTier.padEnd(14)} → limit=${r.limit} (expected ${expected})  ${u.email}`);
  }

  const ghost = await getMaxUploadBatchForUser("00000000-0000-0000-0000-000000000000");
  console.log(`  [${ghost.limit === 25 ? "OK" : "FAIL"}] ghost user → limit=${ghost.limit} tier=${ghost.tier} (expected limit=25, tier=foundations defaulted)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
