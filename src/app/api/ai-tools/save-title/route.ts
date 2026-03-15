import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, framework, topic } = await req.json();
  if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

  const saved = await prisma.savedTitle.create({
    data: { userId: user.id, title, framework, topic },
  });

  return NextResponse.json({ id: saved.id, saved: true });
}
