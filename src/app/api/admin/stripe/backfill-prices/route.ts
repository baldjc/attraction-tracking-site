import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { stripe, extractSubscriptionSummary } from "@/lib/stripe";
import { isAdminOrEditor } from "@/lib/auth-utils";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscribers = await prisma.user.findMany({
    where: {
      stripeSubscriptionId: { not: null },
      OR: [
        { stripePriceAmount: null },
        { stripeCurrency: null },
        { stripeLineItems: { equals: Prisma.DbNull } },
      ],
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
      const summary = await extractSubscriptionSummary(sub);
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
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ updated, failed, total: subscribers.length });
}
