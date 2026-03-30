import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { fetchLocationCustomValues, updateGHLCustomValue } from "@/lib/ghl";

// GHL key name → AppSetting key mapping
const GHL_SYNC_KEYS: Record<string, string> = {
  webinar_date: "webinar_date",
  webinar_time: "webinar_time",
  webinar_name: "webinar_name",
  webinar_link: "webinar_link",
  webinar_replay_link: "webinar_replay_link",
  webinar_group: "webinar_group",
  add_event_calendar: "add_event_calendar",
  book_a_call_with_jared: "book_a_call_with_jared",
  offer: "offer",
};

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          ...Object.values(GHL_SYNC_KEYS),
          "webinar_price",
          "webinar_spots_available",
          "webinar_registration_open",
        ],
      },
    },
  });

  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;

  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json();
  const allowedKeys = [
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

  // Save each setting to DB
  const updates = Object.entries(body as Record<string, string>).filter(
    ([k]) => allowedKeys.includes(k)
  );

  await Promise.all(
    updates.map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    )
  );

  // Compute derived GHL values
  const dateVal = (body.webinar_date ?? "").toString();
  const timeVal = (body.webinar_time ?? "").toString();
  const priceVal = (body.webinar_price ?? "Absolutely FREE!").toString();
  const funnelDateAndTime = `${dateVal} || Time: ${timeVal} || Price: ${priceVal}`;

  const derivedUpdates = [
    { key: "funnel_date_and_time", value: funnelDateAndTime },
  ];

  await Promise.all(
    derivedUpdates.map(({ key, value }) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );

  // Sync to GHL custom values
  let ghlSyncStatus: "ok" | "failed" | "partial" = "ok";
  try {
    const ghlCustomValues = await fetchLocationCustomValues();

    const toSync: { appKey: string; ghlKeyName: string; value: string }[] = [];
    for (const [ghlKeyName, appKey] of Object.entries(GHL_SYNC_KEYS)) {
      const val = body[appKey];
      if (val !== undefined) {
        toSync.push({ appKey, ghlKeyName, value: String(val) });
      }
    }
    // Add derived values
    toSync.push({ appKey: "funnel_date_and_time", ghlKeyName: "funnel_date_and_time", value: funnelDateAndTime });

    let anyFailed = false;
    for (const { ghlKeyName, value } of toSync) {
      // Find the GHL custom value by fieldKey or name
      const match = ghlCustomValues.find(
        (cv: any) =>
          cv.fieldKey === `location.${ghlKeyName}` ||
          cv.name === ghlKeyName ||
          cv.fieldKey === ghlKeyName
      );
      if (match) {
        const result = await updateGHLCustomValue((match as any).id, value);
        if (!result.ok) anyFailed = true;
      }
    }
    if (anyFailed) ghlSyncStatus = "partial";
  } catch {
    ghlSyncStatus = "failed";
  }

  return NextResponse.json({ success: true, ghlSyncStatus });
}
