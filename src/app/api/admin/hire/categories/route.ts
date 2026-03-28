import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function adminOnly(role: string | undefined) {
  return !role || role !== "admin";
}

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      packages: { orderBy: { sortOrder: "asc" } },
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

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, slug, description, icon, accentColour, published,
          emoji, tagline, highlighted, includesRef, cardExtras, addonLabel,
          addonPriceNote, footerNote, jaredIncludedNote } = body;

  const max = await prisma.serviceCategory.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (max._max.sortOrder ?? 0) + 1;

  const category = await prisma.serviceCategory.create({
    data: {
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      description: description ?? null,
      icon: icon ?? "PuzzlePieceIcon",
      accentColour: accentColour ?? "blue",
      sortOrder,
      published: published ?? true,
      emoji: emoji ?? null,
      tagline: tagline ?? null,
      highlighted: highlighted ?? false,
      includesRef: includesRef ?? null,
      cardExtras: cardExtras ?? undefined,
      addonLabel: addonLabel ?? null,
      addonPriceNote: addonPriceNote ?? null,
      footerNote: footerNote ?? null,
      jaredIncludedNote: jaredIncludedNote ?? null,
    },
  });

  return NextResponse.json({ category });
}
