import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";

interface RouteCtx {
  params: Promise<{ neighbourhood: string }>;
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  const { neighbourhood: encoded } = await ctx.params;
  const neighbourhood = decodeURIComponent(encoded);

  const body = (await req.json().catch(() => ({}))) as {
    content?: unknown;
    summary?: unknown;
  };

  const content =
    typeof body.content === "string" && body.content.trim().length
      ? body.content
      : null;
  if (!content) {
    return Response.json(
      { error: "Profile content cannot be empty." },
      { status: 400 },
    );
  }
  const summary =
    typeof body.summary === "string" && body.summary.trim().length
      ? body.summary.trim()
      : null;

  const existing = await prisma.neighbourhoodProfile.findUnique({
    where: {
      userId_neighbourhood: {
        userId: access.user.id,
        neighbourhood,
      },
    },
  });
  if (!existing) {
    return Response.json({ error: "Profile not found." }, { status: 404 });
  }

  const updated = await prisma.neighbourhoodProfile.update({
    where: { id: existing.id },
    data: { content, summary },
  });

  return Response.json({
    neighbourhood: updated.neighbourhood,
    lastUpdatedAt: updated.lastUpdatedAt.toISOString(),
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  const { neighbourhood: encoded } = await ctx.params;
  const neighbourhood = decodeURIComponent(encoded);

  await prisma.neighbourhoodProfile.deleteMany({
    where: { userId: access.user.id, neighbourhood },
  });

  return Response.json({ ok: true });
}
