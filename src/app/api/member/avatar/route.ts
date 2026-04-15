import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { getAvatarData } from "@/lib/avatar-utils";
import { CANONICAL_THEMES } from "@/lib/canonical-themes";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const avatar = await getAvatarData(user.id);

  return NextResponse.json({
    avatarProfile: avatar.avatarProfile,
    avatarName: avatar.avatarName,
    avatarSummary: avatar.avatarSummary,
    contentThemes: avatar.contentThemes,
    niche: avatar.niche,
    city: avatar.city,
    testAvatarId: avatar.testAvatarId,
    testAvatarLabel: avatar.testAvatarLabel,
    testMemberId: avatar.testMemberId,
    testMemberName: avatar.testMemberName,
  });
}

function normalizeThemes(themes: unknown): object[] | null {
  if (!Array.isArray(themes)) return null;
  return themes.map((t) => {
    const name = typeof t === "string" ? t : (t as any).name;
    const canonical = CANONICAL_THEMES.find(
      (ct) => ct.name.toLowerCase() === name?.toLowerCase()
    );
    if (typeof t === "string") {
      return {
        name: t,
        coreStress: canonical?.coreStress ?? null,
        emoji: canonical?.emoji ?? "📌",
        colour: canonical?.colour ?? "#3B82F6",
      };
    }
    const obj = t as Record<string, unknown>;
    return {
      ...obj,
      emoji: obj.emoji ?? canonical?.emoji ?? "📌",
      colour: obj.colour ?? canonical?.colour ?? "#3B82F6",
      coreStress: obj.coreStress ?? canonical?.coreStress ?? null,
    };
  });
}

export async function PUT(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { avatarProfile, avatarName, avatarSummary, contentThemes } = await req.json();

  const normalized = contentThemes !== undefined ? normalizeThemes(contentThemes) : undefined;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(avatarProfile !== undefined && { avatarProfile }),
      ...(avatarName !== undefined && { avatarName }),
      ...(avatarSummary !== undefined && { avatarSummary }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(normalized !== undefined && { contentThemes: normalized as any }),
    },
    select: {
      avatarProfile: true,
      avatarName: true,
      avatarSummary: true,
      contentThemes: true,
      niche: true,
      city: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updated);
}
