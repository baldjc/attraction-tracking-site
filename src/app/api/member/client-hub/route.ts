import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { withRouteErrorHandling } from "@/lib/api-error-wrapper";

export const GET = withRouteErrorHandling("member/client-hub", GET_impl);

async function GET_impl() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { serviceTier: true, assetsDriveLink: true, clientHubEnabled: true },
  });
  if (!dbUser) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tier = dbUser.serviceTier ?? "foundations";

  const productionOnlyTiers = ["editing_2", "editing_4"];
  const growthDwyTiers = ["mastery_2", "mastery_4", "done_with_you"];
  const allProductionTiers = [...productionOnlyTiers, ...growthDwyTiers];

  if (!allProductionTiers.includes(tier) || !dbUser.clientHubEnabled) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [productionPlans, quickLinks] = await Promise.all([
    prisma.contentPlan.findMany({
      where: { userId: user.id },
      orderBy: [{ publishDate: "asc" }, { createdAt: "desc" }],
    }),
    growthDwyTiers.includes(tier)
      ? prisma.clientQuickLink.findMany({
          where: { userId: user.id },
          orderBy: { sortOrder: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    assetsDriveLink: dbUser.assetsDriveLink ?? null,
    productionPlans,
    quickLinks,
    serviceTier: tier,
  });
}
