import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requirePrimaryUser,
  generateInviteToken,
  inviteExpiry,
  logTeamActivity,
  getAppBaseUrl,
} from "@/lib/team";
import { sendTeamInviteEmail } from "@/lib/email";

// Lists the primary's team grants, pending invites, and recent activity.
// Owner-only: a team member operating the account (or an admin impersonating)
// cannot manage the team.
export async function GET() {
  const user = await requirePrimaryUser();
  if (!user) {
    return NextResponse.json({ error: "Team management is only available on your own account." }, { status: 403 });
  }

  const [members, invites, activity] = await Promise.all([
    prisma.teamMember.findMany({
      where: { primaryUserId: user.id, status: "active" },
      orderBy: { acceptedAt: "desc" },
      select: { id: true, email: true, name: true, status: true, acceptedAt: true },
    }),
    prisma.teamInvite.findMany({
      where: { primaryUserId: user.id, status: "pending" },
      orderBy: { sentAt: "desc" },
      select: { id: true, email: true, sentAt: true, expiresAt: true },
    }),
    prisma.teamActivityLog.findMany({
      where: { primaryUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, actorType: true, actorName: true, action: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({ members, invites, activity });
}

// Sends (or re-sends) a team invite. Owner-only.
export async function POST(req: NextRequest) {
  const user = await requirePrimaryUser();
  if (!user) {
    return NextResponse.json({ error: "Only the account owner can invite team members." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (rawEmail === user.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "You can't invite yourself." }, { status: 400 });
  }

  // Already an active team member?
  const existingMember = await prisma.teamMember.findFirst({
    where: { primaryUserId: user.id, email: rawEmail, status: "active" },
    select: { id: true },
  });
  if (existingMember) {
    return NextResponse.json({ error: "That person already has access to your account." }, { status: 409 });
  }

  const { token, tokenHash } = generateInviteToken();
  const expiresAt = inviteExpiry();

  // Re-use a pending invite row for the same email (resend) instead of stacking
  // duplicates, so the latest link is always the valid one.
  const existingInvite = await prisma.teamInvite.findFirst({
    where: { primaryUserId: user.id, email: rawEmail, status: "pending" },
    select: { id: true },
  });

  if (existingInvite) {
    await prisma.teamInvite.update({
      where: { id: existingInvite.id },
      data: { tokenHash, expiresAt, sentAt: new Date() },
    });
  } else {
    await prisma.teamInvite.create({
      data: { primaryUserId: user.id, email: rawEmail, tokenHash, expiresAt },
    });
  }

  const primary = await prisma.user.findUnique({
    where: { id: user.id },
    select: { fullName: true },
  });
  const primaryName = primary?.fullName?.trim() || user.email;

  const inviteUrl = `${getAppBaseUrl()}/team/accept?token=${token}`;
  await sendTeamInviteEmail({ to: rawEmail, inviteUrl, primaryName, expiresAt });

  await logTeamActivity({
    primaryUserId: user.id,
    actorType: "primary",
    actorUserId: user.id,
    actorName: primaryName,
    action: `Invited ${rawEmail}`,
    metadata: { email: rawEmail },
  });

  return NextResponse.json({ ok: true });
}
