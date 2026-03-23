import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as any).role !== "admin") return null;
  return session.user;
}

async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  return s?.value ?? null;
}

export async function POST() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = await getSetting("fathom_api_key");
  if (!apiKey) return NextResponse.json({ error: "Fathom API key not configured" }, { status: 400 });

  const recordingEmail = await getSetting("fathom_recording_email");

  try {
    // Fetch all meetings from Fathom (paginated)
    const allMeetings: Array<{ recording_id: number; share_url?: string; url?: string }> = [];
    let cursor: string | null = null;
    let page = 0;

    do {
      const params = new URLSearchParams({ limit: "50" });
      if (recordingEmail) params.append("recorded_by[]", recordingEmail);
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`https://api.fathom.ai/external/v1/meetings?${params}`, {
        headers: { "X-Api-Key": apiKey },
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `Fathom API error ${res.status}: ${text}` }, { status: 502 });
      }

      const data = await res.json();
      allMeetings.push(...(data.items ?? data.meetings ?? []));
      cursor = data.next_cursor ?? null;
      page++;
    } while (cursor && page < 20);

    // Build map: recording_id → share_url
    const shareUrlMap = new Map<string, string>();
    for (const m of allMeetings) {
      if (m.recording_id != null) {
        const url = (m.share_url ?? m.url ?? "").split("#")[0];
        if (url) shareUrlMap.set(String(m.recording_id), url);
      }
    }

    // Get all QACalls that have a /calls/ style URL (the wrong format)
    const calls = await prisma.qACall.findMany({
      select: { id: true, fathomId: true, fathomShareUrl: true },
    });

    let updated = 0;
    for (const call of calls) {
      const freshUrl = shareUrlMap.get(call.fathomId);
      if (!freshUrl) continue;
      // Only update if the URL changed
      if (freshUrl === call.fathomShareUrl) continue;
      await prisma.qACall.update({
        where: { id: call.id },
        data: { fathomShareUrl: freshUrl },
      });
      updated++;
    }

    return NextResponse.json({ ok: true, updated, total: calls.length });
  } catch (err) {
    console.error("[fathom-refresh-urls]", err);
    return NextResponse.json({ error: "Failed to refresh URLs" }, { status: 500 });
  }
}
