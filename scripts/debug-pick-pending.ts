import prisma from "@/lib/prisma";
const USER_ID = "c3d00532-9a60-47cd-9287-66c4f5ea864f";
async function main() {
  const u = await prisma.marketDataUpload.findFirst({
    where: { userId: USER_ID, status: "pending" },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, monthYear: true },
  });
  if (!u) { console.log("NONE"); return; }
  console.log(u.id);
}
main().finally(async () => { await prisma.$disconnect(); });
