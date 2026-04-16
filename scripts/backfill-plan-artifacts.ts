import prisma from "../src/lib/prisma";

async function main() {
  const plans = await prisma.contentPlan.findMany({
    select: {
      id: true,
      script: true,
      youtubeDescription: true,
      thumbnailWords: true,
      researchNotes: true,
      updatedAt: true,
    },
  });

  const counts: Record<string, number> = {
    script: 0,
    description: 0,
    title: 0,
    research: 0,
  };

  for (const plan of plans) {
    const entries: Array<{
      type: string;
      content: string;
      metadata?: object;
    }> = [];

    if (plan.script) {
      entries.push({ type: "script", content: plan.script });
    }
    if (plan.youtubeDescription) {
      entries.push({ type: "description", content: plan.youtubeDescription });
    }
    if (plan.thumbnailWords) {
      entries.push({
        type: "title",
        content: plan.thumbnailWords,
        metadata: { source: "legacy_thumbnailWords" },
      });
    }
    if (plan.researchNotes) {
      entries.push({ type: "research", content: plan.researchNotes });
    }

    for (const entry of entries) {
      const existing = await prisma.planArtifact.findFirst({
        where: {
          planId: plan.id,
          type: entry.type,
          content: entry.content,
        },
      });
      if (existing) continue;

      await prisma.planArtifact.create({
        data: {
          planId: plan.id,
          type: entry.type,
          content: entry.content,
          metadata: entry.metadata ?? null,
          generatedAt: plan.updatedAt,
          version: 1,
        },
      });
      counts[entry.type]++;
    }
  }

  console.log("\n=== Backfill complete ===");
  console.log(`Plans processed: ${plans.length}`);
  console.log(`Artifacts created:`);
  for (const [type, count] of Object.entries(counts)) {
    console.log(`  ${type}: ${count}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
