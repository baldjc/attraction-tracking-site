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
    console.log(`[stripe-link] Fetching subscriptions for customer ${stripeCustomerId}`);

    const subs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 1,
    });

    console.log(`[stripe-link] Found ${subs.data.length} subscription(s)`);

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

      console.log(`[stripe-link] Sub ${sub.id} status=${sub.status} period_end=${subAny.current_period_end}`);

      const priceItem = sub.items.data[0];
      const productId = typeof priceItem?.price?.product === "string"
        ? priceItem.price.product
        : (priceItem?.price?.product as any)?.id ?? null;

      console.log(`[stripe-link] Product ID: ${productId}`);

      if (productId) {
        try {
          const prod = await stripe.products.retrieve(productId);
          planName = prod.name;
          console.log(`[stripe-link] Plan name: ${planName}`);
        } catch (prodErr) {
          console.error(`[stripe-link] Failed to retrieve product ${productId}:`, prodErr);
        }
      }
    } else {
      console.log(`[stripe-link] No subscriptions found for customer ${stripeCustomerId}`);
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

    console.log(`[stripe-link] Member ${id} updated successfully`);
    return NextResponse.json({ success: true, member: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[stripe-link] Error:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
