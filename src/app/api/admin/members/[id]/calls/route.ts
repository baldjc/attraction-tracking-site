import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const calls = await prisma.clientCall.findMany({
    where: { userId: id },
    orderBy: { callDate: "desc" },
  });

  return NextResponse.json({ calls });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { fathomUrl, callDate, topic, notes } = await req.json();

  if (!fathomUrl || !callDate) {
    return NextResponse.json({ error: "fathomUrl and callDate are required" }, { status: 400 });
  }

  const adminId = (session.user as any).id as string;

  const call = await prisma.clientCall.create({
    data: {
      userId: id,
      fathomUrl,
      callDate: new Date(callDate),
      topic: topic ?? null,
      notes: notes ?? null,
      createdById: adminId,
    },
  });

  return NextResponse.json({ call });
}
