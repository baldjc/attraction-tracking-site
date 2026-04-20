import prisma from "@/lib/prisma";
import { getChannelInfo } from "@/lib/youtube";

/**
 * Resolve a YouTube channelRef (UCxxxx…) to the local userIds whose
 * `YouTubeVideo` / `ContentPlan` rows belong to that channel.
 *
 * Mapping: admin users with a `youtubeHandle` or `youtubeChannelUrl` whose
 * resolved channelId matches `channelRef`. Clients have their own channel
 * field but don't own ContentPlan / YouTubeVideo rows in this schema, so
 * they're handled directly via `Client.ownChannelId` elsewhere.
 *
 * Cached for 5 minutes per channelRef to avoid repeated youtube.com lookups.
 */

type CacheEntry = { userIds: string[]; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

export async function resolveUsersForChannel(
  channelRef: string,
): Promise<string[]> {
  const hit = cache.get(channelRef);
  if (hit && hit.expiresAt > Date.now()) return hit.userIds;

  const userIds = new Set<string>();

  const admins = await prisma.user.findMany({
    where: {
      role: "admin",
      OR: [
        { youtubeHandle: { not: null } },
        { youtubeChannelUrl: { not: null } },
      ],
    },
    select: { id: true, youtubeHandle: true, youtubeChannelUrl: true },
  });
  for (const a of admins) {
    const handle = a.youtubeHandle || a.youtubeChannelUrl;
    if (!handle) continue;
    try {
      const info = await getChannelInfo(handle);
      if (info?.channelId === channelRef) userIds.add(a.id);
    } catch (err) {
      console.error(
        `[reviewer-channel-resolver] admin ${a.id} (${handle}):`,
        err,
      );
    }
  }

  const list = Array.from(userIds);
  cache.set(channelRef, { userIds: list, expiresAt: Date.now() + TTL_MS });
  return list;
}
