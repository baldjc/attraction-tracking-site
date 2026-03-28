import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
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
        sortOrder: p.sortOrder,
      })),
    })),
  });
}
