import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

const PRODUCTION_ONLY_STATUSES = ["Filmed", "Editing", "Scheduled"];
const GROWTH_DWY_STATUSES = ["Shot - In Post", "Edited", "Scheduled on YT"];

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { serviceTier: true, assetsDriveLink: true },
  });
  if (!dbUser) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tier = dbUser.serviceTier ?? "foundations";

  const productionOnlyTiers = ["editing_2", "editing_4"];
  const growthDwyTiers = ["mastery_2", "mastery_4", "done_with_you"];
  const allProductionTiers = [...productionOnlyTiers, ...growthDwyTiers];

  if (!allProductionTiers.includes(tier)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activeStatuses = productionOnlyTiers.includes(tier)
    ? PRODUCTION_ONLY_STATUSES
    : GROWTH_DWY_STATUSES;

  const [productionPlans, quickLinks] = await Promise.all([
    prisma.contentPlan.findMany({
      where: { userId: user.id, status: { in: activeStatuses } },
      orderBy: { publishDate: "asc" },
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
