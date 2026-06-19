import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { normalizeEmail } from "@/lib/normalize-email";
import type { ServiceTier, User } from "@/generated/prisma/client";

/**
 * Shared member-provisioning path.
 *
 * This is the single function that brings a new member into existence — the
 * User row with role `foundations_member`, a service tier, a random temporary
 * password, and onboarding state reset to "not started" (step 0) so the wizard
 * runs on their first visit. Both the manual admin "Add member" flow and the
 * GHL sync call this, so a manually-added member is byte-for-byte the same
 * shape as a synced one.
 *
 * IMPORTANT: callers are responsible for the "does this email already exist?"
 * check (and any 409 handling). This function only CREATES.
 */
export interface ProvisionMemberInput {
  /** Raw email — normalized (trim + lowercase) inside this function. */
  email: string;
  fullName?: string | null;
  /** YouTube handle; caller should strip a leading "@" before passing. */
  youtubeHandle?: string | null;
  youtubeChannelUrl?: string | null;
  youtubeChannelName?: string | null;
  /** Defaults to `foundations`. */
  serviceTier?: ServiceTier;
  /** QA/throwaway flag — excluded from metric tiles + default CSV export. */
  isTestAccount?: boolean;
  /** Program start date. Defaults to now() when omitted. */
  invitedAt?: Date | null;
  ghlContactId?: string | null;
  phone?: string | null;
}

export async function provisionMember(input: ProvisionMemberInput): Promise<User> {
  const email = normalizeEmail(input.email);

  // Random temporary password — members never use it; they log in via the
  // emailed one-time code. Mirrors the GHL sync path.
  const tempPassword = "member-" + Math.random().toString(36).slice(2, 10);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  return prisma.user.create({
    data: {
      email,
      fullName: input.fullName ?? null,
      passwordHash,
      role: "foundations_member",
      serviceTier: input.serviceTier ?? "foundations",
      isTestAccount: input.isTestAccount ?? false,
      youtubeHandle: input.youtubeHandle ?? null,
      youtubeChannelUrl: input.youtubeChannelUrl ?? null,
      youtubeChannelName: input.youtubeChannelName ?? null,
      ghlContactId: input.ghlContactId ?? null,
      phone: input.phone ?? null,
      invitedAt: input.invitedAt ?? new Date(),
      // Onboarding "not started" — onboardingStep defaults to 0 and
      // onboardingComplete to false in the schema, set explicitly for clarity.
      onboardingStep: 0,
      onboardingComplete: false,
    },
  });
}
