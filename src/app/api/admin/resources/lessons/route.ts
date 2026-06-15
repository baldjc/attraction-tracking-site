import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const PRINCIPLES = [
  "Avatar Clarity",
  "Themes Over Topics",
  "Binge Architecture",
  "Lead Magnet System",
  "Values Peppering",
  "Connection Language",
  "Grade 5 Language",
  "Consistency",
  "ARC Attention",
  "ARC Revelation",
  "ARC Connection",
  "Curiosity Bridges",
  "Story Proof",
  "Show Don't Tell",
  "Title Frameworks",
  "Approve the Click",
];

const SEED_LESSONS = [
  { lessonNumber: "1.1", title: "What Do You Want?", sessionNumber: 1, principles: ["Avatar Clarity"] },
  { lessonNumber: "1.2", title: "Who Do You Want", sessionNumber: 1, principles: ["Avatar Clarity"] },
  { lessonNumber: "1.3", title: "Finding Your Themes", sessionNumber: 1, principles: ["Themes Over Topics", "Binge Architecture"] },
  { lessonNumber: "1.4", title: "The Client Journey & Building Trust", sessionNumber: 1, principles: ["Lead Magnet System"] },
  { lessonNumber: "2.1", title: "Finding Your Authentic Self on Camera", sessionNumber: 2, principles: ["Values Peppering"] },
  { lessonNumber: "2.2", title: "Connection Language", sessionNumber: 2, principles: ["Connection Language", "Grade 5 Language"] },
  { lessonNumber: "2.3", title: "80% Rule Just Publish It", sessionNumber: 2, principles: ["Consistency"] },
  { lessonNumber: "2.4", title: "Content Prep & Batch Shooting", sessionNumber: 2, principles: ["Consistency"] },
  { lessonNumber: "2.5", title: "Content Frameworks PSL & ARC", sessionNumber: 2, principles: ["ARC Attention", "ARC Revelation", "ARC Connection", "Curiosity Bridges", "Story Proof"] },
  { lessonNumber: "2.6", title: "How to Present on Camera", sessionNumber: 2, principles: ["Connection Language"] },
  { lessonNumber: "2.7", title: "Practical Tips for Shooting", sessionNumber: 2, principles: ["Show Don't Tell"] },
  { lessonNumber: "2.8", title: "Get in Your Reps - Homework", sessionNumber: 2, principles: ["Consistency"] },
  { lessonNumber: "3.1", title: "How to do YouTube Research", sessionNumber: 3, principles: ["Themes Over Topics"] },
  { lessonNumber: "3.2", title: "Using the Scripting ARC Method Custom GPT", sessionNumber: 3, principles: ["ARC Attention", "ARC Revelation", "ARC Connection"] },
  { lessonNumber: "3.3", title: "Studio Setup", sessionNumber: 3, principles: ["Show Don't Tell"] },
  { lessonNumber: "3.4", title: "Your First Two Videos", sessionNumber: 3, principles: ["Consistency"] },
  { lessonNumber: "4.1", title: "Packaging Principle & Building Tension", sessionNumber: 4, principles: ["Title Frameworks", "Approve the Click"] },
  { lessonNumber: "4.2", title: "Creating Titles", sessionNumber: 4, principles: ["Title Frameworks"] },
  { lessonNumber: "4.3", title: "Building a Thumbnail", sessionNumber: 4, principles: ["Approve the Click"] },
  { lessonNumber: "4.4", title: "Special Invitation", sessionNumber: 4, principles: ["Lead Magnet System"] },
];

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if ((session.user as any).role !== "admin") return null;
  return session.user;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lessons = await prisma.resourceLesson.findMany({
    orderBy: [{ sessionNumber: "asc" }, { lessonNumber: "asc" }],
  });

  // If no lessons exist yet, seed them
  if (lessons.length === 0) {
    const seeded = await prisma.$transaction(
      SEED_LESSONS.map((l) =>
        prisma.resourceLesson.create({
          data: { ...l, fullTranscript: "" },
        })
      )
    );
    const withCounts = seeded.map((l) => ({ ...l, segmentCount: 0 }));
    return NextResponse.json(withCounts);
  }

  // Get segment counts
  const counts = await prisma.knowledgeBaseEntry.groupBy({
    by: ["sourceId"],
    where: { sourceType: "course_lesson" },
    _count: { id: true },
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.sourceId, c._count.id]));

  return NextResponse.json(lessons.map((l) => ({ ...l, segmentCount: countMap[l.id] ?? 0 })));
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, lessonNumber, sessionNumber, skoolUrl, principles, fullTranscript, autoProcess } = await req.json();
  if (!title || !lessonNumber || !sessionNumber) {
    return NextResponse.json({ error: "title, lessonNumber, and sessionNumber are required" }, { status: 400 });
  }

  const lesson = await prisma.resourceLesson.create({
    data: { title, lessonNumber, sessionNumber, skoolUrl: skoolUrl ?? "", principles: principles ?? [], fullTranscript: fullTranscript ?? "" },
  });

  if (autoProcess && fullTranscript) {
    processLessonTranscript(lesson.id, fullTranscript, lesson.principles, lesson.title).catch(console.error);
  }

  return NextResponse.json(lesson, { status: 201 });
}

export async function processLessonTranscript(lessonId: string, transcript: string, principles: string[], lessonTitle: string) {
  if (!transcript.trim()) return;

  // Delete old segments
  await prisma.knowledgeBaseEntry.deleteMany({ where: { sourceType: "course_lesson", sourceId: lessonId } });

  const prompt = `You are processing a teaching transcript for the Attraction by Video course. The lesson is titled "${lessonTitle}".

Break this transcript into meaningful teaching segments (3-10 segments per lesson). For each segment return a JSON array:
[{ "subTopic": string, "principles": string[], "summary": string (1-2 sentences), "timestampStart": number (approximate seconds), "timestampEnd": number (approximate seconds), "searchableText": string (the transcript chunk) }]

The 16 Attraction principles are: ${PRINCIPLES.join(", ")}.

Assign principles that are actually taught in each segment. Return ONLY valid JSON array, no other text.

Transcript:
${transcript.substring(0, 15000)}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Claude returned no valid JSON array");

  const segments: Array<{
    subTopic: string;
    principles: string[];
    summary: string;
    timestampStart: number;
    timestampEnd: number;
    searchableText: string;
  }> = JSON.parse(jsonMatch[0]);

  await prisma.$transaction(
    segments.map((seg) =>
      prisma.knowledgeBaseEntry.create({
        data: {
          sourceType: "course_lesson",
          sourceId: lessonId,
          principles: seg.principles,
          subTopic: seg.subTopic,
          summary: seg.summary,
          searchableText: seg.searchableText,
          timestampStart: seg.timestampStart,
          timestampEnd: seg.timestampEnd,
          isGeneralTeaching: true,
          status: "approved",
        },
      })
    )
  );
}
