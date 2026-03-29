import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await prisma.user.findUnique({
    where: { id: user.id },
    select: { niche: true, city: true },
  });

  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { niche, city } = await req.json();

  // Normalise niche: accept string (legacy) or array (new); null/empty → null
  let nicheValue: string[] | null = null;
  if (Array.isArray(niche) && niche.length > 0) {
    nicheValue = niche;
  } else if (typeof niche === "string" && niche.trim()) {
    nicheValue = [niche.trim()];
  }

  if (!nicheValue) {
    return NextResponse.json({ error: "Missing niche" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      niche: nicheValue,
      city: city ?? null,
    },
    select: { niche: true, city: true },
  });

  return NextResponse.json(updated);
}
