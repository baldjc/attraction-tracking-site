import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/client";
import { staffMemberIdFilter } from "@/lib/staff-access";

export async function GET() {
  const session = await auth();
  const sessionUser = session?.user as { id?: string; role?: string } | undefined;
  const role = sessionUser?.role;
  const userId = sessionUser?.id;
  if (!session?.user || (role !== "admin" && role !== "editor") || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowedFilter = await staffMemberIdFilter(userId);

  const where = allowedFilter
    ? { id: allowedFilter }
    : { role: { notIn: [UserRole.admin, UserRole.editor] } };

  const members = await prisma.user.findMany({
    where,
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
