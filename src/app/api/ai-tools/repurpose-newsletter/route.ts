import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { DEFAULT_NEWSLETTER_PROMPT, applyNewsletterTokens } from "@/lib/repurpose-prompts";
import { getAvatarData } from "@/lib/avatar-utils";
import { maybeSavePlanArtifact } from "@/lib/save-plan-artifact";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VOICE_MAP: Record<string, string> = {
  direct: "Direct, data-grounded, conversational. Not salesy. No fluff. Confident but not arrogant. Speak plainly and respect the reader's intelligence.",
  warm: "Warm, encouraging, and personal. Like a trusted friend sharing advice. Approachable but still credible. Use 'you' and 'we' naturally.",
  authoritative: "Authoritative and expert. Lead with confidence and credibility. Back claims with experience. Professional but not stuffy.",
};

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transcript, title, newsletterUrl, contentPlanId, feedback } = await req.json();
  if (!transcript || !title) {
    return NextResponse.json({ error: "Missing transcript or title" }, { status: 400 });
  }
  if (transcript.length > 50000) {
    return NextResponse.json({ error: "Transcript exceeds 50,000 character limit" }, { status: 400 });
  }
  if (typeof feedback === "string" && feedback.length > 1000) {
    return NextResponse.json({ error: "Feedback exceeds 1,000 character limit" }, { status: 400 });
  }
  const trimmedFeedback = typeof feedback === "string" ? feedback.trim() : "";

  const [dbUser, promptSetting, avatarData] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        repurposeName: true,
        repurposeBusiness: true,
        repurposeListSize: true,
        repurposeVoice: true,
      },
    }),
    prisma.appSetting.findUnique({ where: { key: "repurpose_newsletter_prompt" } }),
    getAvatarData(user.id),
  ]);

  const memberName = dbUser?.repurposeName || "the author";
  const businessName = dbUser?.repurposeBusiness || "the business";
  const listSize = dbUser?.repurposeListSize || "";
  const listSizeText = listSize ? ` of ${listSize}+ subscribers` : "";
  const voiceStyle = VOICE_MAP[dbUser?.repurposeVoice || "direct"] || VOICE_MAP.direct;
  const avatarText = avatarData.avatarProfile ? JSON.stringify(avatarData.avatarProfile) : "No avatar saved";

  const promptTemplate = promptSetting?.value || DEFAULT_NEWSLETTER_PROMPT;
  const systemPrompt = applyNewsletterTokens(promptTemplate, {
    memberName,
    businessName,
    listSizeText,
    voiceStyle,
    avatarText,
    newsletterUrl: newsletterUrl || undefined,
  });

  const finalSystemPrompt = trimmedFeedback
    ? `${systemPrompt}

## REVISION FEEDBACK FROM THE MEMBER (HIGHEST PRIORITY)
The member generated a previous version of this output and is asking for a revision. Apply this feedback to the new version. Treat it as the most important instruction in this prompt — it overrides stylistic defaults but NOT the structural rules above (output format, JSON schema, length bounds, link rules, no-dashes rule, Canadian spelling).

Member's revision feedback:
"""
${trimmedFeedback}
"""`
    : systemPrompt;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: finalSystemPrompt,
    messages: [{ role: "user", content: `Video Title: "${title}"\n\nTranscript:\n${transcript}\n\nWrite the newsletter email as JSON.` }],
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
        toolType: "newsletter",
        output: parsed,
      },
    });

    const planSave = await maybeSavePlanArtifact({
      contentPlanId,
      userId: user.id,
      type: "repurpose_newsletter",
      content: JSON.stringify(parsed),
      metadata: {
        transcript_excerpt: transcript.slice(0, 300),
        prompt_used: "newsletter",
        videoTitle: title,
        repurposedContentId: saved.id,
        savedAt: new Date().toISOString(),
        feedback_used: trimmedFeedback || null,
      },
    });

    return NextResponse.json({ result: parsed, id: saved.id, savedToPlan: planSave.saved });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
