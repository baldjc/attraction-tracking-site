import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/client";
import { staffMemberIdFilter } from "@/lib/staff-access";
import { isAdminOrEditor } from "@/lib/auth-utils";
import { normalizeEmail } from "@/lib/normalize-email";
import { provisionMember } from "@/lib/provision-member";
import { sendMemberInviteEmail } from "@/lib/email";
import type { ServiceTier } from "@/generated/prisma/client";

export async function GET() {
  const session = await auth();
  const sessionUser = session?.user as { id?: string; role?: string } | undefined;
  const role = sessionUser?.role;
  const userId = sessionUser?.id;
  if (!session?.user || (role !== "admin" && role !== "editor") || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowedFilter = await staffMemberIdFilter(userId);

  const where = allowedFilter
    ? { id: allowedFilter }
    : { role: { notIn: [UserRole.admin, UserRole.editor] } };

  const members = await prisma.user.findMany({
    where,
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      email: true,
      serviceTier: true,
      youtubeChannelName: true,
      youtubeChannelUrl: true,
    },
  });

  return NextResponse.json({ members });
}

const VALID_TIERS: ServiceTier[] = [
  "foundations",
  "production",
  "growth",
  "done_with_you",
];

/**
 * Manual member create (admin/staff only). Mirrors the auth check used by the
 * other /api/admin/* routes. Keys on a normalized email so a later GHL/Stripe
 * sync on the same address resolves to this member instead of duplicating, and
 * reuses the shared `provisionMember` path so a manual add is byte-for-byte the
 * same shape as a synced member.
 */
export async function POST(request: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdminOrEditor(role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    email?: string;
    fullName?: string;
    youtubeHandle?: string;
    serviceTier?: string;
    sendInvite?: boolean;
    isTestAccount?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email ?? "");
  const fullName = (body.fullName ?? "").trim();
  const youtubeHandle = (body.youtubeHandle ?? "").trim().replace(/^@+/, "") || null;
  const serviceTier = (body.serviceTier ?? "foundations") as ServiceTier;
  const sendInvite = body.sendInvite !== false; // default ON
  const isTestAccount = body.isTestAccount === true; // default OFF

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  if (!VALID_TIERS.includes(serviceTier)) {
    return NextResponse.json({ error: "Invalid tier." }, { status: 400 });
  }

  // Upsert-by-email: never create a second member for the same address.
  // Case-insensitive so we also catch legacy rows stored in mixed case.
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, fullName: true, email: true, role: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: "A member with this email already exists.",
        existing: { id: existing.id, fullName: existing.fullName, email: existing.email },
      },
      { status: 409 },
    );
  }

  const member = await provisionMember({
    email,
    fullName,
    youtubeHandle,
    serviceTier,
    isTestAccount,
    invitedAt: new Date(),
  });

  let inviteSent = false;
  if (sendInvite) {
    try {
      const res = await sendMemberInviteEmail({ to: member.email, name: member.fullName });
      inviteSent = res.ok;
    } catch (e) {
      console.error("[admin/members] invite email threw:", e);
      inviteSent = false;
    }
  }

  return NextResponse.json(
    {
      member: { id: member.id, fullName: member.fullName, email: member.email },
      inviteSent,
    },
    { status: 201 },
  );
}
