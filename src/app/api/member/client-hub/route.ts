import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { withRouteErrorHandling } from "@/lib/api-error-wrapper";
import { hasClientHubAccess, normalizeLegacyTier } from "@/lib/service-tier";

export const GET = withRouteErrorHandling("member/client-hub", GET_impl);

async function GET_impl() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { serviceTier: true, assetsDriveLink: true, clientHubEnabled: true },
  });
  if (!dbUser) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tier = normalizeLegacyTier(dbUser.serviceTier) ?? "foundations";

  if (!hasClientHubAccess(tier) || !dbUser.clientHubEnabled) {
    return NextResponse.json({ error: "tier_restricted" }, { status: 403 });
  }

  const growthDwyTiers = ["growth", "done_with_you"];

  const [productionPlans, quickLinks] = await Promise.all([
    prisma.contentPlan.findMany({
      where: { userId: user.id, deletedAt: null },
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
