import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canStaffAccessMember } from "@/lib/staff-access";

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; callId: string }> }
) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, callId } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { fathomUrl, loomUrl, callDate, topic, notes } = await req.json();

  try {
    const existing = await prisma.clientCall.findUnique({ where: { id: callId } });
    if (!existing || existing.userId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const call = await prisma.clientCall.update({
      where: { id: callId },
      data: {
        ...(fathomUrl !== undefined && { fathomUrl: fathomUrl || null }),
        ...(loomUrl !== undefined && { loomUrl: loomUrl || null }),
        ...(callDate !== undefined && { callDate: new Date(callDate) }),
        ...(topic !== undefined && { topic }),
        ...(notes !== undefined && { notes }),
      },
    });

    return NextResponse.json({ call });
  } catch (err) {
    console.error("[calls PUT]", err);
    return NextResponse.json({ error: "Failed to update call recording. Please try again." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; callId: string }> }
) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, callId } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const existing = await prisma.clientCall.findUnique({ where: { id: callId } });
    if (!existing || existing.userId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.clientCall.delete({ where: { id: callId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[calls DELETE]", err);
    return NextResponse.json({ error: "Failed to delete call recording." }, { status: 500 });
  }
}
