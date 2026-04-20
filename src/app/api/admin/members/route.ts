import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/client";

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionEmail = session.user.email;
  const staffUser = sessionEmail
    ? await prisma.user.findUnique({
        where: { email: sessionEmail },
        select: { allowedMemberIds: true },
      })
    : null;

  const allowedIds =
    staffUser?.allowedMemberIds && Array.isArray(staffUser.allowedMemberIds)
      ? (staffUser.allowedMemberIds as string[])
      : null;

  const members = allowedIds && allowedIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: allowedIds } },
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          email: true,
          serviceTier: true,
          youtubeChannelName: true,
          youtubeChannelUrl: true,
        },
      })
    : await prisma.user.findMany({
        where: { role: { notIn: [UserRole.admin, UserRole.editor] } },
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          email: true,
          serviceTier: true,
          youtubeChannelName: true,
          youtubeChannelUrl: true,
        },
      });

  return NextResponse.json({ members });
}
