import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarProfile: true, avatarName: true, avatarSummary: true, contentThemes: true, updatedAt: true },
  });

  return NextResponse.json(dbUser ?? {});
}

export async function PUT(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { avatarProfile, avatarName, avatarSummary, contentThemes } = await req.json();

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(avatarProfile !== undefined && { avatarProfile }),
      ...(avatarName !== undefined && { avatarName }),
      ...(avatarSummary !== undefined && { avatarSummary }),
      ...(contentThemes !== undefined && { contentThemes }),
    },
    select: { avatarProfile: true, avatarName: true, avatarSummary: true, contentThemes: true, updatedAt: true },
  });

  return NextResponse.json(updated);
}
