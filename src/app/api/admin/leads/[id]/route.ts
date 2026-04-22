import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdmin } from "@/lib/auth-utils";

const ALLOWED_STATUSES = ["New", "Audited", "Pitched", "Converted", "Lost"] as const;
type LeadStatusValue = (typeof ALLOWED_STATUSES)[number];

export async function PATCH(
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
  const leadStatus = body.leadStatus as string | undefined;
  if (!leadStatus || !ALLOWED_STATUSES.includes(leadStatus as LeadStatusValue)) {
    return NextResponse.json({ error: "Invalid leadStatus" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { leadStatus: leadStatus as LeadStatusValue },
    select: { id: true, leadStatus: true },
  });

  return NextResponse.json({ user: updated });
}
