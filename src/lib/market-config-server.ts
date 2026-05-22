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

/**
 * Tier-based cap on CSV files per upload batch.
 *
 *   Foundations              → 13  (1-year YoY backfill: current + 12 prior)
 *   Growth (editing/mastery) → 25  (2-year YoY backfill: current + 24 prior)
 *   Done-With-You            → 25
 *
 * Reads `User.serviceTier` directly; admins inherit whatever tier the
 * impersonated/effective user has (caller is expected to pass the effective
 * user id, e.g. from `requireMarketAccess().user.id`).
 *
 * Defaults to the foundations limit (13) if the user row can't be loaded —
 * the safer choice for an unauthenticated/missing user; legitimate callers
 * always have a row because requireMarketAccess resolved them first.
 */
export async function getMaxUploadBatchForUser(
  userId: string,
): Promise<{ limit: number; tier: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { serviceTier: true },
  });
  const tier = user?.serviceTier ?? "foundations";
  const limit = tier === "foundations" ? 13 : 25;
  return { limit, tier };
}
