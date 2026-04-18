import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  const [scripts, scriptDrafts, ideas, conversations, repurposed] = await Promise.all([
    prisma.savedScript.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, videoTitle: true, createdAt: true },
    }),
    prisma.scriptDraft.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, videoTitle: true, updatedAt: true, createdAt: true },
    }),
    prisma.savedIdea.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.aIToolConversation.findMany({
      where: {
        userId,
        toolType: { in: ["script_review", "title_thumbnail_analyzer"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, toolType: true, title: true, createdAt: true },
    }),
    prisma.repurposedContent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, videoTitle: true, toolType: true, createdAt: true },
    }),
  ]);

  const items = [
    ...scripts.map((s) => ({
      id: s.id,
      type: "script" as const,
      title: s.videoTitle || "Untitled Script",
      createdAt: s.createdAt.toISOString(),
      expiresAt: null,
      toolUrl: `/member/ai-tools/arc-script-builder?load=${s.id}`,
      badge: "Script",
    })),
    ...scriptDrafts.map((d) => ({
      id: d.id,
      type: "draft" as const,
      title: d.videoTitle || "Untitled Draft",
      createdAt: d.updatedAt.toISOString(),
      expiresAt: null,
      toolUrl: `/member/ai-tools/arc-script-builder?resume=${d.id}`,
      badge: "Script In Progress",
    })),
    ...ideas.map((i) => ({
      id: i.id,
      type: "idea" as const,
      title: i.title || "Untitled Idea",
      createdAt: i.createdAt.toISOString(),
      expiresAt: null,
      toolUrl: `/member/ai-tools/content-engine?idea=${i.id}`,
      badge: "Idea",
    })),
    ...conversations.map((c) => {
      const isReview = c.toolType === "script_review";
      const expiry = new Date(c.createdAt);
      expiry.setDate(expiry.getDate() + 30);
      return {
        id: c.id,
        type: isReview ? ("review" as const) : ("analysis" as const),
        title: c.title || (isReview ? "Script Review" : "Title Analysis"),
        createdAt: c.createdAt.toISOString(),
        expiresAt: expiry.toISOString(),
        toolUrl: isReview
          ? `/member/ai-tools/script-review?load=${c.id}`
          : `/member/ai-tools/title-thumbnail-analyzer?load=${c.id}`,
        badge: isReview ? "Review" : "Analysis",
      };
    }),
    ...repurposed.map((r) => {
      const expiry = new Date(r.createdAt);
      expiry.setDate(expiry.getDate() + 60);
      return {
        id: r.id,
        type: "repurposed" as const,
        title: r.videoTitle || `Repurposed (${r.toolType})`,
        createdAt: r.createdAt.toISOString(),
        expiresAt: expiry.toISOString(),
        toolUrl: `/member/ai-tools/repurpose-content?load=${r.id}`,
        badge: "Repurposed",
      };
    }),
  ];

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ items: items.slice(0, 100) });
}
