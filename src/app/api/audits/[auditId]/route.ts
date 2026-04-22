import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor, canAccessTier } from "@/lib/auth-utils";

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
    include: { user: { select: { id: true, fullName: true, email: true, youtubeHandle: true, youtubeChannelUrl: true, youtubeChannelName: true, serviceTier: true } } },
  });

  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;

  // Editor can view audits for editing/mastery members
  if (isAdminOrEditor(userRole)) {
    if (audit.user && !canAccessTier(userRole, audit.user.serviceTier)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (audit.userId !== userId) {
    // Members can only see their own audits
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

  // Unlink any AuditRequest that pointed at this audit and reopen it so the
  // admin can re-run it from the Audit Requests tab.
  await prisma.auditRequest.updateMany({
    where: { auditId },
    data: { auditId: null, status: "pending" },
  });

  await prisma.audit.delete({ where: { id: auditId } });

  return NextResponse.json({ success: true });
}
