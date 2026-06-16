import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  emptyMarketConfig,
  toShape,
  validateColumnMapping,
  type MarketConfigShape,
} from "@/lib/market-config";
import { validateStatusMapping } from "@/lib/market-status-buckets";
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

  const jn = (v: unknown) =>
    v === null || v === undefined
      ? Prisma.JsonNull
      : (v as Prisma.InputJsonValue);
  const data = {
    marketName: body.marketName.trim(),
    mlsSource: body.mlsSource.trim(),
    priceTiers: jn(body.priceTiers),
    moiThresholds: jn(body.moiThresholds),
    highEndException: jn(body.highEndException),
    neighbourhoodVocab: jn(body.neighbourhoodVocab),
    keywordKit: jn(body.keywordKit),
    primaryAvatar: jn(body.primaryAvatar),
    subPersonas: jn(body.subPersonas),
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
  if ("columnMapping" in body) {
    // Strictly validate: only known field keys with string header values may be
    // persisted. This prevents malformed JSON from breaking later preflight runs
    // (which read mapped values as strings). The interactive mapper enforces
    // required fields client-side; the upload route re-checks at submit time.
    const result = validateColumnMapping(body.columnMapping);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    data.columnMapping = result.mapping;
  }
  if ("statusMapping" in body) {
    // Per-member status-value override (Task #66). validateStatusMapping returns
    // a clean 4-bucket mapping or null (absent/malformed/empty). Persisting null
    // clears the override and reverts to statusCodes/seed resolution.
    const mapping = validateStatusMapping(body.statusMapping);
    if (body.statusMapping != null && mapping === null) {
      return Response.json(
        { error: "statusMapping must assign at least one status label." },
        { status: 400 },
      );
    }
    data.statusMapping = mapping ?? Prisma.JsonNull;
  }
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
