import prisma from "@/lib/prisma";

const TTL_MS = 30 * 1000;
let cached: { value: boolean; expiresAt: number } | null = null;

export async function isReviewerEnabled(): Promise<boolean> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const row = await prisma.appSetting.findUnique({
    where: { key: "tool_analytics_reviewer" },
    select: { value: true },
  });
  const value = row?.value === "true";
  cached = { value, expiresAt: Date.now() + TTL_MS };
  return value;
}

export function invalidateReviewerFlagCache() {
  cached = null;
}
