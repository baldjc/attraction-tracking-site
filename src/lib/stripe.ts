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
    return (invoice as any).hosted_invoice_url ?? null;
  } catch {
    return null;
  }
}
