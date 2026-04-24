/**
 * One-shot script: re-pull every active subscription from Stripe and rewrite
 * stripePriceAmount / stripeCurrency / stripePlanName / stripeLineItems so
 * members on bundled payment links land with the correct aggregated total
 * and full per-item detail.
 *
 * Usage:
 *   npx tsx scripts/stripe-backfill.ts            # dry run, prints diff per user
 *   npx tsx scripts/stripe-backfill.ts --apply    # actually persist changes
 */

import { stripe, extractSubscriptionSummary } from "../src/lib/stripe";
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const subscribers = await prisma.user.findMany({
    where: { stripeSubscriptionId: { not: null } },
    select: {
      id: true,
      email: true,
      stripeSubscriptionId: true,
      stripePriceAmount: true,
      stripePlanName: true,
      stripeCurrency: true,
    },
  });

  console.log(
    `[stripe-backfill] ${subscribers.length} subscriber(s). Mode=${APPLY ? "APPLY" : "DRY RUN"}`,
  );

  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let drift = 0;

  for (const user of subscribers) {
    try {
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId!, {
        expand: ["items.data.price"],
      });
      const summary = await extractSubscriptionSummary(sub);

      const before = {
        amount: user.stripePriceAmount,
        plan: user.stripePlanName,
        currency: user.stripeCurrency,
      };
      const after = {
        amount: summary.totalAmount,
        plan: summary.combinedPlanName,
        currency: summary.currency,
        items: summary.lineItems.length,
      };

      const changed =
        before.amount !== after.amount ||
        before.plan !== after.plan ||
        before.currency !== after.currency;

      if (changed) drift++;

      console.log(
        `[${user.email}] before=$${before.amount ?? "?"} ${before.plan ?? "?"} → after=$${after.amount ?? "?"} ${after.plan ?? "?"} (${after.items} item${after.items === 1 ? "" : "s"})${changed ? "  *DRIFT*" : ""}`,
      );

      if (APPLY) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            ...(summary.totalAmount !== null ? { stripePriceAmount: summary.totalAmount } : {}),
            ...(summary.currency !== null ? { stripeCurrency: summary.currency } : {}),
            stripePlanName: summary.combinedPlanName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stripeLineItems: summary.lineItems as any,
          },
        });
        updated++;
      } else {
        unchanged++;
      }
    } catch (err) {
      failed++;
      console.error(`[${user.email}] FAILED:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\nDone. ${APPLY ? `updated=${updated}` : `would update ${unchanged}`}, drift=${drift}, failed=${failed}, total=${subscribers.length}`,
  );
  if (!APPLY && drift > 0) {
    console.log("Run again with --apply to persist these changes.");
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
