import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { niche, city } = await req.json();
  if (!niche) return NextResponse.json({ error: "Missing niche" }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      niche,
      city: niche === "real_estate" ? (city ?? null) : null,
    },
    select: { niche: true, city: true },
  });

  return NextResponse.json(updated);
}
