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
  if (!apiKey) return NextResponse.json({ error: "Fathom API key not configured. Set it in Settings first." }, { status: 400 });

  const recordingEmail = await getSetting("fathom_recording_email");
  const titleFilter = (await getSetting("fathom_title_filter")) ?? "Q&A";

  try {
    const params = new URLSearchParams({ include_transcript: "true", limit: "50" });
    if (recordingEmail) params.append("recorded_by[]", recordingEmail);

    const res = await fetch(`https://api.fathom.ai/external/v1/meetings?${params}`, {
      headers: { "X-Api-Key": apiKey },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Fathom API error ${res.status}: ${text}` }, { status: 502 });
    }

    const data = await res.json();
    const meetings: FathomMeeting[] = data.items ?? data.meetings ?? data ?? [];

    // Filter by title
    const filtered = meetings.filter((m) => {
      const titleMatch = !titleFilter || (m.title ?? m.meeting_title ?? "").toLowerCase().includes(titleFilter.toLowerCase());
      return titleMatch;
    });

    // Check which are already imported
    const fathomIds = filtered.map((m) => m.id);
    const existing = await prisma.qACall.findMany({
      where: { fathomId: { in: fathomIds } },
      select: { fathomId: true, id: true },
    });
    const existingMap = Object.fromEntries(existing.map((e) => [e.fathomId, e.id]));

    const calls = filtered.map((m) => ({
      fathomId: m.id,
      title: m.title ?? m.meeting_title ?? "Untitled Q&A",
      callDate: m.recording_start_time ?? m.scheduled_start_time ?? m.created_at ?? new Date().toISOString(),
      duration: m.duration ?? null,
      alreadyImported: !!existingMap[m.id],
      existingId: existingMap[m.id] ?? null,
      fathomShareUrl: m.share_url ?? m.url ?? "",
      transcript: extractTranscript(m),
    }));

    return NextResponse.json({ calls });
  } catch (err) {
    console.error("[fathom-pull]", err);
    return NextResponse.json({ error: "Failed to connect to Fathom API" }, { status: 502 });
  }
}

function extractTranscript(m: FathomMeeting): string {
  // Fathom returns transcript as an array of segments or a plain string
  if (typeof m.transcript === "string") return m.transcript;
  if (Array.isArray(m.transcript)) {
    return m.transcript.map((seg: any) => {
      const speaker = seg.speaker_name ?? seg.speaker ?? "";
      const text = seg.content ?? seg.text ?? "";
      return speaker ? `${speaker}: ${text}` : text;
    }).join("\n");
  }
  if (typeof m.full_transcript === "string") return m.full_transcript;
  return "";
}

interface FathomMeeting {
  id: string;
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
