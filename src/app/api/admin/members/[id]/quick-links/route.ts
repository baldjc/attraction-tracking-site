import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canStaffAccessMember } from "@/lib/staff-access";

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const quickLinks = await prisma.clientQuickLink.findMany({
    where: { userId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ quickLinks });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { label, url } = await req.json();

  if (!label || !url) {
    return NextResponse.json({ error: "label and url are required" }, { status: 400 });
  }

  const maxOrder = await prisma.clientQuickLink.aggregate({
    where: { userId: id },
    _max: { sortOrder: true },
  });

  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  const quickLink = await prisma.clientQuickLink.create({
    data: { userId: id, label, url, sortOrder },
  });

  return NextResponse.json({ quickLink });
}
