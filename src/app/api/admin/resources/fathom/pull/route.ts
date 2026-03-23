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

    const res = await fetch(`https://api.fathom.ai/external/v1/meetings?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Fathom API error ${res.status}: ${text}` }, { status: 502 });
    }

    const data = await res.json();
    const meetings: FathomMeeting[] = data.items ?? data.meetings ?? data ?? [];

    // Filter by title and recording email
    const filtered = meetings.filter((m) => {
      const titleMatch = !titleFilter || m.title?.toLowerCase().includes(titleFilter.toLowerCase());
      const emailMatch = !recordingEmail || m.organizer_email === recordingEmail || m.recorded_by === recordingEmail;
      return titleMatch && emailMatch;
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
      title: m.title ?? "Untitled Q&A",
      callDate: m.started_at ?? m.created_at ?? new Date().toISOString(),
      duration: m.duration ?? null,
      alreadyImported: !!existingMap[m.id],
      existingId: existingMap[m.id] ?? null,
      fathomShareUrl: m.share_url ?? m.url ?? "",
      transcript: m.transcript ?? m.full_transcript ?? "",
    }));

    return NextResponse.json({ calls });
  } catch (err) {
    console.error("[fathom-pull]", err);
    return NextResponse.json({ error: "Failed to connect to Fathom API" }, { status: 502 });
  }
}

interface FathomMeeting {
  id: string;
  title?: string;
  started_at?: string;
  created_at?: string;
  duration?: number;
  share_url?: string;
  url?: string;
  transcript?: string;
  full_transcript?: string;
  organizer_email?: string;
  recorded_by?: string;
}
