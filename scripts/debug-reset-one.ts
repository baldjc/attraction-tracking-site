import prisma from "@/lib/prisma";
const id = process.argv[2];
if (!id) { console.error("usage: tsx debug-reset-one.ts <uploadId>"); process.exit(1); }
async function main() {
  await prisma.marketFact.deleteMany({ where: { uploadId: id } });
  await prisma.marketStoryLead.deleteMany({ where: { uploadId: id } });
  await prisma.marketDataUpload.update({
    where: { id },
    data: { status: "pending", validatedAt: null, validationCostUsd: null, validationError: null },
  });
  console.log("Reset", id);
}
main().finally(async () => { await prisma.$disconnect(); });
