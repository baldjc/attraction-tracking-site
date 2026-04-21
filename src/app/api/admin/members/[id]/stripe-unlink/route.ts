import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canStaffAccessMember } from "@/lib/staff-access";

export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      stripePlanName: null,
      stripeCurrentPeriodEnd: null,
    },
  });

  return NextResponse.json({ success: true, member: updated });
}
