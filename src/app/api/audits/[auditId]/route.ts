import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { auditId } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: { user: { select: { id: true, fullName: true, email: true, youtubeHandle: true, youtubeChannelUrl: true } } },
  });

  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Members can only see their own audits
  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  if (userRole !== "admin" && audit.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ audit });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { auditId } = await params;

  const audit = await prisma.audit.findUnique({ where: { id: auditId } });
  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Also clean up any audit jobs pointing at this audit
  await prisma.auditJob.updateMany({
    where: { auditId },
    data: { auditId: null },
  });

  await prisma.audit.delete({ where: { id: auditId } });

  return NextResponse.json({ success: true });
}
