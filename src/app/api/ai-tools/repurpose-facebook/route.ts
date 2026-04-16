import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { getAvatarData } from "@/lib/avatar-utils";
import { maybeSavePlanArtifact } from "@/lib/save-plan-artifact";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VOICE_MAP: Record<string, string> = {
  direct: "Direct, data-grounded, conversational. Not salesy. No fluff. Confident but not arrogant. Speak plainly and respect the reader's intelligence.",
  warm: "Warm, encouraging, and personal. Like a trusted friend sharing advice. Approachable but still credible.",
  authoritative: "Authoritative and expert. Lead with confidence and credibility. Back claims with experience. Professional but not stuffy.",
};

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transcript, title, link, contentPlanId } = await req.json() as {
    transcript: string;
    title: string;
    link?: { label: string; url: string };
    contentPlanId?: string;
  };
  if (!transcript || !title) {
    return NextResponse.json({ error: "Missing transcript or title" }, { status: 400 });
  }
  if (transcript.length > 50000) {
    return NextResponse.json({ error: "Transcript exceeds 50,000 character limit" }, { status: 400 });
  }

  const [dbUser, avatarData] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        repurposeName: true,
        repurposeBusiness: true,
        repurposeVoice: true,
      },
    }),
    getAvatarData(user.id),
  ]);

  const memberName = dbUser?.repurposeName || "the author";
  const businessName = dbUser?.repurposeBusiness || "the business";
  const voiceStyle = VOICE_MAP[dbUser?.repurposeVoice || "direct"] || VOICE_MAP.direct;
  const avatarText = avatarData.avatarProfile ? JSON.stringify(avatarData.avatarProfile) : "No avatar saved";

  const linkInstruction = link
    ? `\nLINK TO INCLUDE: ${link.label} — ${link.url}\nInclude this link naturally in the first_comment field. Frame it as a helpful resource, not a sales pitch.\n`
    : "";

  const systemPrompt = `You are a Facebook content writer for ${memberName} at ${businessName}.

MEMBER AVATAR:
${avatarText}

VOICE STYLE: ${voiceStyle}
${linkInstruction}
Write a Facebook post based on the video transcript provided.

RULES:
- 150–300 words for the post body
- Structure: hook line (question or bold statement) → 3–5 short paragraphs delivering one key insight → soft CTA ("I broke this down in detail — link in comments")
- The first_comment field contains the link text only (Facebook suppresses reach when links appear in the post body)
- Tone: conversational, first-person, like telling a friend what you just learned. Direct, no hype.
- Maximum 3 relevant hashtags — include in the hashtags array. If fewer than 3 feel natural, use fewer.
- No emojis unless they genuinely serve the message — not decorative
- Canadian spelling throughout (colour, neighbour, etc.)
- NEVER use dashes of any kind — no em dashes, en dashes, or hyphens used as pauses. Rewrite any sentence that would require a dash using commas, periods, or new sentences instead.

Respond ONLY with valid JSON, no markdown fences:
{
  "post_body": "...",
  "first_comment": "Great breakdown in this week's video: [Your video URL here]",
  "hashtags": ["hashtag1", "hashtag2"]
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: `Video Title: "${title}"\n\nTranscript:\n${transcript}\n\nWrite the Facebook post as JSON.` }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  try {
    const parsed = JSON.parse(extracted);
    const saved = await prisma.repurposedContent.create({
      data: {
        userId: user.id,
        videoTitle: title,
        toolType: "facebook",
        output: parsed,
      },
    });
    const planSave = await maybeSavePlanArtifact({
      contentPlanId,
      userId: user.id,
      type: "repurpose_facebook",
      content: JSON.stringify(parsed),
      metadata: {
        transcript_excerpt: transcript.slice(0, 300),
        prompt_used: "facebook",
        videoTitle: title,
        repurposedContentId: saved.id,
        savedAt: new Date().toISOString(),
      },
    });
    return NextResponse.json({ result: parsed, id: saved.id, savedToPlan: planSave.saved });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
