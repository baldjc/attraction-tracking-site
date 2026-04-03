import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { getStatusOptions, isValidStatus } from "@/lib/content-plan-utils";

export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");
  const themeFilter = searchParams.get("theme");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { serviceTier: true },
  });

  const plans = await prisma.contentPlan.findMany({
    where: {
      userId: user.id,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(themeFilter ? { theme: themeFilter } : {}),
    },
    orderBy: { publishDate: "desc" },
  });

  return NextResponse.json({ plans, serviceTier: dbUser?.serviceTier ?? "foundations" });
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { serviceTier: true },
  });
  const serviceTier = dbUser?.serviceTier ?? "foundations";

  const body = await req.json();
  const { title, status, theme, shootDate, publishDate, editDueDate, priority, notes, thumbnailWords, footageLink, linkedIdeaId, linkedScriptId, youtubeVideoId } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const requestedStatus = status ?? "Idea";
  const finalStatus = isValidStatus(requestedStatus, serviceTier)
    ? requestedStatus
    : getStatusOptions(serviceTier)[0] ?? "Idea";

  const plan = await prisma.contentPlan.create({
    data: {
      userId: user.id,
      title: title.trim(),
      status: finalStatus,
      theme: theme ?? null,
      shootDate: shootDate ? new Date(shootDate) : null,
      publishDate: publishDate ? new Date(publishDate) : null,
      editDueDate: editDueDate ? new Date(editDueDate) : null,
      priority: priority ?? null,
      notes: notes ?? null,
      thumbnailWords: thumbnailWords ?? null,
      footageLink: footageLink ?? null,
      linkedIdeaId: linkedIdeaId ?? null,
      linkedScriptId: linkedScriptId ?? null,
      youtubeVideoId: youtubeVideoId ?? null,
    },
  });

  return NextResponse.json({ plan, serviceTier }, { status: 201 });
}
