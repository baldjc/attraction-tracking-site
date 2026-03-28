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
  const { name, slug, description, icon, accentColour, sortOrder, published,
          emoji, tagline, highlighted, includesRef, cardExtras, addonLabel,
          addonPriceNote, footerNote, jaredIncludedNote } = body;

  const category = await prisma.serviceCategory.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(slug !== undefined && { slug }),
      ...(description !== undefined && { description }),
      ...(icon !== undefined && { icon }),
      ...(accentColour !== undefined && { accentColour }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(published !== undefined && { published }),
      ...(emoji !== undefined && { emoji }),
      ...(tagline !== undefined && { tagline }),
      ...(highlighted !== undefined && { highlighted }),
      ...(includesRef !== undefined && { includesRef }),
      ...(cardExtras !== undefined && { cardExtras }),
      ...(addonLabel !== undefined && { addonLabel }),
      ...(addonPriceNote !== undefined && { addonPriceNote }),
      ...(footerNote !== undefined && { footerNote }),
      ...(jaredIncludedNote !== undefined && { jaredIncludedNote }),
    },
  });

  return NextResponse.json({ category });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const count = await prisma.servicePackage.count({ where: { categoryId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `Delete all ${count} package(s) in this category first.` },
      { status: 400 }
    );
  }

  await prisma.serviceCategory.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
