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
  if (auditRequest.status === "audited") {
    return NextResponse.json({ error: "Audit already completed for this request" }, { status: 400 });
  }

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
  }

  await prisma.auditRequest.update({
    where: { id },
    data: { userId: user.id },
  });

  const job = await prisma.auditJob.create({
    data: { auditType: "baseline", userId: user.id, status: "queued" },
  });

  processAuditJob(job.id).catch(console.error);

  return NextResponse.json({ jobId: job.id, userId: user.id });
}
