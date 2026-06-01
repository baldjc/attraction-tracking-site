import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdmin } from "@/lib/auth-utils";
import { processAuditJob } from "@/lib/process-audit-job";

// Must match the Prisma ServiceTier enum exactly.
const ALLOWED_TIERS = [
  "foundations",
  "production",
  "growth",
  "done_with_you",
] as const;
type Tier = (typeof ALLOWED_TIERS)[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const tier = body.serviceTier as string | undefined;
  const stripeCustomerId = (body.stripeCustomerId as string | undefined)?.trim() || null;

  if (!tier || !ALLOWED_TIERS.includes(tier as Tier)) {
    return NextResponse.json({ error: "Invalid serviceTier" }, { status: 400 });
  }

  const lead = await prisma.user.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.role !== "audit_lead") {
    return NextResponse.json({ error: "User is not a lead" }, { status: 400 });
  }

  // Flip the lead into a member.
  await prisma.user.update({
    where: { id },
    data: {
      role: "foundations_member",
      serviceTier: tier as Tier,
      leadStatus: "Converted",
      convertedFromLeadAt: new Date(),
      ...(stripeCustomerId ? { stripeCustomerId } : {}),
    },
  });

  // Auto-queue a fresh full Baseline audit — the lead audit was intentionally
  // thin; new members get the real one with solutions + video breakdowns.
  const job = await prisma.auditJob.create({
    data: { auditType: "baseline", userId: id, status: "queued" },
  });
  processAuditJob(job.id).catch(console.error);

  // TODO: fire GHL pipeline event so CRM reflects conversion (out of scope here).

  return NextResponse.json({ ok: true, jobId: job.id });
}
