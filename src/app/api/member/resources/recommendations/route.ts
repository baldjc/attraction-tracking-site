import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Maps snake_case audit keys → KB display names
export const PRINCIPLE_KEY_MAP: Record<string, string> = {
  avatar_clarity: "Avatar Clarity",
  themes_over_topics: "Themes Over Topics",
  binge_architecture: "Binge Architecture",
  lead_magnet_system: "Lead Magnet System",
  values_peppering: "Values Peppering",
  connection_language: "Connection Language",
  grade_5_language: "Grade 5 Language",
  consistency: "Consistency",
  arc_attention: "ARC Attention",
  arc_revelation: "ARC Revelation",
  arc_connection: "ARC Connection",
  curiosity_bridges: "Curiosity Bridges",
  story_proof: "Story Proof",
  show_dont_tell: "Show Don't Tell",
  title_frameworks: "Title Frameworks",
  approve_the_click: "Approve the Click",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const principlesParam = searchParams.get("principles") ?? "";
  const limitPerPrinciple = Math.min(parseInt(searchParams.get("limit") ?? "2"), 5);

  if (!principlesParam) return NextResponse.json([]);

  // Accept both snake_case keys and display names
  const inputPrinciples = principlesParam.split(",").map((p) => p.trim()).filter(Boolean);
  const displayNames = inputPrinciples.map((p) => PRINCIPLE_KEY_MAP[p] ?? p);
  const uniquePrinciples = [...new Set(displayNames)];

  if (!uniquePrinciples.length) return NextResponse.json([]);

  // Fetch approved general-teaching entries for these principles
  const entries = await prisma.knowledgeBaseEntry.findMany({
    where: {
      status: "approved",
      isGeneralTeaching: true,
      principles: { hasSome: uniquePrinciples },
    },
    orderBy: { createdAt: "desc" },
    take: uniquePrinciples.length * limitPerPrinciple * 3, // over-fetch, then dedupe
  });

  // Fetch source details
  const lessonIds = [...new Set(entries.filter((e) => e.sourceType === "course_lesson").map((e) => e.sourceId))];
  const callIds = [...new Set(entries.filter((e) => e.sourceType === "qa_call").map((e) => e.sourceId))];

  const [lessons, calls] = await Promise.all([
    lessonIds.length > 0
      ? prisma.resourceLesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true, lessonNumber: true, skoolUrl: true } })
      : [],
    callIds.length > 0
      ? prisma.qACall.findMany({ where: { id: { in: callIds } }, select: { id: true, title: true, callDate: true, fathomShareUrl: true } })
      : [],
  ]);

  const lessonMap = Object.fromEntries(lessons.map((l) => [l.id, l]));
  const callMap = Object.fromEntries(calls.map((c) => [c.id, c]));

  // Group by principle, pick top N per principle, deduplicate entry IDs
  const seenIds = new Set<string>();
  const result: object[] = [];

  for (const principle of uniquePrinciples) {
    const matches = entries.filter((e) => e.principles.includes(principle) && !seenIds.has(e.id));
    const picked = matches.slice(0, limitPerPrinciple);
    for (const e of picked) {
      seenIds.add(e.id);
      result.push({
        id: e.id,
        sourceType: e.sourceType,
        principles: e.principles,
        subTopic: e.subTopic,
        summary: e.summary,
        timestampStart: e.timestampStart,
        primaryPrinciple: principle,
        source: e.sourceType === "course_lesson"
          ? lessonMap[e.sourceId] ?? null
          : callMap[e.sourceId] ?? null,
      });
    }
  }

  return NextResponse.json(result);
}
