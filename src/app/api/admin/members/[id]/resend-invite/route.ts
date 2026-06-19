import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor } from "@/lib/auth-utils";
import { sendMemberInviteEmail } from "@/lib/email";

/**
 * Re-send the magic-link / sign-in invite email for an existing member.
 * Admin/staff only. Useful for manual adds created silently (invite OFF) and
 * for members who lost their link.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdminOrEditor(role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const member = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, fullName: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  try {
    const res = await sendMemberInviteEmail({ to: member.email, name: member.fullName });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to send invite email." }, { status: 502 });
    }
  } catch (e) {
    console.error("[admin/members/resend-invite] threw:", e);
    return NextResponse.json({ error: "Failed to send invite email." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentTo: member.email });
}
