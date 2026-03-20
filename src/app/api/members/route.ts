import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let whereClause: Record<string, unknown> = { role: "foundations_member" };

  if (role === "editor") {
    const editorId = (session.user as any).id as string;
    const editor = await prisma.user.findUnique({
      where: { id: editorId },
      select: { allowedMemberIds: true },
    });
    const allowed = editor?.allowedMemberIds;
    if (allowed !== null && Array.isArray(allowed)) {
      whereClause = { id: { in: allowed as string[] }, role: "foundations_member" };
    }
  }

  const members = await prisma.user.findMany({
    where: whereClause,
    orderBy: { fullName: "asc" },
    include: {
      _count: { select: { audits: true } },
      audits: {
        where: { auditType: { in: ["baseline", "monthly"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { overallScore: true, createdAt: true },
      },
    },
  });

  const formatted = members.map((m) => ({
    id: m.id,
    email: m.email,
    fullName: m.fullName,
    youtubeHandle: m.youtubeHandle,
    youtubeChannelUrl: m.youtubeChannelUrl,
    serviceTier: m.serviceTier,
    slackUserId: m.slackUserId,
    skoolProfile: m.skoolProfile,
    ghlContactId: m.ghlContactId,
    createdAt: m.createdAt.toISOString(),
    _count: m._count,
    latestAuditScore: m.audits[0]?.overallScore ?? null,
    latestAuditDate: m.audits[0]?.createdAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ members: formatted });
}
