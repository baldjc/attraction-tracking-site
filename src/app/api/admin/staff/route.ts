import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

async function requireSuperAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return session.user;
}

export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const staff = await prisma.user.findMany({
    where: { role: { in: ["admin", "editor"] } },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      allowedMemberIds: true,
      createdAt: true,
    },
  });

  const members = await prisma.user.findMany({
    where: { role: { not: "admin" } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, email: true, youtubeChannelName: true },
  });

  return NextResponse.json({ staff, members });
}

export async function PUT(req: NextRequest) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { staffUserId, allowedMemberIds } = await req.json() as {
    staffUserId: string;
    allowedMemberIds: string[] | null;
  };

  if (!staffUserId) return NextResponse.json({ error: "Missing staffUserId" }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id: staffUserId },
    data: { allowedMemberIds: allowedMemberIds ?? Prisma.DbNull },
    select: { id: true, allowedMemberIds: true },
  });

  return NextResponse.json({ ok: true, updated });
}
