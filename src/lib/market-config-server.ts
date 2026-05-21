import prisma from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/feature-flags";
import { resolveUserFromSession, type ResolvedUser } from "@/lib/session-utils";
import {
  toShape,
  type MarketConfigShape,
} from "@/lib/market-config";

export interface MarketAccessOk {
  ok: true;
  user: ResolvedUser;
}
export interface MarketAccessDenied {
  ok: false;
  response: Response;
}

/**
 * Standard auth + flag gate for every /api/member/market-data/* route.
 * Returns the resolved user on success, or a Response (401/403) ready to return.
 *
 * Lives in a separate file from `market-config.ts` because it imports
 * `next/headers` via `session-utils`, which makes the module server-only.
 * Client Components import pure constants from `market-config.ts` directly.
 */
export async function requireMarketAccess(): Promise<
  MarketAccessOk | MarketAccessDenied
> {
  const user = await resolveUserFromSession();
  if (!user) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  }
  const flags = await getFeatureFlags({
    userId: user.id,
    userRole: user.role,
  });
  if (!flags.tool_market_data) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    };
  }
  return { ok: true, user };
}

export async function getMarketConfigForUser(
  userId: string,
): Promise<MarketConfigShape | null> {
  const row = await prisma.marketConfig.findUnique({ where: { userId } });
  if (!row) return null;
  return toShape(row);
}
