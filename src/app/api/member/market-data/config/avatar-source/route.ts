import prisma from "@/lib/prisma";
import { requireMarketAccess } from "@/lib/market-config-server";

/**
 * GET /api/member/market-data/config/avatar-source
 *
 * Returns the *live* Avatar Architect state for the requesting user, so the
 * Market Data Setup Form can pull a snapshot. Avatar Architect remains the
 * canonical source — MarketConfig.primaryAvatar is only a point-in-time copy.
 */
export async function GET() {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;

  const user = await prisma.user.findUnique({
    where: { id: access.user.id },
    select: {
      avatarProfile: true,
      avatarName: true,
      avatarSummary: true,
      updatedAt: true,
    },
  });

  if (!user || (!user.avatarProfile && !user.avatarName && !user.avatarSummary)) {
    return Response.json({ hasAvatar: false });
  }

  return Response.json({
    hasAvatar: true,
    name: user.avatarName ?? null,
    summary: user.avatarSummary ?? null,
    profile:
      user.avatarProfile && typeof user.avatarProfile === "object"
        ? user.avatarProfile
        : null,
    lastUpdatedAt: user.updatedAt.toISOString(),
  });
}
