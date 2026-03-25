import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminOrEditor, editorTierFilter } from "@/lib/auth-utils";

const PRINCIPLE_LABELS: Record<string, string> = {
  avatar_clarity: "Avatar Clarity",
  themes_over_topics: "Themes Over Topics",
  arc_attention: "ARC Attention",
  arc_revelation: "ARC Revelation",
  arc_connection: "ARC Connection",
  title_frameworks: "Title Frameworks",
  approve_the_click: "Approve the Click",
  lead_magnet_system: "Lead Magnet System",
  curiosity_bridges: "Curiosity Bridges",
  show_dont_tell: "Show Don't Tell",
  values_peppering: "Values Peppering",
  connection_language: "Connection Language",
  story_proof: "Story Proof",
  grade_5_language: "Grade 5 Language",
  binge_architecture: "Binge Architecture",
  consistency: "Consistency",
};

const QA_ALWAYS = ["lead_magnet_system", "avatar_clarity", "connection_language", "approve_the_click", "curiosity_bridges"];
const QA_IF_LOW = ["arc_attention", "arc_revelation", "values_peppering", "story_proof", "title_frameworks"];

const QA_ALWAYS_PROMPTS: Record<string, string> = {
  lead_magnet_system: "Bring your lead magnet draft for feedback",
  avatar_clarity: "Bring your napkin test for review",
  connection_language: "Bring your next script for review",
  approve_the_click: "Bring your next 3 title/hook combos",
  curiosity_bridges: "Bring a recent script — we'll rewrite transitions live",
};

const QA_IF_LOW_PROMPTS: Record<string, string> = {
  arc_attention: "Bring your most recent opening",
  arc_revelation: "Bring one insight — we'll Value Loop it",
  values_peppering: "Share 5 personal values/interests",
  story_proof: "Bring a client story to structure",
  title_frameworks: "Bring your next 5 title ideas",
};

function extractScore(val: any): number {
  if (typeof val === "number") return val;
  if (val && typeof val === "object" && "score" in val) return Number(val.score);
  return 0;
}

export async function GET(request: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekOf = searchParams.get("weekOf");

  const tierFilter = editorTierFilter(role);
  const users = await prisma.user.findMany({
    where: {
      role: "foundations_member",
      ...tierFilter,
    },
    include: {
      audits: {
        where: { auditType: { in: ["baseline", "monthly"] } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          auditType: true,
          overallScore: true,
          scores: true,
          reportContent: true,
          createdAt: true,
        },
      },
    },
    orderBy: { fullName: "asc" },
  });

  type ScoreMap = Record<string, number>;

  function toScoreMap(scores: any): ScoreMap {
    const result: ScoreMap = {};
    if (!scores || typeof scores !== "object") return result;
    for (const [k, v] of Object.entries(scores)) {
      result[k] = extractScore(v);
    }
    return result;
  }

  const celebrate: Array<{
    name: string;
    userId: string;
    improvements: Array<{ principle: string; from: number; to: number; delta: number }>;
    latestScore: number;
  }> = [];

  const address: Array<{
    name: string;
    userId: string;
    issues: Array<{ principle: string; score: number; trend: "stuck" | "declined"; deltaMonths: number }>;
    latestScore: number;
  }> = [];

  const perMember: Array<{
    userId: string;
    name: string;
    latestScore: number;
    auditId: string;
    auditType: string;
    auditDate: string;
    qaFlags: Array<{ principle: string; prompt: string; score: number }>;
    topGaps: Array<{ principle: string; score: number }>;
    improvements: Array<{ principle: string; from: number; to: number; delta: number }>;
  }> = [];

  const allLatestScores: ScoreMap[] = [];

  for (const user of users) {
    const audits = user.audits;
    if (audits.length === 0) continue;

    const latest = audits[audits.length - 1];
    const latestScores = toScoreMap(latest.scores);
    allLatestScores.push(latestScores);

    const qaFlags: Array<{ principle: string; prompt: string; score: number }> = [];
    for (const key of QA_ALWAYS) {
      if (latestScores[key] != null) {
        qaFlags.push({ principle: PRINCIPLE_LABELS[key], prompt: QA_ALWAYS_PROMPTS[key], score: latestScores[key] });
      }
    }
    for (const key of QA_IF_LOW) {
      const s = latestScores[key];
      if (s != null && s >= 4 && s <= 6) {
        qaFlags.push({ principle: PRINCIPLE_LABELS[key], prompt: QA_IF_LOW_PROMPTS[key], score: s });
      }
    }

    const topGaps = Object.entries(latestScores)
      .filter(([, s]) => s < 5)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 3)
      .map(([k, s]) => ({ principle: PRINCIPLE_LABELS[k] ?? k, score: s }));

    let improvements: Array<{ principle: string; from: number; to: number; delta: number }> = [];

    if (audits.length >= 2) {
      const prev = audits[audits.length - 2];
      const prevScores = toScoreMap(prev.scores);

      const improved: typeof improvements = [];
      const stuck: Array<{ principle: string; score: number; trend: "stuck" | "declined"; deltaMonths: number }> = [];

      for (const key of Object.keys(PRINCIPLE_LABELS)) {
        const curr = latestScores[key] ?? 0;
        const previous = prevScores[key] ?? 0;
        const delta = curr - previous;

        if (delta >= 1) {
          improved.push({ principle: PRINCIPLE_LABELS[key], from: previous, to: curr, delta });
        } else if (delta <= -1) {
          stuck.push({ principle: PRINCIPLE_LABELS[key], score: curr, trend: "declined", deltaMonths: audits.length - 1 });
        } else if (curr < 5 && audits.length >= 3) {
          const older = toScoreMap(audits[audits.length - 3].scores);
          const olderScore = older[key] ?? 0;
          if (Math.abs(curr - olderScore) < 1) {
            stuck.push({ principle: PRINCIPLE_LABELS[key], score: curr, trend: "stuck", deltaMonths: audits.length - 1 });
          }
        }
      }

      improvements = improved.sort((a, b) => b.delta - a.delta);

      if (improved.length > 0) {
        celebrate.push({
          name: user.fullName ?? user.email,
          userId: user.id,
          improvements: improved.slice(0, 3),
          latestScore: latest.overallScore ?? 0,
        });
      }

      if (stuck.length > 0) {
        address.push({
          name: user.fullName ?? user.email,
          userId: user.id,
          issues: stuck.slice(0, 3),
          latestScore: latest.overallScore ?? 0,
        });
      }
    }

    perMember.push({
      userId: user.id,
      name: user.fullName ?? user.email,
      latestScore: latest.overallScore ?? 0,
      auditId: latest.id,
      auditType: latest.auditType,
      auditDate: latest.createdAt.toISOString(),
      qaFlags,
      topGaps,
      improvements,
    });
  }

  const commonGaps: Array<{ principle: string; avgScore: number; memberCount: number }> = [];
  if (allLatestScores.length > 0) {
    for (const key of Object.keys(PRINCIPLE_LABELS)) {
      const scores = allLatestScores.map((s) => s[key]).filter((s) => s != null);
      if (scores.length === 0) continue;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      commonGaps.push({ principle: PRINCIPLE_LABELS[key], avgScore: avg, memberCount: scores.length });
    }
    commonGaps.sort((a, b) => a.avgScore - b.avgScore);
  }

  celebrate.sort((a, b) => b.improvements[0]?.delta - a.improvements[0]?.delta);
  address.sort((a, b) => (a.issues[0]?.score ?? 0) - (b.issues[0]?.score ?? 0));

  return NextResponse.json({
    celebrate,
    address,
    commonGaps: commonGaps.slice(0, 5),
    perMember,
    totalMembers: users.length,
    membersWithAudits: perMember.length,
    generatedAt: new Date().toISOString(),
  });
}
