import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await prisma.serviceCategory.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc" },
    include: {
      packages: {
        where: { published: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return NextResponse.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      icon: c.icon,
      accentColour: c.accentColour,
      sortOrder: c.sortOrder,
      published: c.published,
      emoji: c.emoji,
      tagline: c.tagline,
      highlighted: c.highlighted,
      includesRef: c.includesRef,
      cardExtras: c.cardExtras,
      addonLabel: c.addonLabel,
      addonPriceNote: c.addonPriceNote,
      footerNote: c.footerNote,
      jaredIncludedNote: c.jaredIncludedNote,
      packages: c.packages.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        priceNote: p.priceNote,
        badge: p.badge,
        subtitle: p.subtitle,
        features: p.features,
        highlightFeatures: p.highlightFeatures,
        stripeUrl: p.stripeUrl,
        waitlist: p.waitlist,
        sortOrder: p.sortOrder,
        published: p.published,
        videoCount: p.videoCount,
        isAddonVariant: p.isAddonVariant,
        priceAmount: p.priceAmount,
      })),
    })),
  });
}
