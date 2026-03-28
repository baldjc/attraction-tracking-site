import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

// Disable Next.js body parsing — Stripe requires the raw body for signature verification
export const dynamic = "force-dynamic";

// ── Product name → ServiceTier mapping ───────────────────────

type ServiceTierValue = "foundations" | "editing_2" | "editing_4" | "mastery_2" | "mastery_4";

function productNameToTier(name: string): ServiceTierValue | null {
  const n = name.toLowerCase();
  if ((n.includes("growth") || n.includes("mastery")) && (n.includes("4") || n.includes("four"))) return "mastery_4";
  if ((n.includes("growth") || n.includes("mastery")) && (n.includes("2") || n.includes("two"))) return "mastery_2";
  if ((n.includes("production") || n.includes("editing")) && (n.includes("4") || n.includes("four"))) return "editing_4";
  if ((n.includes("production") || n.includes("editing")) && (n.includes("2") || n.includes("two"))) return "editing_2";
  return null;
}

// ── Find user by Stripe customer ID or email ─────────────────

async function findUser(customerId: string) {
  let user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
  if (!user) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted && customer.email) {
        user = await prisma.user.findUnique({ where: { email: customer.email } });
      }
    } catch {
      // customer not retrievable
    }
  }
  return user;
}

// ── POST handler ──────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Signature verification failed:", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  console.log(`[stripe-webhook] Event: ${event.type}`);

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;
    const status = subscription.status;
    const periodEnd = new Date(subscription.current_period_end * 1000);

    // Get product name and price amount
    let planName: string | null = null;
    let priceAmount: number | null = null;
    try {
      const priceItem = subscription.items.data[0];
      if (priceItem?.price) {
        priceAmount = priceItem.price.unit_amount ?? null;
        if (priceItem.price.product) {
          const product = await stripe.products.retrieve(priceItem.price.product as string);
          planName = product.name;
        }
      }
    } catch {
      // product not retrievable
    }

    const user = await findUser(customerId);
    if (user) {
      const tier = planName ? productNameToTier(planName) : null;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: status,
          stripePlanName: planName,
          stripeCurrentPeriodEnd: periodEnd,
          ...(priceAmount !== null ? { stripePriceAmount: priceAmount } : {}),
          ...(status === "active" && tier ? { serviceTier: tier } : {}),
        },
      });
      console.log(`[stripe-webhook] Updated user ${user.email}: status=${status}, plan=${planName}`);
    } else {
      console.warn(`[stripe-webhook] No user found for Stripe customer ${customerId}`);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const user = await findUser(customerId);
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "cancelled",
          stripeSubscriptionId: null,
          serviceTier: "foundations",
        },
      });
      console.log(`[stripe-webhook] Cancelled subscription for user ${user.email}`);
    } else {
      console.warn(`[stripe-webhook] No user found for cancelled subscription, customer ${customerId}`);
    }
  }

  return NextResponse.json({ received: true });
}
