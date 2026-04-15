import prisma from "@/lib/prisma";

export interface AvatarData {
  avatarProfile: any | null;
  avatarName: string | null;
  avatarSummary: string | null;
  contentThemes: any | null;
  niche: any | null;
  city: string | null;
  testAvatarId: string | null;
  testAvatarLabel: string | null;
  testMemberId: string | null;
  testMemberName: string | null;
}

const AVATAR_SELECT = {
  avatarProfile: true,
  avatarName: true,
  avatarSummary: true,
  contentThemes: true,
  niche: true,
  city: true,
} as const;

/**
 * Resolves avatar data for the given user.
 *
 * Three modes:
 * 1. Admin with activeTestMemberId set → fetch that member's avatar live
 * 2. Admin with activeTestAvatarId set → fetch from AdminTestAvatar table
 * 3. Default → return user's own avatar data
 */
export async function getAvatarData(userId: string): Promise<AvatarData> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      activeTestAvatarId: true,
      activeTestMemberId: true,
      ...AVATAR_SELECT,
    },
  });

  if (!user) {
    return {
      avatarProfile: null,
      avatarName: null,
      avatarSummary: null,
      contentThemes: null,
      niche: null,
      city: null,
      testAvatarId: null,
      testAvatarLabel: null,
      testMemberId: null,
      testMemberName: null,
    };
  }

  // ── Mode 1: Borrowing a member's avatar (live fetch, always current) ──
  if (user.role === "admin" && user.activeTestMemberId) {
    const member = await prisma.user.findUnique({
      where: { id: user.activeTestMemberId },
      select: { fullName: true, email: true, ...AVATAR_SELECT },
    });

    if (member) {
      const memberName = member.fullName || member.email || "Unknown Member";
      return {
        avatarProfile: member.avatarProfile,
        avatarName: member.avatarName,
        avatarSummary: member.avatarSummary,
        contentThemes: member.contentThemes,
        niche: member.niche,
        city: member.city,
        testAvatarId: null,
        testAvatarLabel: `${memberName}'s Avatar`,
        testMemberId: user.activeTestMemberId,
        testMemberName: memberName,
      };
    }
    // Member not found (deleted?) — fall through to default
  }

  // ── Mode 2: Using a custom test avatar ──
  if (user.role === "admin" && user.activeTestAvatarId) {
    const testAvatar = await prisma.adminTestAvatar.findUnique({
      where: { id: user.activeTestAvatarId },
    });

    if (testAvatar) {
      return {
        avatarProfile: testAvatar.avatarProfile,
        avatarName: testAvatar.avatarName,
        avatarSummary: testAvatar.avatarSummary,
        contentThemes: testAvatar.contentThemes,
        niche: testAvatar.niche,
        city: testAvatar.city,
        testAvatarId: testAvatar.id,
        testAvatarLabel: testAvatar.label,
        testMemberId: null,
        testMemberName: null,
      };
    }
    // Test avatar not found (deleted?) — fall through to default
  }

  // ── Mode 3: Default — user's own avatar ──
  return {
    avatarProfile: user.avatarProfile,
    avatarName: user.avatarName,
    avatarSummary: user.avatarSummary,
    contentThemes: user.contentThemes,
    niche: user.niche,
    city: user.city,
    testAvatarId: null,
    testAvatarLabel: null,
    testMemberId: null,
    testMemberName: null,
  };
}
