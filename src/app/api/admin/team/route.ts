import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return (session.user as { id: string }).id;
}

// Read-only Team Access overview for a given member, used by the admin support
// panel. Returns active grants, pending invites, and the last 20 audit entries.
export async function GET(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = req.nextUrl.searchParams.get("userId") || "";
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  const [members, invites, activity] = await Promise.all([
    prisma.teamMember.findMany({
      where: { primaryUserId: userId, status: "active" },
      orderBy: { acceptedAt: "desc" },
      select: { id: true, email: true, name: true, acceptedAt: true },
    }),
    prisma.teamInvite.findMany({
      where: { primaryUserId: userId, status: "pending" },
      orderBy: { sentAt: "desc" },
      select: { id: true, email: true, sentAt: true, expiresAt: true },
    }),
    prisma.teamActivityLog.findMany({
      where: { primaryUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, actorType: true, actorName: true, action: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({ members, invites, activity });
}
