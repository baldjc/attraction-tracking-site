import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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
  const { fathomUrl, callDate, topic, notes } = await req.json();

  const existing = await prisma.clientCall.findUnique({ where: { id: callId } });
  if (!existing || existing.userId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const call = await prisma.clientCall.update({
    where: { id: callId },
    data: {
      ...(fathomUrl !== undefined && { fathomUrl }),
      ...(callDate !== undefined && { callDate: new Date(callDate) }),
      ...(topic !== undefined && { topic }),
      ...(notes !== undefined && { notes }),
    },
  });

  return NextResponse.json({ call });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; callId: string }> }
) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, callId } = await params;

  const existing = await prisma.clientCall.findUnique({ where: { id: callId } });
  if (!existing || existing.userId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.clientCall.delete({ where: { id: callId } });
  return NextResponse.json({ success: true });
}
