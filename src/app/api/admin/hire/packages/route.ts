import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function adminOnly(role: string | undefined) {
  return !role || role !== "admin";
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { categoryId, name, price, priceNote, badge, subtitle, features, highlightFeatures, stripeUrl, waitlist,
          videoCount, isAddonVariant, priceAmount } = body;

  const max = await prisma.servicePackage.aggregate({
    where: { categoryId },
    _max: { sortOrder: true },
  });
  const sortOrder = (max._max.sortOrder ?? 0) + 1;

  const pkg = await prisma.servicePackage.create({
    data: {
      categoryId,
      name,
      price,
      priceNote: priceNote ?? null,
      badge: badge ?? null,
      subtitle: subtitle ?? null,
      features: features ?? [],
      highlightFeatures: highlightFeatures && highlightFeatures.length > 0 ? highlightFeatures : undefined,
      stripeUrl: stripeUrl ?? null,
      waitlist: waitlist ?? false,
      sortOrder,
      videoCount: videoCount ?? null,
      isAddonVariant: isAddonVariant ?? false,
      priceAmount: priceAmount ?? null,
    },
  });

  return NextResponse.json({ package: pkg });
}
