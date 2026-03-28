import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { isAdminOrEditor } from "@/lib/auth-utils";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscribers = await prisma.user.findMany({
    where: {
      stripeSubscriptionId: { not: null },
      stripePriceAmount: null,
    },
    select: { id: true, email: true, stripeSubscriptionId: true },
  });

  let updated = 0;
  let failed = 0;

  for (const user of subscribers) {
    try {
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId!, {
        expand: ["items.data.price"],
      });
      const priceAmount = sub.items.data[0]?.price?.unit_amount ?? null;
      if (priceAmount !== null) {
        await prisma.user.update({
          where: { id: user.id },
          data: { stripePriceAmount: priceAmount },
        });
        updated++;
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ updated, failed, total: subscribers.length });
}
