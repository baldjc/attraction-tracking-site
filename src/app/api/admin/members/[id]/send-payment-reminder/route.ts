import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdmin } from "@/lib/auth-utils";
import { sendSmsToContact } from "@/lib/ghl";
import { getPaymentRetryUrl } from "@/lib/stripe";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { id } = await params;

  const member = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      ghlContactId: true,
      stripeCustomerId: true,
      subscriptionStatus: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (!member.ghlContactId) {
    return NextResponse.json({ error: "No GHL contact linked to this member" }, { status: 400 });
  }

  const retryUrl = member.stripeCustomerId
    ? await getPaymentRetryUrl(member.stripeCustomerId)
    : null;

  const firstName = member.fullName?.split(" ")[0] ?? "there";
  const message = retryUrl
    ? `Hi ${firstName}, your Attraction by Video subscription payment is past due. Please update your payment details here: ${retryUrl}`
    : `Hi ${firstName}, your Attraction by Video subscription payment is past due. Please contact us to update your payment details and keep your access.`;

  const result = await sendSmsToContact(member.ghlContactId, message);

  if (!result.ok) {
    const isScope = result.error?.includes("not authorized for this scope");
    const userMsg = isScope
      ? 'GHL API key is missing the "Conversations" scope. Go to GHL → Settings → Private Integrations, find the Attraction by Video key, and enable the Conversations scope, then regenerate the key.'
      : (result.error ?? "Failed to send SMS via GHL");
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
