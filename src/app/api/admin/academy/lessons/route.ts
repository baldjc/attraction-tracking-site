import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function adminOnly(role: string | undefined) {
  return !role || role !== "admin";
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    sectionId, title, slug, youtubeUrl, description,
    keyTakeaways, actionItems, principleTags,
    aiToolLink, aiToolLabel, sortOrder, published,
  } = body;

  const lesson = await prisma.courseLesson.create({
    data: {
      sectionId,
      title,
      slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      youtubeUrl: youtubeUrl ?? null,
      description: description ?? null,
      keyTakeaways: keyTakeaways ?? null,
      actionItems: actionItems ?? null,
      principleTags: principleTags ?? [],
      aiToolLink: aiToolLink ?? null,
      aiToolLabel: aiToolLabel ?? null,
      sortOrder: sortOrder ?? 0,
      published: published ?? false,
    },
  });

  return NextResponse.json({ lesson });
}
