// Read-only status probe for a single market-data upload.
// Usage: npx tsx scripts/check-upload.ts <uploadId>
import prisma from "@/lib/prisma";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: npx tsx scripts/check-upload.ts <uploadId>");
    process.exit(1);
  }
  const upload = await prisma.marketDataUpload.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      retryCount: true,
      uploadedAt: true,
      validatedAt: true,
      validationError: true,
      validationCostUsd: true,
    },
  });
  if (!upload) {
    console.log(JSON.stringify({ found: false, id }));
    return;
  }
  const [facts, leads] = await Promise.all([
    prisma.marketFact.count({ where: { uploadId: id } }),
    prisma.marketStoryLead.count({ where: { uploadId: id } }),
  ]);
  console.log(
    JSON.stringify(
      { found: true, ...upload, factCount: facts, storyLeadCount: leads },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
