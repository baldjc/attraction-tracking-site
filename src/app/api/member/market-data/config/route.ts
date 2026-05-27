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

/**
 * PATCH — partial update for fields the Onboarding Wizard sets one step at a
 * time (primaryAvatar, subPersonas, team credibility numbers). Unlike PUT,
 * this does NOT require marketName / mlsSource — the wizard's market data
 * step is handled separately via the CSV upload pipeline which writes those
 * fields. Any field not present in the body is left untouched.
 */
export async function PATCH(req: NextRequest) {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if ("primaryAvatar" in body) data.primaryAvatar = body.primaryAvatar ?? null;
  if ("subPersonas" in body) data.subPersonas = body.subPersonas ?? null;
  if ("keywordKit" in body) data.keywordKit = body.keywordKit ?? null;
  if ("neighbourhoodVocab" in body) data.neighbourhoodVocab = body.neighbourhoodVocab ?? null;
  if ("priceTiers" in body) data.priceTiers = body.priceTiers ?? null;
  if ("moiThresholds" in body) data.moiThresholds = body.moiThresholds ?? null;
  if ("highEndException" in body) data.highEndException = body.highEndException ?? null;
  if ("teamYearsInBusiness" in body)
    data.teamYearsInBusiness = coerceInt(body.teamYearsInBusiness);
  if ("teamFamiliesHelped" in body)
    data.teamFamiliesHelped = coerceInt(body.teamFamiliesHelped);
  if ("teamAnnualTransactionCount" in body)
    data.teamAnnualTransactionCount = coerceInt(body.teamAnnualTransactionCount);
  if ("teamSize" in body) data.teamSize = coerceInt(body.teamSize);
  if ("teamCredibilityNotes" in body)
    data.teamCredibilityNotes =
      typeof body.teamCredibilityNotes === "string"
        ? body.teamCredibilityNotes
        : null;

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "no updatable fields" }, { status: 400 });
  }

  // Upsert with a minimal "create" so the wizard works even if the member
  // hasn't yet uploaded a CSV (which is what normally creates the row).
  const saved = await prisma.marketConfig.upsert({
    where: { userId: access.user.id },
    update: data,
    create: {
      userId: access.user.id,
      marketName: "(pending)",
      ...data,
    },
  });

  return Response.json({ ok: true, config: toShape(saved) });
}

function coerceInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
