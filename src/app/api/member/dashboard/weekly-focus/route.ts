import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { withRouteErrorHandling } from "@/lib/api-error-wrapper";

// Default member timezone for "this week" boundaries. ISO week = Monday 00:00
// → Sunday 23:59 in this zone.
const DEFAULT_TZ = "America/Edmonton";

/** Wall-clock parts of `date` as seen in `timeZone`. */
function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

/** The tz offset (ms) at a given instant: (wall-clock as UTC) − actual UTC. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - date.getTime();
}

/** The UTC instant for a wall-clock date/time in `timeZone`. */
function zonedTimeToUtc(y: number, m: number, d: number, timeZone: string): Date {
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = tzOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

/** Monday-start ISO week bounds [start, end) in the given timezone. */
function weekBounds(now: Date, timeZone: string): { start: Date; end: Date } {
  const { y, m, d } = zonedParts(now, timeZone);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (dow + 6) % 7;
  const monday = new Date(Date.UTC(y, m - 1, d - mondayOffset));
  const nextMonday = new Date(Date.UTC(y, m - 1, d - mondayOffset + 7));
  const start = zonedTimeToUtc(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
    timeZone,
  );
  const end = zonedTimeToUtc(
    nextMonday.getUTCFullYear(),
    nextMonday.getUTCMonth() + 1,
    nextMonday.getUTCDate(),
    timeZone,
  );
  return { start, end };
}

export const GET = withRouteErrorHandling("member/dashboard/weekly-focus", GET_impl);

async function GET_impl() {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { start, end } = weekBounds(new Date(), DEFAULT_TZ);

  const [shootPlans, editPlans, leadRows] = await Promise.all([
    prisma.contentPlan.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        status: "Ready to Shoot",
        shootDate: { gte: start, lt: end },
      },
      select: { id: true, title: true },
      orderBy: { shootDate: "asc" },
    }),
    prisma.contentPlan.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        status: { in: ["Shot - In Post", "Editing"] },
        editDueDate: { gte: start, lt: end },
      },
      select: { id: true, title: true },
      orderBy: { editDueDate: "asc" },
    }),
    prisma.lead.findMany({
      where: {
        timestamp: { gte: start, lt: end },
        click: { link: { campaign: { userId: user.id } } },
      },
      select: {
        id: true,
        click: { select: { link: { select: { campaign: { select: { name: true } } } } } },
      },
    }),
  ]);

  // Aggregate leads by campaign name.
  const bySource = new Map<string, number>();
  for (const lead of leadRows) {
    const name = lead.click?.link?.campaign?.name ?? "Unknown";
    bySource.set(name, (bySource.get(name) ?? 0) + 1);
  }
  const sources = Array.from(bySource.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const res = NextResponse.json({
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    shoots: shootPlans,
    edits: editPlans,
    leads: { total: leadRows.length, sources },
  });
  // Stale-while-revalidate, 5-min TTL.
  res.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=600");
  return res;
}
