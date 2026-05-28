import prisma from "../src/lib/prisma.ts";
const candidates = await prisma.marketDataUpload.findMany({
  where: { monthYear: "2026-05" },
  orderBy: { uploadedAt: "desc" },
  select: {
    id: true, label: true, monthYear: true, rowCount: true, status: true,
    uploadedAt: true, validatedAt: true,
    _count: { select: { facts: true, storyLeads: true, aggregatedMetrics: true } },
  },
});
console.log(JSON.stringify(candidates, null, 2));
await prisma.$disconnect();
