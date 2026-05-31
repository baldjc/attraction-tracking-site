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
      _count: {
        select: {
          facts: true,
          storyLeads: true,
        },
      },
    },
  });

  // Lightweight companion query: ids of uploads that have stored validator
  // output. Kept separate from the list select above so we never pull the large
  // rawValidatorOutput blob just to render a boolean.
  const withRawRows = await prisma.marketDataUpload.findMany({
    where: { userId: access.user.id, NOT: { rawValidatorOutput: null } },
    select: { id: true },
  });
  const withRawSet = new Set(withRawRows.map((r) => r.id));

  const uploads = rows.map(({ _count, ...rest }) => ({
    ...rest,
    factCount: _count.facts,
    storyLeadCount: _count.storyLeads,
    hasValidatorOutput: withRawSet.has(rest.id),
  }));

  return Response.json({ uploads });
}
