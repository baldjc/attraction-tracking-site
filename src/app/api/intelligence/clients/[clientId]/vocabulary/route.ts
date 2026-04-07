import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function adminOnly() {
  const session = await auth();
  return (session?.user as any)?.role === "admin" ? session : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;

  const vocab = await prisma.vocabularyProfile.findMany({
    where: { clientId },
    orderBy: [{ category: "asc" }, { term: "asc" }],
  });
  return NextResponse.json(vocab);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;
  const { term, definition, category, exampleUsage } = await req.json();
  if (!term?.trim()) return NextResponse.json({ error: "term required" }, { status: 400 });

  const entry = await prisma.vocabularyProfile.create({
    data: { clientId, term: term.trim(), definition: definition ?? null, category: category ?? null, exampleUsage: exampleUsage ?? null },
  });
  return NextResponse.json(entry, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.vocabularyProfile.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
