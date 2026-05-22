import prisma from "@/lib/prisma";

const USER_ID = "c3d00532-9a60-47cd-9287-66c4f5ea864f";

async function main() {
  const uploads = await prisma.marketDataUpload.findMany({
    where: { userId: USER_ID },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      monthYear: true,
      status: true,
      validatedAt: true,
      validationCostUsd: true,
      validationError: true,
      _count: { select: { facts: true, storyLeads: true } },
    },
  });
  console.table(
    uploads.map((u) => ({
      id: u.id.slice(0, 8),
      month: u.monthYear,
      status: u.status,
      facts: u._count.facts,
      leads: u._count.storyLeads,
      cost: u.validationCostUsd,
      err: u.validationError?.slice(0, 80) ?? null,
    })),
  );
  const byStatus: Record<string, number> = {};
  for (const u of uploads) byStatus[u.status] = (byStatus[u.status] ?? 0) + 1;
  console.log("By status:", byStatus, "Total:", uploads.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
