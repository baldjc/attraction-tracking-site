import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { withRouteErrorHandling } from "@/lib/api-error-wrapper";

// Human-readable label for each principle key. Matches snake_case keys
// produced by the audit engine (src/lib/audit-engine.ts).
const PRINCIPLE_LABELS: Record<string, string> = {
  avatar_clarity: "Avatar Clarity",
  themes_over_topics: "Themes Over Topics",
  arc_attention: "ARC: Attention",
  arc_revelation: "ARC: Revelation",
  arc_connection: "ARC: Connection",
  title_frameworks: "Title Frameworks",
  approve_the_click: "Approve The Click",
  lead_magnet_system: "Lead Magnet System",
  curiosity_bridges: "Curiosity Bridges",
  show_dont_tell: "Show Don't Tell",
  values_peppering: "Values Peppering",
  connection_language: "Connection Language",
  story_proof: "Story Proof",
  grade_5_language: "Grade-5 Language",
  binge_architecture: "Binge Architecture",
  consistency: "Consistency",
};

type ScoreEntry = { score: number | null; evidence?: string };

export const GET = withRouteErrorHandling("member/dashboard/next-step", GET_impl);

async function GET_impl() {
  // Impersonation-aware so the next-step suggestion resolves to the member.
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the latest channel audit
  const latest = await prisma.audit.findFirst({
    where: { userId: user.id, auditType: { not: "single_video" } },
    orderBy: { createdAt: "desc" },
    select: { scores: true },
  });

  if (!latest || !latest.scores) {
    return NextResponse.json(null);
  }

  const scores = latest.scores as Record<string, ScoreEntry>;

  // Lowest scoring principle (skip null scores)
  let lowestKey: string | null = null;
  let lowestScore = Number.POSITIVE_INFINITY;
  for (const [key, entry] of Object.entries(scores)) {
    if (!entry || typeof entry.score !== "number") continue;
    if (!(key in PRINCIPLE_LABELS)) continue;
    if (entry.score < lowestScore) {
      lowestScore = entry.score;
      lowestKey = key;
    }
  }

  if (!lowestKey) {
    return NextResponse.json(null);
  }

  const principleLabel = PRINCIPLE_LABELS[lowestKey];

  // Try to find a lesson tagged with this principle
  let lessonHref = `/member/academy?principle=${encodeURIComponent(lowestKey)}`;
  let lessonTopic = principleLabel;
  try {
    const lesson = await prisma.resourceLesson.findFirst({
      where: { principles: { has: lowestKey } },
      orderBy: { sessionNumber: "asc" },
      select: { id: true, title: true },
    });
    if (lesson) {
      lessonHref = `/member/academy/lessons/${lesson.id}`;
      lessonTopic = lesson.title;
    }
  } catch {
    // Lesson lookup is best-effort
  }

  return NextResponse.json({
    principleLabel,
    score: lowestScore,
    lessonHref,
    lessonDuration: "10",
    lessonTopic,
  });
}
