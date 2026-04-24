import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe, extractSubscriptionSummary } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import { canStaffAccessMember } from "@/lib/staff-access";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const member = await prisma.user.findUnique({
    where: { id },
    select: { stripeCustomerId: true },
  });

  if (!member?.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer linked to this member" }, { status: 400 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  try {
    const subs = await stripe.subscriptions.list({
      customer: member.stripeCustomerId,
      status: "all",
      limit: 1,
    });

    const sub = subs.data[0] ?? null;
    const summary = sub ? await extractSubscriptionSummary(sub) : null;

    const updated = await prisma.user.update({
      where: { id },
      data: {
        stripeSubscriptionId: sub?.id ?? null,
        subscriptionStatus: sub?.status ?? null,
        stripePlanName: summary?.combinedPlanName ?? null,
        stripeCurrentPeriodEnd: summary?.periodEnd ?? null,
        stripePriceAmount: summary?.totalAmount ?? null,
        stripeCurrency: summary?.currency ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stripeLineItems: (summary?.lineItems ?? null) as any,
      },
    });

    return NextResponse.json({
      success: true,
      subscriptionStatus: updated.subscriptionStatus,
      stripePlanName: updated.stripePlanName,
      lineItems: summary?.lineItems ?? [],
      totalAmount: summary?.totalAmount ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
