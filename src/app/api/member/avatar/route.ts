import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
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

  return NextResponse.json(dbUser ?? {});
}

const PALETTE = ["#3B82F6", "#F59E0B", "#EF4444", "#10B981", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];
const DEFAULT_EMOJIS = ["🎯", "⚡", "🔥", "🌿", "💡", "💎", "🌊", "🚀"];

function normalizeThemes(themes: unknown): object[] | null {
  if (!Array.isArray(themes)) return null;
  return themes.map((t, i) => {
    const colour = PALETTE[i % PALETTE.length];
    const emoji = DEFAULT_EMOJIS[i % DEFAULT_EMOJIS.length];
    if (typeof t === "string") {
      return { name: t, coreStress: null, emoji, colour };
    }
    const obj = t as Record<string, unknown>;
    return {
      ...obj,
      colour: obj.colour ?? colour,
      emoji: obj.emoji ?? emoji,
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
