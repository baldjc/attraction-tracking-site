import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { getAvatarData } from "@/lib/avatar-utils";
import { maybeSavePlanArtifact } from "@/lib/save-plan-artifact";
import { SONNET_MODEL } from "@/lib/ai-models";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VOICE_MAP: Record<string, string> = {
  direct: "Direct, data-grounded, conversational. Not salesy. No fluff. Confident but not arrogant.",
  warm: "Warm, encouraging, and personal. Like a trusted friend sharing advice. Approachable but still credible.",
  authoritative: "Authoritative and expert. Lead with confidence and credibility. Back claims with experience.",
};

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transcript, title, selectedLinks, oneOffLinks, contentPlanId, feedback } = await req.json() as {
    transcript: string;
    title: string;
    selectedLinks?: { label: string; url: string }[];
    oneOffLinks?: { label: string; url: string }[];
    contentPlanId?: string;
    feedback?: string;
  };
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

  const currentYear = new Date().getFullYear();

  const allLinks = [...(selectedLinks || []), ...(oneOffLinks || [])].filter((l) => l.label && l.url);
  const linksSection = allLinks.length > 0
    ? `\nAVAILABLE LINKS (use maximum 5 in the article, choose strategically):\n${allLinks.map((l) => `- ${l.label}: ${l.url}`).join("\n")}\n`
    : "";

  const systemPrompt = `You are an AI-optimized content writer for ${memberName} at ${businessName}.

CURRENT YEAR: ${currentYear}. Use this exact year whenever referencing the current year. Never use a past year such as 2024 or 2023.

MEMBER AVATAR:
${avatarText}

VOICE STYLE: ${voiceStyle}
${linksSection}
Write an AI-optimized blog article based on the video transcript. This article is NOT written for traditional SEO — it is written to be cited by AI tools like ChatGPT, Claude, Perplexity, and Google AI Overviews.

OUTPUT FORMAT RULES — CRITICAL:
- The full_article must be plain text that can be pasted directly into any website CMS (WordPress, Squarespace, Wix, Webflow, etc.)
- Do NOT use markdown syntax: no # ## ### for headings, no **bold**, no *italic*, no backticks, no --- dividers
- Subheadings must be written on their own line as plain text, followed by a blank line — the CMS editor will apply heading styles
- Bullet points must use the • character (not - or *)
- Separate paragraphs with a single blank line
- Separate sections with two blank lines
- Links: write as Label (URL) inline — for example: Watch the full breakdown (https://youtube.com/...)

CONTENT RULES:
- 800-1,200 words
- The blog_title must be a clear question in natural language — the kind of question someone would type directly into an AI chatbot (e.g., "How Do You Buy and Sell a Home at the Same Time in Calgary in ${currentYear}?" not "Tips for Simultaneous Home Transactions")
- If the title includes a year, it must be ${currentYear}
- Opening paragraph answers the title question immediately in 2-3 sentences — no preamble, no "in this article we will explore..." This is what gets pulled into AI-generated answers
- All subheadings must be follow-up questions a reader would naturally ask next — plain text on their own line
- Each section leads with a direct, factual answer then expands with context, local specifics, and experience
- Use specific numbers, names, and local details from the transcript — AI tools prioritize concrete data over generic advice
- Include [EMBED VIDEO: {title}] placeholder at the top as the first line of full_article
- Include a closing CTA to watch the full video breakdown, written as: Label (URL placeholder)
- Include an author attribution block at the end: ${memberName}, ${businessName}
- No fabricated statistics, case studies, or examples not in the transcript
- Canadian spelling throughout (colour, neighbour, analyse, etc.)
- NEVER use dashes of any kind — no em dashes, en dashes, or hyphens used as pauses. Rewrite any sentence that would require a dash using commas, periods, or new sentences instead.
- meta_description must be 150-160 characters, written as a direct answer snippet that could appear under a search result
- reading_time: calculate as word count divided by 200, rounded to nearest minute, e.g. "6 minutes"

Respond ONLY with valid JSON, no markdown fences:
{
  "blog_title": "...",
  "full_article": "plain text only — no markdown symbols",
  "meta_description": "...",
  "reading_time": "X minutes"
}`;

  const finalSystemPrompt = trimmedFeedback
    ? `${systemPrompt}

## REVISION FEEDBACK FROM THE MEMBER (HIGHEST PRIORITY)
The member generated a previous version of this output and is asking for a revision. Apply this feedback to the new version. Treat it as the most important instruction in this prompt — it overrides stylistic defaults but NOT the structural rules above (output format, JSON schema, length bounds, link rules, no-dashes rule, Canadian spelling).

Member's revision feedback:
"""
${trimmedFeedback}
"""`
    : systemPrompt;

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 4096,
      system: finalSystemPrompt,
      messages: [{ role: "user", content: `Video Title: "${title}"\n\nTranscript:\n${transcript}\n\nWrite the AI-optimized blog post as JSON.` }],
    });
  } catch (err) {
    console.error("[repurpose-blog] generation failed:", err);
    const detail = err instanceof Error ? err.message : "AI generation failed";
    return NextResponse.json({ error: "Generation failed", detail }, { status: 500 });
  }

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  try {
    const parsed = JSON.parse(extracted);
    const saved = await prisma.repurposedContent.create({
      data: {
        userId: user.id,
        videoTitle: title,
        toolType: "blog",
        output: parsed,
      },
    });
    const planSave = await maybeSavePlanArtifact({
      contentPlanId,
      userId: user.id,
      type: "repurpose_blog",
      content: JSON.stringify(parsed),
      metadata: {
        transcript_excerpt: transcript.slice(0, 300),
        prompt_used: "blog",
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
