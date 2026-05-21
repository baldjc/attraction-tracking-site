import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  emptyMarketConfig,
  toShape,
  type MarketConfigShape,
} from "@/lib/market-config";
import { requireMarketAccess } from "@/lib/market-config-server";

export async function GET() {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;

  const row = await prisma.marketConfig.findUnique({
    where: { userId: access.user.id },
  });

  return Response.json({
    config: row ? toShape(row) : null,
    defaults: emptyMarketConfig(),
  });
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function PUT(req: NextRequest) {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;

  let body: Partial<MarketConfigShape>;
  try {
    body = (await req.json()) as Partial<MarketConfigShape>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isNonEmptyString(body.marketName)) {
    return Response.json(
      { error: "Market name is required." },
      { status: 400 },
    );
  }
  if (!isNonEmptyString(body.mlsSource)) {
    return Response.json(
      { error: "MLS source is required." },
      { status: 400 },
    );
  }

  const data = {
    marketName: body.marketName.trim(),
    mlsSource: body.mlsSource.trim(),
    priceTiers: (body.priceTiers ?? null) as object | null,
    moiThresholds: (body.moiThresholds ?? null) as object | null,
    highEndException: (body.highEndException ?? null) as object | null,
    neighbourhoodVocab: (body.neighbourhoodVocab ?? null) as object | null,
    keywordKit: (body.keywordKit ?? null) as object | null,
    primaryAvatar: (body.primaryAvatar ?? null) as object | null,
    subPersonas: (body.subPersonas ?? null) as object | null,
  };

  const saved = await prisma.marketConfig.upsert({
    where: { userId: access.user.id },
    update: data,
    create: { userId: access.user.id, ...data },
  });

  return Response.json({ config: toShape(saved) });
}
