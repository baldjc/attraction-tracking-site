import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createVideoFolder } from "@/lib/google-drive";

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id, planId } = await params;

  const plan = await prisma.contentPlan.findFirst({ where: { id: planId, userId: id } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (plan.driveFolderLink) {
    return NextResponse.json({ driveFolderLink: plan.driveFolderLink });
  }

  const member = await prisma.user.findUnique({ where: { id }, select: { name: true, email: true } });
  const memberName = member?.name || member?.email || id;

  let driveFolderLink: string;
  try {
    driveFolderLink = await createVideoFolder(memberName, plan.title);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Drive error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const updated = await prisma.contentPlan.update({
    where: { id: planId },
    data: { driveFolderLink },
  });

  return NextResponse.json({ driveFolderLink: updated.driveFolderLink });
}
