import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdmin } from "@/lib/auth-utils";
import { processAuditJob } from "@/lib/process-audit-job";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { id } = await params;

  const auditRequest = await prisma.auditRequest.findUnique({ where: { id } });
  if (!auditRequest) {
    return NextResponse.json({ error: "Audit request not found" }, { status: 404 });
  }

  // Allow re-running: if a previous audit exists for this request, delete it
  // so the new run becomes the canonical audit for this lead.
  if (auditRequest.auditId) {
    try {
      await prisma.auditJob.updateMany({
        where: { auditId: auditRequest.auditId },
        data: { auditId: null },
      });
      await prisma.audit.delete({ where: { id: auditRequest.auditId } });
    } catch (err) {
      console.error(`[audit-request ${id}] failed to delete previous audit:`, err);
    }
  }
  // Reset to pending so the in-job linker re-attaches the new audit.
  await prisma.auditRequest.update({
    where: { id },
    data: { auditId: null, status: "pending" },
  });

  let user = await prisma.user.findUnique({ where: { email: auditRequest.email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: auditRequest.email,
        fullName: auditRequest.fullName,
        youtubeChannelUrl: auditRequest.youtubeChannelUrl,
        role: "audit_lead",
      },
    });
  } else if (user.role === "audit_lead") {
    // Refresh contact-record fields from the current Audit Request so the lead
    // pipeline shows the latest name/channel. We deliberately do NOT touch
    // existing member users (paying members) — only leads.
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        fullName: auditRequest.fullName,
        youtubeChannelUrl: auditRequest.youtubeChannelUrl,
      },
    });
  }

  await prisma.auditRequest.update({
    where: { id },
    data: { userId: user.id },
  });

  // Audit requests come from non-members (leads). Run a thinner "lead" audit
  // — problems + cost + which Attraction asset solves them — never a full baseline.
  // Pass auditRequestId so the engine audits THIS request's channel (not a
  // stale user.youtubeChannelUrl) and links the result back to THIS request.
  const job = await prisma.auditJob.create({
    data: {
      auditType: "lead",
      userId: user.id,
      auditRequestId: auditRequest.id,
      status: "queued",
    },
  });

  processAuditJob(job.id).catch(console.error);

  return NextResponse.json({ jobId: job.id, userId: user.id });
}
