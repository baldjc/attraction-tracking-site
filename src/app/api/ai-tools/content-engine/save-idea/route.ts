import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { theme, title, talkingPoints, framework, whyItWorks, source } = await req.json();

  if (!theme || !title) {
    return NextResponse.json({ error: "Missing theme or title" }, { status: 400 });
  }

  const saved = await prisma.savedIdea.create({
    data: {
      userId: user.id,
      theme,
      title,
      talkingPoints: talkingPoints ?? [],
      framework: framework ?? null,
      whyItWorks: whyItWorks ?? null,
      source: source ?? "batch",
    },
  });

  return NextResponse.json({ id: saved.id, saved: true });
}
