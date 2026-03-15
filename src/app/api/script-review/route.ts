import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { SCRIPT_REVIEW_PROMPT } from "@/lib/audit-engine";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function extractScore(val: any): number {
  if (typeof val === "number") return val;
  if (val && typeof val === "object" && "score" in val) return Number(val.score);
  return 0;
}

function calcOverall(scores: any): number {
  const vals = Object.values(scores).map((v: any) => extractScore(v));
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id;
  const memberName = (session.user as any).name ?? session.user.email ?? "Creator";

  const { videoTitle, scriptText } = await req.json();
  if (!videoTitle?.trim() || !scriptText?.trim()) {
    return NextResponse.json({ error: "Video title and script are required" }, { status: 400 });
  }
  if (scriptText.trim().length < 50) {
    return NextResponse.json({ error: "Script is too short — paste at least a paragraph." }, { status: 400 });
  }

  const userMessage = `Please review this script/transcript.

Member name: ${memberName}
Video title: "${videoTitle}"

SCRIPT:
${scriptText}

CRITICAL: You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation text before or after the JSON. The "three_improvements" must include EXACT quotes from the script above, not generic advice.`;

  console.log(`[script-review] Starting analysis for ${memberName}: "${videoTitle}"`);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: SCRIPT_REVIEW_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = response.content.find((b) => b.type === "text")?.text ?? "";
  console.log("[script-review] Claude stop_reason:", response.stop_reason);
  console.log("[script-review] Response length (chars):", rawText.length);
  console.log("[script-review] Raw response (first 500 chars):", rawText.slice(0, 500));

  // Strip code fences — same approach as audit engine
  const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

  // Extract outermost JSON object
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[script-review] No JSON object found in response. Full response:", rawText.slice(0, 1000));
    return NextResponse.json({ error: "Failed to parse AI response. Please try again." }, { status: 500 });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr: any) {
    console.error("[script-review] JSON parse failed:", parseErr.message);
    console.error("[script-review] Raw JSON (first 500 chars):", jsonMatch[0].slice(0, 500));
    return NextResponse.json({ error: "Failed to parse AI response. Please try again." }, { status: 500 });
  }

  console.log("[script-review] Parsed result keys:", Object.keys(parsed).join(", "));

  const scores = parsed.scores ?? {};
  const overallScore = parsed.overall_score ?? calcOverall(scores);

  const DIMENSION_KEYS = {
    channel_strategy: ["avatar_clarity", "themes_over_topics", "consistency"],
    content_impact: ["arc_attention", "arc_revelation", "arc_connection", "title_frameworks", "approve_the_click", "curiosity_bridges", "show_dont_tell"],
    viewer_connection: ["connection_language", "values_peppering", "story_proof", "grade_5_language"],
    lead_generation: ["lead_magnet_system", "binge_architecture"],
  };

  function dimAvg(keys: string[]) {
    const vals = keys.map((k) => extractScore(scores[k])).filter((v) => v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  const dimensionScores = {
    channel_strategy: dimAvg(DIMENSION_KEYS.channel_strategy),
    content_impact: dimAvg(DIMENSION_KEYS.content_impact),
    viewer_connection: dimAvg(DIMENSION_KEYS.viewer_connection),
    lead_generation: dimAvg(DIMENSION_KEYS.lead_generation),
  };

  const reportContent = {
    one_sentence_diagnosis: parsed.one_sentence_diagnosis ?? null,
    whats_working: parsed.whats_working ?? [],
    three_improvements: parsed.three_improvements ?? [],
    quick_win: parsed.quick_win ?? null,
    dimension_scores: dimensionScores,
  };

  return NextResponse.json({
    videoTitle,
    scores,
    overallScore,
    reportContent,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id;

  const reviews = await prisma.scriptReview.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      videoTitle: true,
      overallScore: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ reviews });
}
