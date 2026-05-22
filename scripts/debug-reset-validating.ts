import prisma from "@/lib/prisma";
const USER_ID = "c3d00532-9a60-47cd-9287-66c4f5ea864f";
async function main() {
  const r = await prisma.marketDataUpload.updateMany({
    where: { userId: USER_ID, status: { in: ["validating", "failed"] } },
    data: { status: "pending", validationError: null, validationCostUsd: null },
  });
  console.log("Reset rows:", r.count);
}
main().finally(async () => { await prisma.$disconnect(); });
