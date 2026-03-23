import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// ── Constants ─────────────────────────────────────────────────
const ASSUMED_CALL_DURATION = 5400; // 90 min fallback
const MAX_RAW_OCCURRENCES = 30;     // collect many, then dedupe + filter + score
const TRANSCRIPT_PAGE_SIZE = 20;
const SNIPPET_RADIUS = 220;         // chars each side of keyword
const DEDUPE_WINDOW_SECS = 60;      // merge occurrences within 60 s of each other
const CHIT_CHAT_TS_CUTOFF = 180;    // first 3 min: extra chit-chat filter

// ── Helpers ───────────────────────────────────────────────────
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GREETING_PATTERNS = [
  /\bhow are you\b/i, /\bgood (morning|afternoon|evening)\b/i,
  /\bhow'?s it going\b/i, /\bthank(?:s| you)\b/i,
  /\bhello\b/i, /\bhi there\b/i, /\bnice to (see|meet) you\b/i,
  /\bwelcome (back|everyone)\b/i, /\bsee you (next|soon|later)\b/i,
  /\btake care\b/i, /\bhave a great\b/i,
];

const FILLER_WORDS = new Set([
  "good","great","amazing","cool","yes","no","okay","ok","yeah","yep","nope",
  "sure","right","exactly","absolutely","definitely","certainly","indeed",
  "perfect","wonderful","awesome","fantastic","excellent","interesting",
]);

/** Count substantive words (ignoring speaker labels and filler). */
function countSubstantiveWords(text: string): number {
  // Strip speaker labels like "Jared:" or "a member:"
  const stripped = text.replace(/^\w[\w ]+:/gm, "").toLowerCase();
  const words = stripped.match(/\b[a-z]{3,}\b/g) ?? [];
  return words.filter((w) => !FILLER_WORDS.has(w)).length;
}

function isChitChat(snippet: string): boolean {
  const greetingHits = GREETING_PATTERNS.filter((p) => p.test(snippet)).length;
  if (greetingHits >= 2) return true;
  const subWords = countSubstantiveWords(snippet);
  if (subWords < 12) return true; // fewer than 12 real words → low value
  return false;
}

/** Build a well-centred snippet around the first keyword occurrence. */
function buildSnippet(transcript: string, idx: number, queryLen: number): string {
  const snippetStart = Math.max(0, idx - SNIPPET_RADIUS);
  const snippetEnd = Math.min(transcript.length, idx + queryLen + SNIPPET_RADIUS);
  let snippet = transcript.slice(snippetStart, snippetEnd).trim();
  if (snippetStart > 0) snippet = "\u2026" + snippet;
  if (snippetEnd < transcript.length) snippet += "\u2026";
  return snippet;
}

interface RawOccurrence {
  charIdx: number;
  estimatedTimestamp: number;
  snippet: string;
  substWords: number;
}

/** Find all occurrences of query in transcript (case-insensitive). */
function findOccurrences(transcript: string, query: string): RawOccurrence[] {
  const results: RawOccurrence[] = [];
  const lower = transcript.toLowerCase();
  const lowerQ = query.toLowerCase();
  let pos = 0;

  while (results.length < MAX_RAW_OCCURRENCES) {
    const idx = lower.indexOf(lowerQ, pos);
    if (idx === -1) break;

    const snippet = buildSnippet(transcript, idx, query.length);
    const estimatedTimestamp = Math.round((idx / transcript.length) * ASSUMED_CALL_DURATION);
    const substWords = countSubstantiveWords(snippet);

    results.push({ charIdx: idx, estimatedTimestamp, snippet, substWords });
    pos = idx + query.length;
  }
  return results;
}

/** Merge occurrences within DEDUPE_WINDOW_SECS of each other → keep longest snippet. */
function deduplicateOccurrences(raw: RawOccurrence[]): RawOccurrence[] {
  if (raw.length === 0) return [];
  const merged: RawOccurrence[] = [];
  let current = raw[0];

  for (let i = 1; i < raw.length; i++) {
    const occ = raw[i];
    if (occ.estimatedTimestamp - current.estimatedTimestamp <= DEDUPE_WINDOW_SECS) {
      // Merge: keep first timestamp, longest snippet, max substWords
      if (occ.snippet.length > current.snippet.length) {
        current = { ...current, snippet: occ.snippet, substWords: occ.substWords };
      }
    } else {
      merged.push(current);
      current = occ;
    }
  }
  merged.push(current);
  return merged;
}

/** Score a match for quality ranking (higher = better). */
function scoreOccurrence(occ: RawOccurrence, transcriptLen: number): number {
  let score = 0;
  const progress = occ.charIdx / transcriptLen; // 0..1

  // Prefer middle of call (20%–80%) — likely coaching content
  if (progress >= 0.1 && progress <= 0.9) score += 20;
  if (progress >= 0.2 && progress <= 0.8) score += 10;

  // Reward substantive content
  score += Math.min(occ.substWords * 2, 40);

  // Penalise early timestamps (likely roll-call/greetings)
  if (occ.estimatedTimestamp < CHIT_CHAT_TS_CUTOFF) score -= 25;

  return score;
}

/** Replace other member names in snippet with "a member". */
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

// ── DB auth helper ────────────────────────────────────────────
async function requireMember() {
  const session = await auth();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({ where: { email: (session.user as any).email! } });
  return user;
}

// ── KB entry where-clause builder ─────────────────────────────
function buildKbWhere(
  userId: string,
  callIdsInRange: string[] | null,
  principle: string | null,
  sourceType?: string | null,
): Record<string, unknown> {
  const where: Record<string, unknown> = { status: "approved" };

  if (callIdsInRange !== null) {
    where.AND = [
      { OR: [{ isGeneralTeaching: true }, { memberId: userId, isGeneralTeaching: false }] },
      { OR: [{ sourceType: "course_lesson" }, { sourceType: "qa_call", sourceId: { in: callIdsInRange } }] },
    ];
  } else {
    where.OR = [{ isGeneralTeaching: true }, { memberId: userId, isGeneralTeaching: false }];
  }

  if (principle) where.principles = { has: principle };
  if (sourceType) where.sourceType = sourceType;
  return where;
}

// ─────────────────────────────────────────────────────────────
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
  const isAdmin = (user as any).role === "admin";

  // ── Date-range: resolve QACall IDs ──
  let callIdsInRange: string[] | null = null;
  if (dateFrom || dateTo) {
    const df: Record<string, Date> = {};
    if (dateFrom) df.gte = new Date(dateFrom);
    if (dateTo) { const d = new Date(dateTo); d.setHours(23, 59, 59, 999); df.lte = d; }
    const hits = await prisma.qACall.findMany({ where: { callDate: df }, select: { id: true } });
    callIdsInRange = hits.map((c) => c.id);
  }

  // ── Other member names for redaction (member-only, not admin) ──
  let otherNames: string[] = [];
  if (!isAdmin) {
    const others = await prisma.user.findMany({
      where: { id: { not: user.id } },
      select: { fullName: true },
    });
    otherNames = others.map((m) => m.fullName).filter((n): n is string => !!n && n.trim().length > 0);
  }

  // ============================================================
  // BROWSE MODE: return flat array
  // ============================================================
  if (!search && !searchParams.has("txOffset")) {
    const where = buildKbWhere(user.id, callIdsInRange, principle, sourceType);

    const dbEntries = await prisma.knowledgeBaseEntry.findMany({
      where,
      include: {
        member: { select: { id: true, fullName: true } },
        savedItems: { where: { userId: user.id }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const lessonIds = [...new Set(dbEntries.filter((e) => e.sourceType === "course_lesson").map((e) => e.sourceId))];
    const callIds  = [...new Set(dbEntries.filter((e) => e.sourceType === "qa_call").map((e) => e.sourceId))];

    const [lessons, calls] = await Promise.all([
      lessonIds.length > 0
        ? prisma.courseLesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true, lessonNumber: true, skoolUrl: true } })
        : [],
      callIds.length > 0
        ? prisma.qACall.findMany({ where: { id: { in: callIds } }, select: { id: true, title: true, callDate: true, fathomShareUrl: true } })
        : [],
    ]);

    const lMap = Object.fromEntries(lessons.map((l) => [l.id, l]));
    const cMap = Object.fromEntries(calls.map((c)  => [c.id, c]));

    return NextResponse.json(dbEntries.map((e) => ({
      id: e.id, sourceType: e.sourceType, sourceId: e.sourceId,
      principles: e.principles, subTopic: e.subTopic, summary: e.summary,
      searchableText: e.searchableText, timestampStart: e.timestampStart,
      timestampEnd: e.timestampEnd, isGeneralTeaching: e.isGeneralTeaching,
      memberId: e.memberId, isSaved: e.savedItems.length > 0,
      source: e.sourceType === "course_lesson" ? lMap[e.sourceId] ?? null : cMap[e.sourceId] ?? null,
    })));
  }

  // ============================================================
  // SEARCH MODE: return { entries, transcriptMatches, transcriptTotal }
  // ============================================================

  // ── 1. Tagged KB entries ──
  const kbWhere = buildKbWhere(user.id, callIdsInRange, principle);

  let kbEntries = await prisma.knowledgeBaseEntry.findMany({
    where: kbWhere,
    include: {
      member: { select: { id: true, fullName: true } },
      savedItems: { where: { userId: user.id }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  if (search) {
    kbEntries = kbEntries.filter((e) => {
      const hay = `${e.subTopic} ${e.summary} ${e.searchableText} ${e.principles.join(" ")}`.toLowerCase();
      return search.toLowerCase().split(" ").every((w) => hay.includes(w));
    });
  }

  const lessonIds = [...new Set(kbEntries.filter((e) => e.sourceType === "course_lesson").map((e) => e.sourceId))];
  const callIds  = [...new Set(kbEntries.filter((e) => e.sourceType === "qa_call").map((e) => e.sourceId))];

  const [lessons, calls] = await Promise.all([
    lessonIds.length > 0
      ? prisma.courseLesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true, lessonNumber: true, skoolUrl: true } })
      : [],
    callIds.length > 0
      ? prisma.qACall.findMany({ where: { id: { in: callIds } }, select: { id: true, title: true, callDate: true, fathomShareUrl: true } })
      : [],
  ]);

  const lMap = Object.fromEntries(lessons.map((l) => [l.id, l]));
  const cMap = Object.fromEntries(calls.map((c)  => [c.id, c]));

  const entries = kbEntries.map((e) => ({
    id: e.id, sourceType: e.sourceType, sourceId: e.sourceId,
    principles: e.principles, subTopic: e.subTopic, summary: e.summary,
    searchableText: e.searchableText, timestampStart: e.timestampStart,
    timestampEnd: e.timestampEnd, isGeneralTeaching: e.isGeneralTeaching,
    memberId: e.memberId, isSaved: e.savedItems.length > 0,
    source: e.sourceType === "course_lesson" ? lMap[e.sourceId] ?? null : cMap[e.sourceId] ?? null,
  }));

  // ── 2. Raw transcript search ──
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
    qualityScore: number;
  }

  const allMatches: TranscriptMatch[] = [];

  if (search) {
    // ── Q&A Calls ──
    const callFilter: Record<string, unknown> = {
      fullTranscript: { contains: search, mode: "insensitive" },
    };
    if (callIdsInRange !== null) {
      callFilter.id = { in: callIdsInRange };
    } else if (dateFrom || dateTo) {
      const df: Record<string, Date> = {};
      if (dateFrom) df.gte = new Date(dateFrom);
      if (dateTo) { const d = new Date(dateTo); d.setHours(23, 59, 59, 999); df.lte = d; }
      callFilter.callDate = df;
    }

    const matchingCalls = await prisma.qACall.findMany({
      where: callFilter,
      select: { id: true, title: true, callDate: true, fathomShareUrl: true, fullTranscript: true },
      orderBy: { callDate: "desc" },
    });

    for (const call of matchingCalls) {
      const raw = findOccurrences(call.fullTranscript, search);
      const deduped = deduplicateOccurrences(raw);

      for (const occ of deduped) {
        // Skip early chit-chat
        if (occ.estimatedTimestamp < CHIT_CHAT_TS_CUTOFF && isChitChat(occ.snippet)) continue;
        // Skip low-value matches outside early section too
        if (occ.substWords < 8) continue;

        const snippet = isAdmin ? occ.snippet : redactForMember(occ.snippet, otherNames);
        const qualityScore = scoreOccurrence(occ, call.fullTranscript.length);

        allMatches.push({
          id: `call-${call.id}-${occ.charIdx}`,
          sourceType: "qa_call",
          title: call.title,
          date: call.callDate.toISOString(),
          fathomShareUrl: call.fathomShareUrl,
          snippet,
          estimatedTimestamp: occ.estimatedTimestamp,
          qualityScore,
        });
      }
    }

    // ── Course Lessons (no date filter) ──
    const matchingLessons = await prisma.courseLesson.findMany({
      where: { fullTranscript: { contains: search, mode: "insensitive" } },
      select: { id: true, title: true, lessonNumber: true, skoolUrl: true, fullTranscript: true },
      orderBy: { lessonNumber: "asc" },
    });

    for (const lesson of matchingLessons) {
      const raw = findOccurrences(lesson.fullTranscript, search);
      const deduped = deduplicateOccurrences(raw);

      for (const occ of deduped) {
        if (occ.substWords < 8) continue;

        const snippet = isAdmin ? occ.snippet : redactForMember(occ.snippet, otherNames);
        const qualityScore = scoreOccurrence(occ, lesson.fullTranscript.length);

        allMatches.push({
          id: `lesson-${lesson.id}-${occ.charIdx}`,
          sourceType: "course_lesson",
          title: lesson.title,
          lessonNumber: lesson.lessonNumber,
          skoolUrl: lesson.skoolUrl,
          snippet,
          estimatedTimestamp: occ.estimatedTimestamp,
          qualityScore,
        });
      }
    }

    // Sort by quality descending
    allMatches.sort((a, b) => b.qualityScore - a.qualityScore);
  }

  const transcriptTotal = allMatches.length;
  // Strip qualityScore from response
  const transcriptMatches = allMatches
    .slice(txOffset, txOffset + TRANSCRIPT_PAGE_SIZE)
    .map(({ qualityScore: _q, ...m }) => m);

  return NextResponse.json({ entries, transcriptMatches, transcriptTotal });
}
