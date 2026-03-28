/**
 * One-time Stripe backfill script.
 * Matches existing users to Stripe customers by email and syncs subscription data.
 *
 * Run with: npx tsx scripts/stripe-backfill.ts
 */

import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});

type ServiceTierValue = "foundations" | "editing_2" | "editing_4" | "mastery_2" | "mastery_4";

function productNameToTier(name: string): ServiceTierValue | null {
  const n = name.toLowerCase();
  if ((n.includes("growth") || n.includes("mastery")) && (n.includes("4") || n.includes("four"))) return "mastery_4";
  if ((n.includes("growth") || n.includes("mastery")) && (n.includes("2") || n.includes("two"))) return "mastery_2";
  if ((n.includes("production") || n.includes("editing")) && (n.includes("4") || n.includes("four"))) return "editing_4";
  if ((n.includes("production") || n.includes("editing")) && (n.includes("2") || n.includes("two"))) return "editing_2";
  return null;
}

async function main() {
  console.log("Starting Stripe backfill...\n");

  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true, stripeCustomerId: true },
  });

  console.log(`Found ${users.length} users in database.\n`);

  let matched = 0;
  let withActiveSub = 0;
  let unmatched = 0;

  for (const user of users) {
    process.stdout.write(`Checking ${user.email}... `);

    try {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      const customer = customers.data[0];

      if (!customer) {
        console.log("no Stripe customer found");
        unmatched++;
        continue;
      }

      // Get active subscriptions for this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 1,
        expand: ["data.items.data.price.product"],
      });

      const sub = subscriptions.data[0];

      if (!sub) {
        console.log(`customer ${customer.id} found, no subscription`);
        matched++;
        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customer.id },
        });
        continue;
      }

      matched++;

      // Get product name
      let planName: string | null = null;
      try {
        const priceItem = sub.items.data[0];
        if (priceItem?.price?.product && typeof priceItem.price.product !== "string") {
          planName = (priceItem.price.product as Stripe.Product).name;
        } else if (priceItem?.price?.product && typeof priceItem.price.product === "string") {
          const product = await stripe.products.retrieve(priceItem.price.product);
          planName = product.name;
        }
      } catch {
        // ignore product fetch errors
      }

      const tier = planName ? productNameToTier(planName) : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          stripeCustomerId: customer.id,
          stripeSubscriptionId: sub.id,
          subscriptionStatus: sub.status,
          stripePlanName: planName,
          stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
          ...(sub.status === "active" && tier ? { serviceTier: tier } : {}),
        },
      });

      if (sub.status === "active") withActiveSub++;

      console.log(`✓ customer=${customer.id} sub=${sub.id} status=${sub.status} plan=${planName ?? "unknown"}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.log(`ERROR: ${message}`);
      unmatched++;
    }
  }

  console.log("\n─────────────────────────────────────");
  console.log(`Total users:            ${users.length}`);
  console.log(`Matched to Stripe:      ${matched}`);
  console.log(`With active sub:        ${withActiveSub}`);
  console.log(`No Stripe customer:     ${unmatched}`);
  console.log("─────────────────────────────────────\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
