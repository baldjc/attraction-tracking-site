import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canStaffAccessMember } from "@/lib/staff-access";

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

// Admin-side equivalent of the member binge-selector endpoint. Returns every
// plan owned by the target member (id) EXCEPT the one being edited
// (excludeId), sorted most-recently-updated first. Used by the shared
// ContentPlanEditModal when opened by an admin/editor on behalf of a member.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const excludeId = searchParams.get("excludeId");

  const plans = await prisma.contentPlan.findMany({
    where: {
      userId: id,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      theme: true,
      status: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ plans });
}
