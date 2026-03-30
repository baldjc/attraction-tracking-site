import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// ─── Default seed rows ────────────────────────────────────────────────────────

const SEED_ROWS = [
  { key: "webinar_date", value: "May 14th 2026", label: "Webinar Date", fieldType: "text", category: "webinar", ghlCustomValueKey: "webinar_date", sortOrder: 1 },
  { key: "webinar_time", value: "11:00 AM MST", label: "Webinar Time", fieldType: "text", category: "webinar", ghlCustomValueKey: "webinar_time", sortOrder: 2 },
  { key: "webinar_name", value: "5 YouTube Mistakes Keeping You Invisible to Your Best Clients", label: "Webinar Title", fieldType: "text", category: "webinar", ghlCustomValueKey: "webinar_name", sortOrder: 3 },
  { key: "webinar_price", value: "Absolutely FREE!", label: "Price Display", fieldType: "text", category: "webinar", ghlCustomValueKey: null, sortOrder: 4 },
  { key: "webinar_link", value: "https://us06web.zoom.us/meeting/register/VSV2PExgQRiuSDfudt2hrQ", label: "Zoom Registration Link", fieldType: "url", category: "webinar", ghlCustomValueKey: "webinar_link", sortOrder: 5 },
  { key: "webinar_replay_link", value: "https://youtu.be/dkDxkLA1qlk", label: "Replay Link (YouTube)", fieldType: "url", category: "webinar", ghlCustomValueKey: "webinar_replay_link", sortOrder: 6 },
  { key: "webinar_group", value: "https://www.skool.com/bcmng", label: "Skool Community Link", fieldType: "url", category: "webinar", ghlCustomValueKey: "webinar_group", sortOrder: 7 },
  { key: "add_event_calendar", value: "https://evt.to/m6g2165kzyvd", label: "Calendar Add Link", fieldType: "url", category: "webinar", ghlCustomValueKey: "add_event_calendar", sortOrder: 8 },
  { key: "book_a_call_with_jared", value: "https://api.leadconnectorhq.com/widget/booking/lXV5gbqk0CnlsLJGBwQ8", label: "Booking Widget URL", fieldType: "url", category: "webinar", ghlCustomValueKey: "book_a_call_with_jared", sortOrder: 9 },
  { key: "offer", value: "https://attractionbyvideo.com/Attraction-by-Video", label: "Offer/Sales Page Link", fieldType: "url", category: "webinar", ghlCustomValueKey: "offer", sortOrder: 10 },
  { key: "webinar_spots_available", value: "true", label: "Show \"Limited Spots Available\"", fieldType: "toggle", category: "webinar", ghlCustomValueKey: null, sortOrder: 11 },
  { key: "webinar_registration_open", value: "true", label: "Registration Open", fieldType: "toggle", category: "webinar", ghlCustomValueKey: null, sortOrder: 12 },
  { key: "funnel_date_and_time", value: "May 14th 2026  ||  Time: 11:00 AM MST  ||  Price: Absolutely FREE!", label: "Funnel Date & Time (auto)", fieldType: "readonly", category: "webinar_computed", ghlCustomValueKey: "funnel_date_and_time", sortOrder: 20 },
  { key: "webinar_time_workflow_mmddyyyy_hhmm", value: "05-14-2026 11:00 AM", label: "Workflow Timestamp (auto)", fieldType: "readonly", category: "webinar_computed", ghlCustomValueKey: "webinar_time_workflow_mmddyyyy_hhmm", sortOrder: 21 },
];

async function seedIfEmpty() {
  const count = await prisma.siteConfig.count();
  if (count === 0) {
    await prisma.siteConfig.createMany({ data: SEED_ROWS });
  }
}

// ─── GHL sync ─────────────────────────────────────────────────────────────────

async function syncToGHL(settings: { key: string; value: string; ghlCustomValueKey: string | null }[]) {
  const results = { synced: 0, failed: 0, errors: [] as string[] };
  const locationId = process.env.GHL_LOCATION_ID;
  const apiKey = process.env.GHL_API_KEY;

  if (!locationId || !apiKey) {
    return { synced: 0, failed: settings.length, errors: ["GHL env vars not set"] };
  }

  for (const setting of settings) {
    if (!setting.ghlCustomValueKey) continue;
    try {
      const res = await fetch(
        `https://services.leadconnectorhq.com/locations/${locationId}/customValues/${setting.ghlCustomValueKey}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
          },
          body: JSON.stringify({ value: setting.value }),
        }
      );
      if (res.ok) {
        results.synced++;
      } else {
        results.failed++;
        results.errors.push(`${setting.key}: ${res.status}`);
      }
    } catch (err: any) {
      results.failed++;
      results.errors.push(`${setting.key}: ${err?.message ?? "network error"}`);
    }
  }
  return results;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function computeWorkflowTimestamp(date: string, time: string): string {
  try {
    const cleanDate = date.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
    const parsed = new Date(cleanDate);
    if (isNaN(parsed.getTime())) return "";
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    const year = parsed.getFullYear();
    const cleanTime = time.replace(/\s*(MST|PST|EST|CST|MDT|PDT|EDT|CDT|UTC)$/i, "").trim();
    return `${month}-${day}-${year} ${cleanTime}`;
  } catch {
    return "";
  }
}

// ─── GET (admin) ──────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  await seedIfEmpty();

  const rows = await prisma.siteConfig.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ settings: rows });
}

// ─── PUT (admin) ──────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json();
  const incoming: { key: string; value: string }[] = body.settings ?? [];
  const userEmail = (session.user as any)?.email ?? "admin";

  // Ensure defaults exist
  await seedIfEmpty();

  // Load all current rows to get metadata (label, fieldType, ghlCustomValueKey)
  const allRows = await prisma.siteConfig.findMany({ orderBy: { sortOrder: "asc" } });
  const rowMap = Object.fromEntries(allRows.map((r) => [r.key, r]));

  // Compute derived values
  const dateVal = incoming.find((i) => i.key === "webinar_date")?.value ?? rowMap["webinar_date"]?.value ?? "";
  const timeVal = incoming.find((i) => i.key === "webinar_time")?.value ?? rowMap["webinar_time"]?.value ?? "";
  const priceVal = incoming.find((i) => i.key === "webinar_price")?.value ?? rowMap["webinar_price"]?.value ?? "";

  const derivedFunnel = `${dateVal}  ||  Time: ${timeVal}  ||  Price: ${priceVal}`;
  const derivedWorkflow = computeWorkflowTimestamp(dateVal, timeVal);

  const toSave = [
    ...incoming,
    { key: "funnel_date_and_time", value: derivedFunnel },
    { key: "webinar_time_workflow_mmddyyyy_hhmm", value: derivedWorkflow },
  ];

  // Upsert all
  await Promise.all(
    toSave.map(({ key, value }) =>
      prisma.siteConfig.upsert({
        where: { key },
        update: { value, updatedBy: userEmail },
        create: {
          key,
          value,
          updatedBy: userEmail,
          ...(rowMap[key]
            ? {
                label: rowMap[key].label,
                fieldType: rowMap[key].fieldType,
                category: rowMap[key].category,
                ghlCustomValueKey: rowMap[key].ghlCustomValueKey,
                sortOrder: rowMap[key].sortOrder,
              }
            : {}),
        },
      })
    )
  );

  // Reload after save to get fresh values
  const freshRows = await prisma.siteConfig.findMany({ orderBy: { sortOrder: "asc" } });
  const toSync = freshRows.filter((r) => r.ghlCustomValueKey);

  const ghlResult = await syncToGHL(
    toSync.map((r) => ({ key: r.key, value: r.value, ghlCustomValueKey: r.ghlCustomValueKey }))
  );

  return NextResponse.json({ success: true, ghlSync: ghlResult });
}
