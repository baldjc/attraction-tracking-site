import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id;
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
  const userId = (session.user as any).id;
  const { reviewId } = await params;

  const review = await prisma.scriptReview.findUnique({ where: { id: reviewId } });
  if (!review || review.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.scriptReview.delete({ where: { id: reviewId } });
  return NextResponse.json({ deleted: true });
}
