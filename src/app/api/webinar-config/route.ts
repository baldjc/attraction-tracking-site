import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const WEBINAR_KEYS = [
  "webinar_date",
  "webinar_time",
  "webinar_name",
  "webinar_link",
  "webinar_replay_link",
  "webinar_group",
  "add_event_calendar",
  "book_a_call_with_jared",
  "offer",
  "webinar_price",
  "webinar_spots_available",
  "webinar_registration_open",
];

const DEFAULTS: Record<string, string> = {
  webinar_date: "May 14th 2026",
  webinar_time: "11:00 AM MST",
  webinar_name: "5 YouTube Mistakes Keeping You Invisible to Your Best Clients",
  webinar_link: "https://us06web.zoom.us/meeting/register/VSV2PExgQRiuSDfudt2hrQ",
  webinar_replay_link: "https://youtu.be/dkDxkLA1qlk",
  webinar_group: "https://www.skool.com/bcmng",
  add_event_calendar: "https://evt.to/m6g2165kzyvd",
  book_a_call_with_jared: "https://api.leadconnectorhq.com/widget/booking/lXV5gbqk0CnlsLJGBwQ8",
  offer: "https://attractionbyvideo.com/Attraction-by-Video",
  webinar_price: "Absolutely FREE!",
  webinar_spots_available: "true",
  webinar_registration_open: "true",
};

export async function GET() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: WEBINAR_KEYS } },
  });

  const map: Record<string, string> = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;

  return NextResponse.json(
    {
      date: map.webinar_date,
      time: map.webinar_time,
      name: map.webinar_name,
      link: map.webinar_link,
      replayLink: map.webinar_replay_link,
      group: map.webinar_group,
      addEventCalendar: map.add_event_calendar,
      bookACall: map.book_a_call_with_jared,
      offer: map.offer,
      price: map.webinar_price,
      spotsAvailable: map.webinar_spots_available === "true",
      registrationOpen: map.webinar_registration_open === "true",
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}
