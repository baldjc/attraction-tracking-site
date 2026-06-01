import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, extractSubscriptionSummary } from "@/lib/stripe";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

// Disable Next.js body parsing — Stripe requires the raw body for signature verification
export const dynamic = "force-dynamic";

// ── Product name → canonical ServiceTier + edited-videos/month ───────────────
//
// The canonical enum is just the 4 tiers; the "2 vs 4" volume now lives in the
// separate `editedVideosPerMonth` column. We parse both out of the Stripe
// product name. DWY is intentionally not auto-assigned here (set by admin).

import type { ServiceTier } from "@/lib/service-tier";

function productNameToTier(
  name: string,
): { tier: ServiceTier; videosPerMonth: number | null } | null {
  const n = name.toLowerCase();
  const count = n.includes("4") || n.includes("four")
    ? 4
    : n.includes("2") || n.includes("two")
      ? 2
      : null;
  if (n.includes("growth") || n.includes("mastery")) {
    return { tier: "growth", videosPerMonth: count };
  }
  if (n.includes("production") || n.includes("editing")) {
    return { tier: "production", videosPerMonth: count };
  }
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

    let summary;
    try {
      summary = await extractSubscriptionSummary(subscription);
    } catch (err) {
      console.error("[stripe-webhook] Failed to extract subscription summary:", err);
      summary = null;
    }

    const user = await findUser(customerId);
    if (user) {
      const mapped = summary?.primaryPlanName ? productNameToTier(summary.primaryPlanName) : null;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: status,
          ...(summary
            ? {
                stripePlanName: summary.combinedPlanName,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                stripeLineItems: summary.lineItems as any,
                ...(summary.periodEnd ? { stripeCurrentPeriodEnd: summary.periodEnd } : {}),
                ...(summary.totalAmount !== null ? { stripePriceAmount: summary.totalAmount } : {}),
                ...(summary.currency !== null ? { stripeCurrency: summary.currency } : {}),
              }
            : {}),
          ...(status === "active" && mapped
            ? {
                serviceTier: mapped.tier,
                editedVideosPerMonth: mapped.videosPerMonth,
              }
            : {}),
        },
      });
      console.log(
        `[stripe-webhook] Updated user ${user.email}: status=${status}, plan=${summary?.combinedPlanName ?? "?"}, items=${summary?.lineItems.length ?? 0}, total=${summary?.totalAmount ?? "?"}`,
      );
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
          editedVideosPerMonth: null,
        },
      });
      console.log(`[stripe-webhook] Cancelled subscription for user ${user.email}`);
    } else {
      console.warn(`[stripe-webhook] No user found for cancelled subscription, customer ${customerId}`);
    }
  }

  return NextResponse.json({ received: true });
}
