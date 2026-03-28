import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const principles = searchParams.getAll("principle");

  if (principles.length === 0) {
    return NextResponse.json({ moments: [] });
  }

  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      sourceType: "qa_call",
      status: "approved",
      principles: { hasSome: principles },
      OR: [
        { isGeneralTeaching: true },
        { memberId: user.id },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (entries.length === 0) {
    return NextResponse.json({ moments: [] });
  }

  const callIds = [...new Set(entries.map((e) => e.sourceId))];
  const calls = await prisma.qACall.findMany({
    where: { id: { in: callIds } },
    select: { id: true, title: true, callDate: true, fathomShareUrl: true },
  });
  const callMap = new Map(calls.map((c) => [c.id, c]));

  const grouped = new Map<string, { call: typeof calls[0]; entries: typeof entries }>();
  for (const entry of entries) {
    const call = callMap.get(entry.sourceId);
    if (!call) continue;
    if (!grouped.has(entry.sourceId)) {
      grouped.set(entry.sourceId, { call, entries: [] });
    }
    grouped.get(entry.sourceId)!.entries.push(entry);
  }

  const moments = Array.from(grouped.values()).map(({ call, entries: callEntries }) => ({
    callId: call.id,
    callTitle: call.title,
    callDate: call.callDate,
    fathomShareUrl: call.fathomShareUrl,
    entries: callEntries.map((e) => ({
      id: e.id,
      summary: e.summary,
      subTopic: e.subTopic,
      principles: e.principles,
      timestampStart: e.timestampStart,
      timestampEnd: e.timestampEnd,
      isGeneralTeaching: e.isGeneralTeaching,
    })),
  }));

  return NextResponse.json({ moments });
}
