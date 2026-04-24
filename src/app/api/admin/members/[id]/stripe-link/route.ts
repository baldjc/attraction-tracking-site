import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe, extractSubscriptionSummary } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import { canStaffAccessMember } from "@/lib/staff-access";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await canStaffAccessMember((session.user as any).id, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { stripeCustomerId } = await req.json();
  if (!stripeCustomerId) {
    return NextResponse.json({ error: "stripeCustomerId required" }, { status: 400 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  try {
    console.log(`[stripe-link] Fetching subscriptions for customer ${stripeCustomerId}`);

    const subs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 1,
    });

    console.log(`[stripe-link] Found ${subs.data.length} subscription(s)`);

    const sub = subs.data[0] ?? null;
    const summary = sub ? await extractSubscriptionSummary(sub) : null;
    if (sub) {
      console.log(
        `[stripe-link] Sub ${sub.id} status=${sub.status} items=${summary?.lineItems.length ?? 0} plan=${summary?.combinedPlanName ?? "?"}`,
      );
    } else {
      console.log(`[stripe-link] No subscriptions found for customer ${stripeCustomerId}`);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        stripeCustomerId,
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

    console.log(`[stripe-link] Member ${id} updated successfully`);
    return NextResponse.json({ success: true, member: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[stripe-link] Error:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
