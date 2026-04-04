import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { descriptionBoilerplate: true },
  });

  return NextResponse.json({ boilerplate: dbUser?.descriptionBoilerplate ?? "" });
}

export async function PUT(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { boilerplate } = await req.json();

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { descriptionBoilerplate: typeof boilerplate === "string" ? boilerplate : null },
    select: { descriptionBoilerplate: true },
  });

  return NextResponse.json({ boilerplate: updated.descriptionBoilerplate ?? "" });
}
