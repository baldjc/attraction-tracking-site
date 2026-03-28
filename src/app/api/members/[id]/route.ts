import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor, isAdmin, canAccessTier } from "@/lib/auth-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const member = await prisma.user.findUnique({
    where: { id },
    include: {
      audits: {
        orderBy: { createdAt: "desc" },
      },
      campaigns: {
        include: {
          links: {
            include: {
              clicks: {
                include: { lead: true },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Editor can only view editing/mastery tier members
  if (!canAccessTier(role, member.serviceTier)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Flatten tracking links from all campaigns so the frontend can use member.links directly
  const links = member.campaigns.flatMap((c) => c.links);

  return NextResponse.json({ member: { ...member, links } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  // Only full admin can edit members
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "fullName",
    "email",
    "phone",
    "youtubeChannelUrl",
    "youtubeHandle",
    "youtubeChannelName",
    "serviceTier",
    "ghlContactId",
    "avatarProfile",
    "avatarName",
    "avatarSummary",
    "contentThemes",
    "videoThemes",
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const member = await prisma.user.findUnique({ where: { id } });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cascades to all related records (audits, links, scripts, etc.)
  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
