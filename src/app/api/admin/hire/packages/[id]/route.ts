import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function adminOnly(role: string | undefined) {
  return !role || role !== "admin";
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { categoryId, name, price, priceNote, badge, subtitle, features, highlightFeatures, stripeUrl, sortOrder, published } = body;

  const pkg = await prisma.servicePackage.update({
    where: { id },
    data: {
      ...(categoryId !== undefined && { categoryId }),
      ...(name !== undefined && { name }),
      ...(price !== undefined && { price }),
      ...(priceNote !== undefined && { priceNote }),
      ...(badge !== undefined && { badge }),
      ...(subtitle !== undefined && { subtitle }),
      ...(features !== undefined && { features }),
      ...(highlightFeatures !== undefined && { highlightFeatures: highlightFeatures && highlightFeatures.length > 0 ? highlightFeatures : null }),
      ...(stripeUrl !== undefined && { stripeUrl }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(published !== undefined && { published }),
    },
  });

  return NextResponse.json({ package: pkg });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.servicePackage.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
