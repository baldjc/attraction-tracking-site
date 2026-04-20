import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { isReviewerEnabled } from "@/lib/reviewer-flag";
import prisma from "@/lib/prisma";
import { resolveUsersForChannel } from "@/lib/reviewer-channel-resolver";

const MARKET_UPDATE_THEME = "Market Updates";

function monthBoundsUTC(now: Date): { start: Date; end: Date; label: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const label = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { start, end, label };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ channelRef: string }> },
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await isReviewerEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const { channelRef } = await params;
  const userIds = await resolveUsersForChannel(channelRef);

  const { start, end, label } = monthBoundsUTC(new Date());

  const plans =
    userIds.length === 0
      ? []
      : await prisma.contentPlan.findMany({
          where: {
            userId: { in: userIds },
            publishDate: { gte: start, lt: end },
          },
          select: { theme: true, dramaMode: true, title: true },
        });

  const counts = { marketUpdates: 0, drama: 0, directStress: 0, other: 0 };
  const themeBreakdown: Record<string, number> = {};

  for (const p of plans) {
    const theme = (p.theme || "").trim();
    if (theme) themeBreakdown[theme] = (themeBreakdown[theme] || 0) + 1;
    else themeBreakdown["(Untagged)"] = (themeBreakdown["(Untagged)"] || 0) + 1;

    if (theme === MARKET_UPDATE_THEME) {
      counts.marketUpdates += 1;
    } else if (!theme) {
      counts.other += 1;
    } else if (p.dramaMode) {
      counts.drama += 1;
    } else {
      counts.directStress += 1;
    }
  }

  const total = plans.length;
  const dayOfMonth = new Date().getUTCDate();
  const pastMidMonth = dayOfMonth >= 15;

  const gaps: string[] = [];
  if (counts.marketUpdates === 0)
    gaps.push("Going dark on in-market buyers — no Market Update this month");
  if (counts.drama === 0)
    gaps.push("No wide net — new viewer growth will stall without Drama");
  if (counts.directStress < 2)
    gaps.push(
      `Trust-building middle is thin — only ${counts.directStress}/2 Direct video${counts.directStress === 1 ? "" : "s"}`,
    );
  if (total > 5) gaps.push(`Overfull schedule — ${total} videos planned`);

  return NextResponse.json({
    month: label,
    counts,
    target: { marketUpdates: 1, drama: 1, directStress: 2 },
    gaps,
    themeBreakdown,
    pastMidMonth,
    total,
  });
}
