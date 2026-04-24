import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: "2024-12-18.acacia" as any,
});

export async function getPaymentRetryUrl(stripeCustomerId: string): Promise<string | null> {
  try {
    const invoices = await stripe.invoices.list({
      customer: stripeCustomerId,
      status: "open",
      limit: 1,
    });
    const invoice = invoices.data[0];
    if (!invoice) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (invoice as any).hosted_invoice_url ?? null;
  } catch {
    return null;
  }
}

// ── Multi-line-item subscription extraction ──────────────────

export type StripeLineItem = {
  productId: string | null;
  productName: string | null;
  priceId: string;
  unitAmount: number | null; // cents
  quantity: number;
  currency: string;          // upper-case
  interval: string | null;   // "month", "year", etc.
};

export type SubscriptionSummary = {
  totalAmount: number | null;      // cents, sum of (unit_amount × qty) across all items
  currency: string | null;         // upper-case, taken from first priced item
  primaryPlanName: string | null;  // name of the item that maps to a ServiceTier (or first item)
  combinedPlanName: string | null; // "Primary + N add-on(s)" for display
  lineItems: StripeLineItem[];
  periodEnd: Date | null;
};

/**
 * Returns true when a Stripe product name represents one of our core service
 * tiers. Used to pick the "primary" line item on a bundled subscription so
 * tier mapping isn't thrown off when the add-on happens to be item 0.
 */
export function isTierProduct(name: string | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return (
    n.includes("foundations") ||
    n.includes("production") ||
    n.includes("editing") ||
    n.includes("growth") ||
    n.includes("mastery") ||
    n.includes("done with you") ||
    n.includes("done-with-you")
  );
}

/**
 * Single source of truth for reading a Stripe subscription. Aggregates every
 * line item (sum of unit_amount × quantity), captures per-item detail, and
 * picks the "primary" plan (the one that maps to a ServiceTier) so the rest
 * of the system still works for bundled payment links.
 */
export async function extractSubscriptionSummary(
  sub: Stripe.Subscription,
): Promise<SubscriptionSummary> {
  const items = sub.items?.data ?? [];
  const lineItems: StripeLineItem[] = [];
  let total = 0;
  let anyPriced = false;
  let currency: string | null = null;

  // Cache product lookups in case the same product appears twice.
  const productCache = new Map<string, string | null>();

  for (const item of items) {
    const price = item.price;
    if (!price) continue;

    const qty = item.quantity ?? 1;
    const unit = price.unit_amount ?? null;

    if (unit !== null) {
      total += unit * qty;
      anyPriced = true;
    }
    if (!currency && price.currency) currency = price.currency.toUpperCase();

    const productId =
      typeof price.product === "string"
        ? price.product
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : (price.product as any)?.id ?? null;

    let productName: string | null = null;
    if (productId) {
      if (productCache.has(productId)) {
        productName = productCache.get(productId) ?? null;
      } else {
        try {
          const prod = await stripe.products.retrieve(productId);
          productName = prod.name;
        } catch {
          // best-effort
        }
        productCache.set(productId, productName);
      }
    }

    lineItems.push({
      productId,
      productName,
      priceId: price.id,
      unitAmount: unit,
      quantity: qty,
      currency: price.currency ? price.currency.toUpperCase() : "CAD",
      interval: price.recurring?.interval ?? null,
    });
  }

  // Pick the item whose product name maps to a ServiceTier; fall back to first item.
  const primary =
    lineItems.find((li) => isTierProduct(li.productName)) ?? lineItems[0] ?? null;
  const primaryPlanName = primary?.productName ?? null;

  // Build a readable combined label for the single stripePlanName field.
  let combinedPlanName: string | null = primaryPlanName;
  const addOnCount = lineItems.filter((li) => li !== primary && li.productName).length;
  if (primaryPlanName && addOnCount > 0) {
    combinedPlanName = `${primaryPlanName} + ${addOnCount} add-on${addOnCount === 1 ? "" : "s"}`;
  }

  // current_period_end was removed from the top-level Subscription object in
  // Stripe API 2024-09-30+. It now lives on each subscription item's period.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subAny = sub as any;
  const rawPeriodEnd: number | null =
    subAny.current_period_end ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (items[0] as any)?.period?.end ??
    null;

  return {
    totalAmount: anyPriced ? total : null,
    currency,
    primaryPlanName,
    combinedPlanName,
    lineItems,
    periodEnd: rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : null,
  };
}
