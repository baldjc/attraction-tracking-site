import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import prisma from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { stripeCustomerId } = await req.json();
  if (!stripeCustomerId) {
    return NextResponse.json({ error: "stripeCustomerId required" }, { status: 400 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  try {
    const subs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 1,
      expand: ["data.items.data.price.product"],
    });

    const sub = subs.data[0] ?? null;
    let planName: string | null = null;
    let subscriptionId: string | null = null;
    let subscriptionStatus: string | null = null;
    let periodEnd: Date | null = null;

    if (sub) {
      subscriptionId = sub.id;
      subscriptionStatus = sub.status;
      periodEnd = new Date(sub.current_period_end * 1000);
      const priceItem = sub.items.data[0];
      if (priceItem?.price?.product && typeof priceItem.price.product !== "string") {
        planName = (priceItem.price.product as any).name ?? null;
      } else if (priceItem?.price?.product && typeof priceItem.price.product === "string") {
        const prod = await stripe.products.retrieve(priceItem.price.product);
        planName = prod.name;
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        stripeCustomerId,
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus,
        stripePlanName: planName,
        stripeCurrentPeriodEnd: periodEnd,
      },
    });

    return NextResponse.json({ success: true, member: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
