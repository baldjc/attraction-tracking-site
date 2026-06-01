/**
 * PATCH /api/member/content-plans/[id]/facts
 *
 * Link/unlink MarketFact rows on a ContentPlan's `linkedFactIds`. Backs the
 * in-place fact picker used by Script Builder v2's zero-fact block and the
 * auto-linked review panel.
 *
 * Body: { add?: string[]; remove?: string[] }
 *   - `add`    ids are validated to be owned + headline-safe before linking
 *     (so a member can only link gate-valid facts);
 *   - `remove` ids are dropped from the array;
 *   - the result is de-duplicated and persisted.
 *
 * Returns 404 when the plan isn't owned by the caller. Returns the new
 * `linkedFactIds` and `count` so the client can re-evaluate the gate without a
 * full refetch.
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";
import { resolveUserFromSession } from "@/lib/session-utils";

export const runtime = "nodejs";

function toStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { add?: unknown; remove?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const add = toStringArray(body.add);
  const remove = new Set(toStringArray(body.remove));

  const plan = await prisma.contentPlan.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { id: true, linkedFactIds: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const current = toStringArray(plan.linkedFactIds);

  // Only link facts the caller actually owns AND that are headline-safe, so the
  // resulting plan can never be padded with someone else's or gate-invalid facts.
  let validatedAdd: string[] = [];
  if (add.length > 0) {
    const owned = await prisma.marketFact.findMany({
      where: { ...EXCLUDE_LEGACY_FAILURE_RATE, id: { in: add }, userId: user.id, usageClass: "headline_safe" },
      select: { id: true },
    });
    validatedAdd = owned.map((f) => f.id);
  }

  const next = [...new Set([...current, ...validatedAdd])].filter(
    (factId) => !remove.has(factId),
  );

  await prisma.contentPlan.updateMany({
    where: { id: plan.id, userId: user.id },
    data: { linkedFactIds: next },
  });

  return NextResponse.json({ linkedFactIds: next, count: next.length });
}
