import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export async function GET(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ customers: [] });

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  try {
    // Search by email first, then by name
    const [byEmail, byName] = await Promise.all([
      stripe.customers.list({ email: q, limit: 5 }),
      stripe.customers.search({ query: `name~"${q}"`, limit: 5 }),
    ]);

    // Deduplicate
    const seen = new Set<string>();
    const all = [...byEmail.data, ...byName.data].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    // For each customer, find their latest subscription
    const customers = await Promise.all(
      all.map(async (c) => {
        let subscription: { planName: string | null; status: string } | null = null;
        try {
          const subs = await stripe.subscriptions.list({
            customer: c.id,
            status: "all",
            limit: 1,
            expand: ["data.items.data.price.product"],
          });
          const sub = subs.data[0];
          if (sub) {
            let planName: string | null = null;
            const priceItem = sub.items.data[0];
            if (priceItem?.price?.product && typeof priceItem.price.product !== "string") {
              planName = (priceItem.price.product as any).name ?? null;
            } else if (priceItem?.price?.product && typeof priceItem.price.product === "string") {
              const prod = await stripe.products.retrieve(priceItem.price.product);
              planName = prod.name;
            }
            subscription = { planName, status: sub.status };
          }
        } catch { /* ignore */ }

        return {
          id: c.id,
          name: c.name ?? null,
          email: c.email ?? null,
          subscription,
        };
      })
    );

    return NextResponse.json({ customers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
