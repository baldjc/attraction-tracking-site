// DB accessors for per-member metric methodology settings.
//
// Server-only (imports prisma). Pure types/presets/normalization live in the
// client-safe `member-metric-settings.ts`.

import prisma from "@/lib/prisma";
import {
  DEFAULT_METHODOLOGY,
  normalizeMethodologySettings,
  type MemberMethodologySettings,
} from "@/lib/member-metric-settings";

/**
 * Load a member's methodology settings. Returns the Default preset when no row
 * exists (the member has never opened the panel), so callers never special-case
 * null. Always returns a fully-populated, validated object.
 */
export async function loadMemberMetricSettings(
  userId: string,
): Promise<MemberMethodologySettings> {
  const row = await prisma.memberMetricSettings.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULT_METHODOLOGY };
  return normalizeMethodologySettings(row);
}

/**
 * Upsert a member's methodology settings. Input is normalized first, so callers
 * can pass partial / untrusted data safely.
 */
export async function saveMemberMetricSettings(
  userId: string,
  input: unknown,
): Promise<MemberMethodologySettings> {
  const s = normalizeMethodologySettings(input);
  await prisma.memberMetricSettings.upsert({
    where: { userId },
    create: { userId, ...s },
    update: { ...s },
  });
  return s;
}
