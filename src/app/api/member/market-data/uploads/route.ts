import prisma from "@/lib/prisma";
import { requireMarketAccess } from "@/lib/market-config-server";

export async function GET() {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;

  const rows = await prisma.marketDataUpload.findMany({
    where: { userId: access.user.id },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      label: true,
      monthYear: true,
      csvFileName: true,
      rowCount: true,
      status: true,
      uploadedAt: true,
      validatedAt: true,
      validationError: true,
    },
  });

  return Response.json({ uploads: rows });
}
