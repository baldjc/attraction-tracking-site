import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, thumbnailBase64, thumbnailMimeType } = await req.json();
  if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarProfile: true },
  });

  const latestAudit = await prisma.audit.findFirst({
    where: { userId: user.id, auditType: "baseline" },
    orderBy: { createdAt: "desc" },
    select: { scores: true },
  });

  const avatarText = dbUser?.avatarProfile
    ? JSON.stringify(dbUser.avatarProfile)
    : "No avatar saved";

  const titleFrameworksScore = latestAudit?.scores
    ? (latestAudit.scores as any)?.title_frameworks?.score ?? "N/A"
    : "N/A";

  const systemPrompt = `You are a YouTube title and thumbnail analyst for Attraction by Video members. You analyse title-thumbnail combinations for their ability to attract clicks from the member's specific avatar.

MEMBER'S AVATAR:
${avatarText}

MEMBER'S BASELINE TITLE FRAMEWORKS SCORE: ${titleFrameworksScore}

Analyse in this order:

1. THUMBNAIL ANALYSIS (score 0-20 for cognitive dissonance):
   - Does the image create curiosity or tension?
   - Is there a clear focal point?
   - Does it contrast with what the viewer expects?
   - Would the AVATAR specifically stop scrolling for this?
   - Emotional trigger assessment
   - Colour and composition effectiveness
   - Suggested improvements (be specific — what to change, add, or remove)

2. TITLE ANALYSIS (score 0-20 for cognitive dissonance):
   - Which framework does it use (or fail to use)?
   - Does it create curiosity, urgency, or emotional tension?
   - Is it specific to the avatar?
   - Grade 5 language check
   - Power word assessment
   - Generate 3 improved title alternatives using proven frameworks

   Also score against Attraction principles:
   - Title Frameworks (0-10): Does it use a proven pattern?
   - Approve the Click potential (0-10): Will the viewer know what to expect?
   - Avatar Clarity (0-10): Would the avatar specifically feel this is for THEM?

3. COMBINED ANALYSIS (score 0-20 for cognitive dissonance):
   - Do the title and thumbnail tell a complementary story?
   - Is there tension between them (good) or redundancy (bad)?
   - Would the avatar click this specific combination?
   - Overall effectiveness rating
   - Suggested improvements for the combination

Return ONLY valid JSON in this exact structure:

{
  "thumbnail": {
    "score": 0,
    "observations": ["observation 1", "observation 2"],
    "improvements": ["improvement 1", "improvement 2"]
  },
  "title": {
    "score": 0,
    "framework_used": "name or none",
    "curiosity_score": 0,
    "avatar_specific": true,
    "grade_5_ok": true,
    "power_words": ["word1"],
    "alternatives": ["Alt title 1", "Alt title 2", "Alt title 3"],
    "attraction_scores": {
      "title_frameworks": 0,
      "approve_the_click": 0,
      "avatar_clarity": 0
    },
    "observations": ["observation 1"]
  },
  "combined": {
    "score": 0,
    "complementary": true,
    "avatar_would_click": true,
    "observations": ["observation 1"],
    "improvements": ["improvement 1"]
  },
  "follow_up": "Would you like me to suggest alternative thumbnail concepts or refine any of the title options?"
}`;

  const userContent: Anthropic.MessageParam["content"] = thumbnailBase64
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: (thumbnailMimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: thumbnailBase64,
          },
        },
        { type: "text", text: `Analyse this title and thumbnail combination.\n\nTitle: "${title}"\n\nPlease provide your full analysis as JSON.` },
      ]
    : `Analyse this title (no thumbnail provided — analyse title only).\n\nTitle: "${title}"\n\nFor thumbnail fields, return score: 0 and note that no image was provided. Provide your full analysis as JSON.`;

  const customSetting = await prisma.appSetting.findUnique({ where: { key: "title_thumbnail_analyzer_prompt" } });
  const finalSystemPrompt = customSetting?.value ?? systemPrompt;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: finalSystemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  try {
    const parsed = JSON.parse(extracted);

    // Save the analysis for tracking
    await prisma.titleAnalysis.create({
      data: {
        userId: user.id,
        videoTitle: title,
        scores: parsed,
      },
    });

    return NextResponse.json({ result: parsed });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
