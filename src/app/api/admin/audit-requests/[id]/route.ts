import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveUserFromSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const auditRequest = await prisma.auditRequest.findUnique({
    where: { id },
    select: { id: true, auditId: true },
  });
  if (!auditRequest) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Delete the linked Audit (if any) along with the request — the admin is
  // clearing out this lead entirely, not just unlinking the report.
  // AuditJob.auditRequestId uses onDelete: SetNull, so historical job rows
  // are preserved but no longer reference this request.
  await prisma.$transaction(async (tx) => {
    await tx.auditRequest.delete({ where: { id } });
    if (auditRequest.auditId) {
      await tx.audit.delete({ where: { id: auditRequest.auditId } }).catch(() => {});
    }
  });

  return NextResponse.json({ ok: true });
}
