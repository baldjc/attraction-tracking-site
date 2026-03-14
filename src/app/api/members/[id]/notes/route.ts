import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { notes } = await req.json();

  const member = await prisma.user.update({
    where: { id },
    data: {
      coachingNotes: notes,
      coachingNotesUpdatedAt: new Date(),
    },
    select: {
      coachingNotes: true,
      coachingNotesUpdatedAt: true,
    },
  });

  return NextResponse.json({ member });
}
