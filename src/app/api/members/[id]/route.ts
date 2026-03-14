import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const member = await prisma.user.findUnique({
    where: { id },
    include: {
      audits: {
        orderBy: { createdAt: "desc" },
      },
      links: {
        include: {
          clicks: {
            include: { conversion: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ member });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "fullName",
    "email",
    "youtubeChannelUrl",
    "youtubeHandle",
    "serviceTier",
    "ghlContactId",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const member = await prisma.user.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json({ member });
}
