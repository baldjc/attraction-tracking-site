import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const ALLOWED_ORIGIN = "https://www.attractionbyvideo.com";

function corsHeaders(origin: string | null) {
  const allowed = origin === ALLOWED_ORIGIN || origin?.endsWith(".attractionbyvideo.com");
  return {
    "Access-Control-Allow-Origin": allowed ? (origin ?? ALLOWED_ORIGIN) : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = {
    ...corsHeaders(origin),
    "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
  };

  const rows = await prisma.siteConfig.findMany({
    where: { category: "webinar" },
    orderBy: { sortOrder: "asc" },
  });

  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  // Defaults (in case table not yet seeded)
  const d = (k: string, fallback: string) => map[k] ?? fallback;

  return NextResponse.json(
    {
      webinar: {
        date: d("webinar_date", "May 14th 2026"),
        time: d("webinar_time", "11:00 AM MST"),
        name: d("webinar_name", "5 YouTube Mistakes Keeping You Invisible to Your Best Clients"),
        price: d("webinar_price", "Absolutely FREE!"),
        link: d("webinar_link", ""),
        replayLink: d("webinar_replay_link", ""),
        group: d("webinar_group", ""),
        calendarLink: d("add_event_calendar", ""),
        bookingLink: d("book_a_call_with_jared", ""),
        offerLink: d("offer", ""),
        spotsAvailable: d("webinar_spots_available", "true") === "true",
        registrationOpen: d("webinar_registration_open", "true") === "true",
      },
    },
    { headers }
  );
}
