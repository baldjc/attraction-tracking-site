import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { DEFAULT_LINKEDIN_PROMPT, applyLinkedInTokens } from "@/lib/repurpose-prompts";
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

  const { transcript, title, selectedLinks, oneOffLinks, contentPlanId, feedback } = await req.json();
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
        repurposeVoice: true,
      },
    }),
    prisma.appSetting.findUnique({ where: { key: "repurpose_linkedin_prompt" } }),
    getAvatarData(user.id),
  ]);

  const memberName = dbUser?.repurposeName || "the author";
  const businessName = dbUser?.repurposeBusiness || "the business";
  const voiceStyle = VOICE_MAP[dbUser?.repurposeVoice || "direct"] || VOICE_MAP.direct;
  const avatarText = avatarData.avatarProfile ? JSON.stringify(avatarData.avatarProfile) : "No avatar saved";

  const allLinks = [
    ...(selectedLinks || []),
    ...(oneOffLinks || []),
  ];
  const linksText = allLinks.length > 0
    ? allLinks.map((l: { label: string; url: string }) => `- ${l.label}: ${l.url}`).join("\n")
    : "No links provided — do not include any clickable links in the article.";

  const currentYear = String(new Date().getFullYear());
  const promptTemplate = promptSetting?.value || DEFAULT_LINKEDIN_PROMPT;
  const systemPrompt = applyLinkedInTokens(promptTemplate, {
    memberName,
    businessName,
    voiceStyle,
    avatarText,
    linksText,
    currentYear,
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
    max_tokens: 8192,
    system: finalSystemPrompt,
    messages: [{ role: "user", content: `Video Title (use as article headline): "${title}"\n\nTranscript:\n${transcript}\n\nWrite the full LinkedIn article as JSON.` }],
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
        toolType: "linkedin",
        output: parsed,
      },
    });

    const planSave = await maybeSavePlanArtifact({
      contentPlanId,
      userId: user.id,
      type: "repurpose_linkedin",
      content: JSON.stringify(parsed),
      metadata: {
        transcript_excerpt: transcript.slice(0, 300),
        prompt_used: "linkedin",
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
