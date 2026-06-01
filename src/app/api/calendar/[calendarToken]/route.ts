import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function escapeICS(text: string): string {
  return text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
}

const GROWTH_DWY_TIERS = ["growth", "done_with_you"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ calendarToken: string }> }
) {
  const { calendarToken } = await params;

  const user = await prisma.user.findUnique({
    where: { calendarToken },
    select: { id: true, serviceTier: true },
  });

  if (!user) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const plans = await prisma.contentPlan.findMany({
    where: { userId: user.id },
    orderBy: { publishDate: "asc" },
  });

  const tier = user.serviceTier ?? "foundations";
  const includeEditDue = GROWTH_DWY_TIERS.includes(tier);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Attraction by Video//Content Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ABV Content Planner",
    "X-WR-TIMEZONE:America/Edmonton",
  ];

  for (const plan of plans) {
    const theme = plan.theme ?? "None";
    const priority = plan.priority ?? "None";

    if (plan.publishDate) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:publish-${plan.id}@attractionbyvideo.com`,
        `DTSTART;VALUE=DATE:${formatDate(plan.publishDate)}`,
        `SUMMARY:PUBLISH: ${escapeICS(plan.title)}`,
        `DESCRIPTION:Status: ${escapeICS(plan.status)}\\nTheme: ${escapeICS(theme)}\\nPriority: ${escapeICS(priority)}`,
        "END:VEVENT"
      );
    }

    if (plan.shootDate) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:shoot-${plan.id}@attractionbyvideo.com`,
        `DTSTART;VALUE=DATE:${formatDate(plan.shootDate)}`,
        `SUMMARY:SHOOT: ${escapeICS(plan.title)}`,
        `DESCRIPTION:Status: ${escapeICS(plan.status)}\\nTheme: ${escapeICS(theme)}`,
        "END:VEVENT"
      );
    }

    if (includeEditDue && plan.editDueDate) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:editdue-${plan.id}@attractionbyvideo.com`,
        `DTSTART;VALUE=DATE:${formatDate(plan.editDueDate)}`,
        `SUMMARY:EDIT DUE: ${escapeICS(plan.title)}`,
        `DESCRIPTION:Status: ${escapeICS(plan.status)}`,
        "END:VEVENT"
      );
    }
  }

  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n") + "\r\n";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="abv-content-planner.ics"',
      "Cache-Control": "no-cache",
    },
  });
}
