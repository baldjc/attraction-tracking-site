import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const calls = await prisma.qACall.findMany({
    where: { status: "processed" },
    orderBy: { callDate: "desc" },
  });

  const months: {
    label: string;
    calls: {
      id: string;
      title: string;
      callDate: string;
      duration: number | null;
      fathomShareUrl: string;
      summary: string;
      principles: string[];
      momentCount: number;
    }[];
  }[] = [];

  const monthMap = new Map<string, (typeof months)[number]>();

  for (const call of calls) {
    const entries = await prisma.knowledgeBaseEntry.findMany({
      where: {
        sourceType: "qa_call",
        sourceId: call.id,
        status: "approved",
        OR: [{ isGeneralTeaching: true }, { memberId: user.id }],
      },
    });

    const allPrinciples = [...new Set(entries.flatMap((e) => e.principles as string[]))];
    const generalEntries = entries.filter((e) => e.isGeneralTeaching);
    const summary = generalEntries
      .slice(0, 2)
      .map((e) => e.summary)
      .filter(Boolean)
      .join(" ");

    const d = new Date(call.callDate);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    if (!monthMap.has(monthKey)) {
      const bucket = { label: monthLabel, calls: [] as (typeof months)[number]["calls"] };
      monthMap.set(monthKey, bucket);
      months.push(bucket);
    }

    monthMap.get(monthKey)!.calls.push({
      id: call.id,
      title: call.title,
      callDate: call.callDate.toISOString(),
      duration: call.duration ?? null,
      fathomShareUrl: call.fathomShareUrl,
      summary,
      principles: allPrinciples,
      momentCount: entries.length,
    });
  }

  return NextResponse.json({ months });
}
