import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactForMember(snippet: string, otherNames: string[]): string {
  let s = snippet;
  for (const fullName of otherNames) {
    if (!fullName) continue;
    s = s.replace(new RegExp(escapeRegex(fullName), "gi"), "a member");
    const firstName = fullName.split(" ")[0];
    if (firstName.length > 3) {
      s = s.replace(new RegExp(`\\b${escapeRegex(firstName)}\\b`, "gi"), "a member");
    }
  }
  return s;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ callId: string }> }) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = user.role === "admin";
  const { callId } = await params;

  const call = await prisma.qACall.findUnique({ where: { id: callId } });
  if (!call || call.status !== "processed") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allEntries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      sourceType: "qa_call",
      sourceId: callId,
      status: "approved",
    },
  });

  const visibleEntries = isAdmin
    ? allEntries
    : allEntries.filter((e) => e.isGeneralTeaching || e.memberId === user.id);

  let otherNames: string[] = [];
  if (!isAdmin) {
    const otherMembers = await prisma.user.findMany({
      where: { role: "foundations_member", id: { not: user.id } },
      select: { fullName: true },
    });
    otherNames = otherMembers.map((m) => m.fullName).filter(Boolean) as string[];
  }

  const principles = [...new Set(visibleEntries.flatMap((e) => e.principles as string[]))];

  const moments = visibleEntries
    .sort((a, b) => (a.timestampStart ?? 0) - (b.timestampStart ?? 0))
    .map((e) => ({
      id: e.id,
      subTopic: e.subTopic,
      summary: isAdmin ? e.summary : redactForMember(e.summary, otherNames),
      principles: e.principles as string[],
      timestampStart: e.timestampStart ?? null,
      timestampEnd: e.timestampEnd ?? null,
      isGeneralTeaching: e.isGeneralTeaching,
      isMine: e.memberId === user.id,
    }));

  const allLessons = await prisma.courseLesson.findMany({
    where: { published: true },
    include: { section: { select: { title: true, slug: true } } },
  });

  const relatedLessons = allLessons
    .filter((l) => {
      const tags = l.principleTags as string[];
      return tags.some((t) => principles.includes(t));
    })
    .slice(0, 8);

  return NextResponse.json({
    call: {
      id: call.id,
      title: call.title,
      callDate: call.callDate.toISOString(),
      duration: call.duration ?? null,
      fathomShareUrl: call.fathomShareUrl,
      principles,
    },
    moments,
    relatedLessons: relatedLessons.map((l) => ({
      id: l.id,
      title: l.title,
      slug: l.slug,
      sectionTitle: l.section.title,
      sectionSlug: l.section.slug,
      principleTags: l.principleTags as string[],
    })),
  });
}
