import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { MetricFamily } from "@/lib/script-data-resolver";

export const runtime = "nodejs";

/**
 * Layer 3 — "Tell me what's missing". Lets a member hand-enter a fact the data
 * search couldn't find, so a thin plan can still clear the gate. The fact is
 * persisted as `member_provided` + `supporting_texture_only` (NEVER headline-safe
 * — it isn't validator-verified) and linked to the plan directly, since the
 * public PATCH link route only accepts headline-safe facts.
 */
const VALID_FAMILIES = new Set<string>(Object.values(MetricFamily));

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const planId = asString(body.planId);
  const neighbourhood = asString(body.neighbourhood);
  const propertyTypeRaw = asString(body.propertyType);
  const propertyType =
    propertyTypeRaw && propertyTypeRaw !== "All" ? propertyTypeRaw : null;
  const metricFamily = asString(body.metricFamily);
  const valueString = asString(body.value);
  const note = asString(body.note);

  if (!planId) {
    return NextResponse.json({ error: "planId is required" }, { status: 400 });
  }
  if (!metricFamily || !VALID_FAMILIES.has(metricFamily)) {
    return NextResponse.json({ error: "Invalid metricFamily" }, { status: 400 });
  }
  if (!neighbourhood) {
    return NextResponse.json(
      { error: "neighbourhood is required" },
      { status: 400 },
    );
  }
  if (!valueString) {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }

  const plan = await prisma.contentPlan.findFirst({
    where: { id: planId, userId: user.id, deletedAt: null },
    select: { id: true, linkedFactIds: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Member-provided facts still need an upload to hang off of (uploadId is
  // required). Attach to the most-recent validated upload; without one there's
  // no market context to anchor the fact, so we refuse rather than orphan it.
  const upload = await prisma.marketDataUpload.findFirst({
    where: { userId: user.id, status: "validated" },
    orderBy: [{ monthYear: "desc" }, { validatedAt: "desc" }],
    select: { id: true, monthYear: true },
  });
  if (!upload) {
    return NextResponse.json(
      { error: "Upload your market data first to add a fact." },
      { status: 400 },
    );
  }

  const numeric = Number(valueString.replace(/[^0-9.\-]/g, ""));
  const metricValue = Number.isFinite(numeric) && valueString.match(/[0-9]/)
    ? numeric
    : null;

  const fact = await prisma.marketFact.create({
    data: {
      userId: user.id,
      uploadId: upload.id,
      neighbourhood,
      propertyType,
      metricName: `${metricFamily} (member-provided)`,
      metricFamily: metricFamily as MetricFamily,
      metricValue,
      metricValueString: valueString,
      timeWindow: upload.monthYear,
      dateContext: new Date(`${upload.monthYear.slice(0, 7)}-01T00:00:00Z`),
      // NEVER headline-safe: this is unverified, member-entered texture.
      usageClass: "supporting_texture_only",
      sourceType: "member_provided",
      notes: note,
    },
    select: { id: true },
  });

  const current = toStringArray(plan.linkedFactIds);
  if (!current.includes(fact.id)) {
    await prisma.contentPlan.updateMany({
      where: { id: plan.id, userId: user.id },
      data: { linkedFactIds: [...current, fact.id] },
    });
  }

  return NextResponse.json({ factId: fact.id });
}
