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

  const searches = await prisma.seoSearch.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { keywords: { orderBy: { volume: "desc" }, take: 50 } },
  });
  return NextResponse.json(searches);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!await adminOnly()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { seedKeyword, keywords: manualKeywords } = await req.json();
  if (!seedKeyword?.trim()) return NextResponse.json({ error: "seedKeyword required" }, { status: 400 });

  const search = await prisma.seoSearch.create({
    data: {
      clientId,
      source: "manual",
      seedKeyword: seedKeyword.trim(),
      rawResponse: { manualKeywords: manualKeywords ?? [] },
    },
  });

  const keywordsToCreate = (manualKeywords ?? []).filter((k: any) => k.keyword?.trim());
  if (keywordsToCreate.length > 0) {
    await prisma.seoKeyword.createMany({
      data: keywordsToCreate.map((k: any) => ({
        searchId: search.id,
        keyword: k.keyword.trim(),
        volume: k.volume ?? null,
        difficulty: k.difficulty ?? null,
        intent: k.intent ?? null,
        isQuestion: k.keyword.trim().match(/^(what|how|why|when|where|who|is|are|can|should|will|does)/i) !== null,
      })),
    });
  }

  const full = await prisma.seoSearch.findUnique({
    where: { id: search.id },
    include: { keywords: { orderBy: { volume: "desc" } } },
  });
  return NextResponse.json(full, { status: 201 });
}
