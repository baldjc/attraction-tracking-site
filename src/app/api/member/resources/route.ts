import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const ASSUMED_CALL_DURATION = 5400; // 90 minutes default
const MAX_OCCURRENCES_PER_SOURCE = 5;
const TRANSCRIPT_PAGE_SIZE = 20;

async function requireMember() {
  const session = await auth();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({ where: { email: (session.user as any).email! } });
  return user;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactMemberNames(
  snippet: string,
  otherNames: string[],
): string {
  let redacted = snippet;
  for (const fullName of otherNames) {
    if (!fullName) continue;
    redacted = redacted.replace(new RegExp(escapeRegex(fullName), "gi"), "a member");
    const firstName = fullName.split(" ")[0];
    if (firstName.length > 3) {
      redacted = redacted.replace(
        new RegExp(`\\b${escapeRegex(firstName)}\\b`, "gi"),
        "a member",
      );
    }
  }
  return redacted;
}

interface OccurrenceMatch {
  snippet: string;
  charIdx: number;
  estimatedTimestamp: number;
}

function extractOccurrences(
  transcript: string,
  query: string,
  maxOccurrences = MAX_OCCURRENCES_PER_SOURCE,
): OccurrenceMatch[] {
  const results: OccurrenceMatch[] = [];
  const lower = transcript.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let startPos = 0;

  while (results.length < maxOccurrences) {
    const idx = lower.indexOf(lowerQuery, startPos);
    if (idx === -1) break;

    const snippetStart = Math.max(0, idx - 100);
    const snippetEnd = Math.min(transcript.length, idx + query.length + 100);
    let snippet = transcript.slice(snippetStart, snippetEnd).trim();
    if (snippetStart > 0) snippet = "\u2026" + snippet;
    if (snippetEnd < transcript.length) snippet = snippet + "\u2026";

    const estimatedTimestamp = Math.round((idx / transcript.length) * ASSUMED_CALL_DURATION);
    results.push({ snippet, charIdx: idx, estimatedTimestamp });
    startPos = idx + query.length;
  }

  return results;
}

export async function GET(req: NextRequest) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const principle = searchParams.get("principle");
  const search = searchParams.get("search")?.trim() ?? "";
  const sourceType = searchParams.get("sourceType");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const txOffset = parseInt(searchParams.get("txOffset") ?? "0");
  const isSearchRequest = !!(search || searchParams.get("txOffset") !== null && searchParams.has("txOffset"));

  // --- Date-range: resolve QACall IDs in range (used for filtering) ---
  let callIdsInRange: string[] | null = null;
  if (dateFrom || dateTo) {
    const callDateFilter: Record<string, Date> = {};
    if (dateFrom) callDateFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      callDateFilter.lte = d;
    }
    const callsInRange = await prisma.qACall.findMany({
      where: { callDate: callDateFilter },
      select: { id: true },
    });
    callIdsInRange = callsInRange.map((c) => c.id);
  }

  // --- Privacy: fetch other member names for redaction ---
  const otherMembers = await prisma.user.findMany({
    where: { id: { not: user.id } },
    select: { fullName: true },
  });
  const otherNames = otherMembers
    .map((m) => m.fullName)
    .filter((n): n is string => !!n && n.trim().length > 0);

  // ============================================================
  // BROWSE MODE: no search term — return flat array as before
  // ============================================================
  if (!search && !searchParams.has("txOffset")) {
    const where: Record<string, unknown> = {
      status: "approved",
    };

    if (callIdsInRange !== null) {
      where.AND = [
        {
          OR: [
            { isGeneralTeaching: true },
            { memberId: user.id, isGeneralTeaching: false },
          ],
        },
        {
          OR: [
            { sourceType: "course_lesson" },
            { sourceType: "qa_call", sourceId: { in: callIdsInRange } },
          ],
        },
      ];
    } else {
      where.OR = [
        { isGeneralTeaching: true },
        { memberId: user.id, isGeneralTeaching: false },
      ];
    }

    if (principle) where.principles = { has: principle };
    if (sourceType) where.sourceType = sourceType;

    const entries = await prisma.knowledgeBaseEntry.findMany({
      where,
      include: {
        member: { select: { id: true, fullName: true } },
        savedItems: { where: { userId: user.id }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const lessonIds = [...new Set(entries.filter((e) => e.sourceType === "course_lesson").map((e) => e.sourceId))];
    const callIds = [...new Set(entries.filter((e) => e.sourceType === "qa_call").map((e) => e.sourceId))];

    const [lessons, calls] = await Promise.all([
      lessonIds.length > 0
        ? prisma.courseLesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true, lessonNumber: true, skoolUrl: true } })
        : [],
      callIds.length > 0
        ? prisma.qACall.findMany({ where: { id: { in: callIds } }, select: { id: true, title: true, callDate: true, fathomShareUrl: true } })
        : [],
    ]);

    const lessonMap = Object.fromEntries(lessons.map((l) => [l.id, l]));
    const callMap = Object.fromEntries(calls.map((c) => [c.id, c]));

    return NextResponse.json(
      entries.map((e) => ({
        id: e.id,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        principles: e.principles,
        subTopic: e.subTopic,
        summary: e.summary,
        searchableText: e.searchableText,
        timestampStart: e.timestampStart,
        timestampEnd: e.timestampEnd,
        isGeneralTeaching: e.isGeneralTeaching,
        memberId: e.memberId,
        isSaved: e.savedItems.length > 0,
        source: e.sourceType === "course_lesson"
          ? lessonMap[e.sourceId] ?? null
          : callMap[e.sourceId] ?? null,
      }))
    );
  }

  // ============================================================
  // SEARCH MODE: return { entries, transcriptMatches, transcriptTotal }
  // ============================================================

  // --- 1. Tagged KB entries ---
  const kbWhere: Record<string, unknown> = { status: "approved" };

  if (callIdsInRange !== null) {
    kbWhere.AND = [
      {
        OR: [
          { isGeneralTeaching: true },
          { memberId: user.id, isGeneralTeaching: false },
        ],
      },
      {
        OR: [
          { sourceType: "course_lesson" },
          { sourceType: "qa_call", sourceId: { in: callIdsInRange } },
        ],
      },
    ];
  } else {
    kbWhere.OR = [
      { isGeneralTeaching: true },
      { memberId: user.id, isGeneralTeaching: false },
    ];
  }

  if (principle) kbWhere.principles = { has: principle };

  let kbEntries = await prisma.knowledgeBaseEntry.findMany({
    where: kbWhere,
    include: {
      member: { select: { id: true, fullName: true } },
      savedItems: { where: { userId: user.id }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Full-text filter
  if (search) {
    kbEntries = kbEntries.filter((e) => {
      const haystack = `${e.subTopic} ${e.summary} ${e.searchableText} ${e.principles.join(" ")}`.toLowerCase();
      return search.toLowerCase().split(" ").every((word) => haystack.includes(word));
    });
  }

  // Hydrate source info
  const lessonIds = [...new Set(kbEntries.filter((e) => e.sourceType === "course_lesson").map((e) => e.sourceId))];
  const callIds = [...new Set(kbEntries.filter((e) => e.sourceType === "qa_call").map((e) => e.sourceId))];
  const [lessons, calls] = await Promise.all([
    lessonIds.length > 0
      ? prisma.courseLesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true, lessonNumber: true, skoolUrl: true } })
      : [],
    callIds.length > 0
      ? prisma.qACall.findMany({ where: { id: { in: callIds } }, select: { id: true, title: true, callDate: true, fathomShareUrl: true } })
      : [],
  ]);
  const lessonMap = Object.fromEntries(lessons.map((l) => [l.id, l]));
  const callMap = Object.fromEntries(calls.map((c) => [c.id, c]));

  const entries = kbEntries.map((e) => ({
    id: e.id,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    principles: e.principles,
    subTopic: e.subTopic,
    summary: e.summary,
    searchableText: e.searchableText,
    timestampStart: e.timestampStart,
    timestampEnd: e.timestampEnd,
    isGeneralTeaching: e.isGeneralTeaching,
    memberId: e.memberId,
    isSaved: e.savedItems.length > 0,
    source: e.sourceType === "course_lesson"
      ? lessonMap[e.sourceId] ?? null
      : callMap[e.sourceId] ?? null,
  }));

  // --- 2. Raw transcript search ---
  interface TranscriptMatch {
    id: string;
    sourceType: "qa_call" | "course_lesson";
    title: string;
    date?: string;
    lessonNumber?: string;
    fathomShareUrl?: string;
    skoolUrl?: string;
    snippet: string;
    estimatedTimestamp: number;
  }

  const allTranscriptMatches: TranscriptMatch[] = [];

  if (search) {
    // Q&A Calls
    const callFilter: Record<string, unknown> = {
      fullTranscript: { contains: search, mode: "insensitive" },
    };
    if (callIdsInRange !== null) {
      callFilter.id = { in: callIdsInRange };
    } else if (dateFrom || dateTo) {
      const callDateFilter: Record<string, Date> = {};
      if (dateFrom) callDateFilter.gte = new Date(dateFrom);
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        callDateFilter.lte = d;
      }
      callFilter.callDate = callDateFilter;
    }

    const matchingCalls = await prisma.qACall.findMany({
      where: callFilter,
      select: { id: true, title: true, callDate: true, fathomShareUrl: true, fullTranscript: true },
      orderBy: { callDate: "desc" },
    });

    for (const call of matchingCalls) {
      const occurrences = extractOccurrences(call.fullTranscript, search);
      for (const occ of occurrences) {
        allTranscriptMatches.push({
          id: `call-${call.id}-${occ.charIdx}`,
          sourceType: "qa_call",
          title: call.title,
          date: call.callDate.toISOString(),
          fathomShareUrl: call.fathomShareUrl,
          snippet: redactMemberNames(occ.snippet, otherNames),
          estimatedTimestamp: occ.estimatedTimestamp,
        });
      }
    }

    // Course Lessons (not date-filtered)
    const matchingLessons = await prisma.courseLesson.findMany({
      where: { fullTranscript: { contains: search, mode: "insensitive" } },
      select: { id: true, title: true, lessonNumber: true, skoolUrl: true, fullTranscript: true },
      orderBy: { lessonNumber: "asc" },
    });

    for (const lesson of matchingLessons) {
      const occurrences = extractOccurrences(lesson.fullTranscript, search);
      for (const occ of occurrences) {
        allTranscriptMatches.push({
          id: `lesson-${lesson.id}-${occ.charIdx}`,
          sourceType: "course_lesson",
          title: lesson.title,
          lessonNumber: lesson.lessonNumber,
          skoolUrl: lesson.skoolUrl,
          snippet: redactMemberNames(occ.snippet, otherNames),
          estimatedTimestamp: occ.estimatedTimestamp,
        });
      }
    }
  }

  const transcriptTotal = allTranscriptMatches.length;
  const transcriptMatches = allTranscriptMatches.slice(txOffset, txOffset + TRANSCRIPT_PAGE_SIZE);

  return NextResponse.json({ entries, transcriptMatches, transcriptTotal });
}
