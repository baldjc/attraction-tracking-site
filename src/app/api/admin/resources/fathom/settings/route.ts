import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as any).role !== "admin") return null;
  return session.user;
}

const KEYS = ["fathom_api_key", "fathom_recording_email", "fathom_title_filter", "fathom_last_pull_date", "fathom_last_pull_status"];

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.appSetting.findMany({ where: { key: { in: KEYS } } });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  return NextResponse.json({
    fathomApiKey: map["fathom_api_key"] ? "••••••••" : "",
    fathomApiKeySet: !!map["fathom_api_key"],
    fathomRecordingEmail: map["fathom_recording_email"] ?? "",
    fathomTitleFilter: map["fathom_title_filter"] ?? "Q&A",
    lastPullDate: map["fathom_last_pull_date"] ?? null,
    lastPullStatus: map["fathom_last_pull_status"] ?? null,
  });
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fathomApiKey, fathomRecordingEmail, fathomTitleFilter } = await req.json();

  const updates: { key: string; value: string }[] = [];
  if (fathomApiKey && fathomApiKey !== "••••••••") updates.push({ key: "fathom_api_key", value: fathomApiKey });
  if (fathomRecordingEmail !== undefined) updates.push({ key: "fathom_recording_email", value: fathomRecordingEmail });
  if (fathomTitleFilter !== undefined) updates.push({ key: "fathom_title_filter", value: fathomTitleFilter || "Q&A" });

  await Promise.all(
    updates.map((u) =>
      prisma.appSetting.upsert({
        where: { key: u.key },
        update: { value: u.value },
        create: { key: u.key, value: u.value },
      })
    )
  );

  return NextResponse.json({ success: true });
}
