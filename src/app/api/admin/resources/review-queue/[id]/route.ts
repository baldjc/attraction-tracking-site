import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as any).role !== "admin") return null;
  return session.user;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { action, principles, subTopic, summary, memberId, isGeneralTeaching } = await req.json();

  const data: Record<string, unknown> = {};
  if (action === "approve") data.status = "approved";
  else if (action === "reject") data.status = "rejected";
  if (principles !== undefined) data.principles = principles;
  if (subTopic !== undefined) data.subTopic = subTopic;
  if (summary !== undefined) data.summary = summary;
  if (memberId !== undefined) data.memberId = memberId || null;
  if (isGeneralTeaching !== undefined) data.isGeneralTeaching = isGeneralTeaching;

  const updated = await prisma.knowledgeBaseEntry.update({ where: { id }, data });
  return NextResponse.json(updated);
}
