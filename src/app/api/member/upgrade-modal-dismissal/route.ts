import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cutoff = new Date(Date.now() - FOURTEEN_DAYS_MS);
  const dismissals = await prisma.upgradeModalDismissal.findMany({
    where: { userId: user.id, dismissedAt: { gte: cutoff } },
    select: { trigger: true, dismissedAt: true },
  });

  const activeTriggers = Array.from(new Set(dismissals.map((d) => d.trigger)));
  return NextResponse.json({ dismissedTriggers: activeTriggers });
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const trigger = typeof body.trigger === "string" ? body.trigger : null;
  if (!trigger) return NextResponse.json({ error: "Missing trigger" }, { status: 400 });

  await prisma.upgradeModalDismissal.create({
    data: { userId: user.id, trigger },
  });

  return NextResponse.json({ ok: true });
}
