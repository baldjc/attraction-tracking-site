import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, linkId } = await params;
  const { label, url } = await req.json();

  const existing = await prisma.clientQuickLink.findUnique({ where: { id: linkId } });
  if (!existing || existing.userId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const quickLink = await prisma.clientQuickLink.update({
    where: { id: linkId },
    data: {
      ...(label !== undefined && { label }),
      ...(url !== undefined && { url }),
    },
  });

  return NextResponse.json({ quickLink });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, linkId } = await params;

  const existing = await prisma.clientQuickLink.findUnique({ where: { id: linkId } });
  if (!existing || existing.userId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.clientQuickLink.delete({ where: { id: linkId } });
  return NextResponse.json({ success: true });
}
