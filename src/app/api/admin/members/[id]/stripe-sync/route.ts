import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
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
    let planName: string | null = null;
    let subscriptionId: string | null = null;
    let subscriptionStatus: string | null = null;
    let periodEnd: Date | null = null;

    if (sub) {
      subscriptionId = sub.id;
      subscriptionStatus = sub.status;
      const subAny = sub as any;
      periodEnd = subAny.current_period_end ? new Date(subAny.current_period_end * 1000) : null;

      const priceItem = sub.items.data[0];
      const productId =
        typeof priceItem?.price?.product === "string"
          ? priceItem.price.product
          : (priceItem?.price?.product as any)?.id ?? null;

      if (productId) {
        try {
          const prod = await stripe.products.retrieve(productId);
          planName = prod.name;
        } catch {
          // best-effort
        }
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus,
        stripePlanName: planName,
        stripeCurrentPeriodEnd: periodEnd,
      },
    });

    return NextResponse.json({
      success: true,
      subscriptionStatus: updated.subscriptionStatus,
      stripePlanName: updated.stripePlanName,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
