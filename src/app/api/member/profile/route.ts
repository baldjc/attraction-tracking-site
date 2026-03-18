import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, thankYouPageUrl: true, fullName: true, email: true, creatorCredentials: true },
  });

  return NextResponse.json(dbUser ?? {});
}

export async function PUT(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { thankYouPageUrl, creatorCredentials } = await req.json();

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(thankYouPageUrl !== undefined && { thankYouPageUrl: thankYouPageUrl ?? null }),
      ...(creatorCredentials !== undefined && { creatorCredentials: creatorCredentials ?? null }),
    },
    select: { id: true, thankYouPageUrl: true, creatorCredentials: true },
  });

  return NextResponse.json(updated);
}
