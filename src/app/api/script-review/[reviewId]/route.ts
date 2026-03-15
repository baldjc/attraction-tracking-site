import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function resolveUserId(session: any): Promise<string | null> {
  const sessionId = (session.user as any).id as string | undefined;
  const sessionEmail = session.user.email as string | undefined;
  let dbUser = sessionId
    ? await prisma.user.findUnique({ where: { id: sessionId }, select: { id: true } })
    : null;
  if (!dbUser && sessionEmail) {
    dbUser = await prisma.user.findUnique({ where: { email: sessionEmail }, select: { id: true } });
  }
  return dbUser?.id ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 400 });
  const { reviewId } = await params;

  const review = await prisma.scriptReview.findUnique({
    where: { id: reviewId },
  });

  if (!review) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (review.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(review);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = await resolveUserId(session);
  if (!userId) return NextResponse.json({ error: "User not found" }, { status: 400 });
  const { reviewId } = await params;

  const review = await prisma.scriptReview.findUnique({ where: { id: reviewId } });
  if (!review || review.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.scriptReview.delete({ where: { id: reviewId } });
  return NextResponse.json({ deleted: true });
}
