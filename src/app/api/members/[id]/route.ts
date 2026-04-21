import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor, isAdmin, canAccessTier } from "@/lib/auth-utils";
import { canStaffAccessMember } from "@/lib/staff-access";
import { logAdminAction } from "@/lib/admin-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const sessionUser = session?.user as { id?: string; role?: string } | undefined;
  const role = sessionUser?.role;
  const userId = sessionUser?.id;
  if (!session?.user || !isAdminOrEditor(role ?? "") || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!(await canStaffAccessMember(userId, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  // Redact financial / Stripe fields for non-admin staff (editor / Staff Admin).
  const isAdminRole = role === "admin";
  const sanitized = isAdminRole
    ? { ...member, links }
    : {
        ...member,
        links,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: null,
        stripePlanName: null,
        stripeCurrentPeriodEnd: null,
        stripePriceAmount: null,
        stripeCurrency: null,
        lastPaymentReminderSentAt: null,
      };

  return NextResponse.json({ member: sanitized });
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

  // Fetch old tier before update if a tier change is incoming
  let oldTier: string | null = null;
  if ("serviceTier" in body) {
    const existing = await prisma.user.findUnique({ where: { id }, select: { serviceTier: true } });
    oldTier = existing?.serviceTier ?? null;
  }

  const member = await prisma.user.update({
    where: { id },
    data: updates,
  });

  // Log tier change
  if ("serviceTier" in body && body.serviceTier !== oldTier) {
    await logAdminAction({
      actorId: (session.user as any).id ?? "",
      actorEmail: session.user.email ?? "",
      action: "member.tier_changed",
      targetType: "member",
      targetId: id,
      details: { from: oldTier, to: body.serviceTier },
    });
  }

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

  await logAdminAction({
    actorId: (session.user as any).id ?? "",
    actorEmail: session.user.email ?? "",
    action: "member.deleted",
    targetType: "member",
    targetId: id,
    details: { name: member.fullName, email: member.email },
  });

  return NextResponse.json({ success: true });
}
