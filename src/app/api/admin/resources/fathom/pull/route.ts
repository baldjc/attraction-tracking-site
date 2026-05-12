import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireStaff() {
  const session = await auth();
  if (!session?.user) return null;
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "editor") return null;
  return session.user;
}

async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  return s?.value ?? null;
}

export async function POST() {
  if (!await requireStaff()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = await getSetting("fathom_api_key");
  if (!apiKey) return NextResponse.json({ error: "Fathom API key not configured. Set it in Settings first." }, { status: 400 });

  const recordingEmail = await getSetting("fathom_recording_email");
  const titleFilter = (await getSetting("fathom_title_filter")) ?? "Q&A";

  try {
    // Fetch meetings with transcripts in small batches to avoid Fathom 503 timeouts
    const allMeetings: FathomMeeting[] = [];
    let cursor: string | null = null;
    let pageCount = 0;
    const MAX_PAGES = 5; // safety cap

    do {
      const params = new URLSearchParams({ include_transcript: "true", limit: "5" });
      if (recordingEmail) params.append("recorded_by[]", recordingEmail);
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`https://api.fathom.ai/external/v1/meetings?${params}`, {
        headers: { "X-Api-Key": apiKey },
      });

      if (!res.ok) {
        const text = await res.text();
        // If we already have some results, return what we have instead of failing entirely
        if (allMeetings.length > 0) {
          console.warn(`[fathom-pull] Got ${res.status} on page ${pageCount + 1}, returning ${allMeetings.length} meetings collected so far`);
          break;
        }
        return NextResponse.json({ error: `Fathom API error ${res.status}: ${text}` }, { status: 502 });
      }

      const data = await res.json();
      const items: FathomMeeting[] = data.items ?? data.meetings ?? [];
      allMeetings.push(...items);
      cursor = data.next_cursor ?? null;
      pageCount++;
    } while (cursor && pageCount < MAX_PAGES);

    const meetings = allMeetings;

    // Filter by title
    const filtered = meetings.filter((m) => {
      const titleMatch = !titleFilter || (m.title ?? m.meeting_title ?? "").toLowerCase().includes(titleFilter.toLowerCase());
      return titleMatch;
    });

    // Check which are already imported — Fathom uses recording_id (number) as the unique ID
    const fathomIds = filtered.map((m) => String(m.recording_id)).filter(Boolean);
    const existing = await prisma.qACall.findMany({
      where: { fathomId: { in: fathomIds } },
      select: { fathomId: true, id: true },
    });
    const existingMap = Object.fromEntries(existing.map((e) => [e.fathomId, e.id]));

    const calls = filtered.map((m) => {
      const fId = String(m.recording_id);
      return {
        fathomId: fId,
        title: m.title ?? m.meeting_title ?? "Untitled Q&A",
        callDate: m.recording_start_time ?? m.scheduled_start_time ?? m.created_at ?? new Date().toISOString(),
        duration: m.duration ?? null,
        alreadyImported: !!existingMap[fId],
        existingId: existingMap[fId] ?? null,
        fathomShareUrl: (m.share_url ?? m.url ?? "").split("#")[0],
        transcript: extractTranscript(m),
      };
    });

    return NextResponse.json({ calls });
  } catch (err) {
    console.error("[fathom-pull]", err);
    return NextResponse.json({ error: "Failed to connect to Fathom API" }, { status: 502 });
  }
}

function extractTranscript(m: FathomMeeting): string {
  if (typeof m.transcript === "string") return m.transcript;
  if (Array.isArray(m.transcript)) {
    return m.transcript.map((seg: any) => {
      const speaker = seg.speaker?.display_name ?? seg.speaker_name ?? (typeof seg.speaker === "string" ? seg.speaker : "") ?? "";
      const text = seg.text ?? seg.content ?? "";
      return speaker ? `${speaker}: ${text}` : text;
    }).filter(Boolean).join("\n");
  }
  if (typeof m.full_transcript === "string") return m.full_transcript;
  return "";
}

interface FathomMeeting {
  recording_id: number;
  title?: string;
  meeting_title?: string;
  scheduled_start_time?: string;
  recording_start_time?: string;
  created_at?: string;
  duration?: number;
  share_url?: string;
  url?: string;
  transcript?: any;
  full_transcript?: string;
  organizer_email?: string;
  recorded_by?: any;
}
