import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getPaymentRetryUrl } from "@/lib/stripe";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const member = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true, subscriptionStatus: true },
  });

  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (member.subscriptionStatus !== "past_due") {
    return NextResponse.json({ pastDue: false, url: null });
  }

  const url = member.stripeCustomerId
    ? await getPaymentRetryUrl(member.stripeCustomerId)
    : null;

  return NextResponse.json({ pastDue: true, url });
}
