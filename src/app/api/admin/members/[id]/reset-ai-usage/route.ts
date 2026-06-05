import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { canStaffAccessMember } from "@/lib/staff-access";
import { getCostCapStatus, resetCurrentPeriodUsage } from "@/lib/ai-tool-cost";

/**
 * Admin-only: clear a member's AI usage for the current billing period so a
 * cost-capped pilot member can keep testing without waiting for the monthly
 * reset. Returns the before/after spend so the operator can confirm the member
 * is no longer hard-blocked. Editors are rejected (admin role required).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const actorId = (session?.user as any)?.id as string | undefined;
  if (!session?.user || !role || !isAdmin(role) || !actorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await canStaffAccessMember(actorId, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const before = await getCostCapStatus(id);
  const deleted = await resetCurrentPeriodUsage(id);
  const after = await getCostCapStatus(id);

  return NextResponse.json({
    ok: true,
    deleted,
    before: {
      monthSpendUsd: before.monthSpendUsd,
      capUsd: before.capUsd,
      hardBlocked: before.hardBlocked,
    },
    after: {
      monthSpendUsd: after.monthSpendUsd,
      capUsd: after.capUsd,
      hardBlocked: after.hardBlocked,
    },
  });
}
