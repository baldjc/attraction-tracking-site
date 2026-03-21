import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VOICE_MAP: Record<string, string> = {
  direct: "Direct, data-grounded, conversational. Not salesy. No fluff. Confident but not arrogant.",
  warm: "Warm, encouraging, and personal. Like a trusted friend sharing advice. Approachable but still credible.",
  authoritative: "Authoritative and expert. Lead with confidence and credibility. Back claims with experience.",
};

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transcript, title } = await req.json();
  if (!transcript || !title) {
    return NextResponse.json({ error: "Missing transcript or title" }, { status: 400 });
  }
  if (transcript.length > 50000) {
    return NextResponse.json({ error: "Transcript exceeds 50,000 character limit" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      avatarProfile: true,
      repurposeName: true,
      repurposeBusiness: true,
      repurposeVoice: true,
    },
  });

  const memberName = dbUser?.repurposeName || "the author";
  const businessName = dbUser?.repurposeBusiness || "the business";
  const voiceStyle = VOICE_MAP[dbUser?.repurposeVoice || "direct"] || VOICE_MAP.direct;
  const avatarText = dbUser?.avatarProfile ? JSON.stringify(dbUser.avatarProfile) : "No avatar saved";

  const systemPrompt = `You are an AI-optimized content writer for ${memberName} at ${businessName}.

MEMBER AVATAR:
${avatarText}

VOICE STYLE: ${voiceStyle}

Write an AI-optimized blog article based on the video transcript. This article is NOT written for traditional SEO — it is written to be cited by AI tools like ChatGPT, Claude, Perplexity, and Google AI Overviews.

RULES:
- 800–1,200 words
- The blog_title must be a clear question in natural language — the kind of question someone would type directly into an AI chatbot (e.g., "How Do You Buy and Sell a Home at the Same Time in Calgary?" not "Tips for Simultaneous Home Transactions")
- Opening paragraph answers the title question immediately in 2–3 sentences — no preamble, no "in this article we will explore..." This is what gets pulled into AI-generated answers
- All subheadings must be follow-up questions a reader would naturally ask next
- Each section leads with a direct, factual answer then expands with context, local specifics, and experience
- Use specific numbers, names, and local details from the transcript — AI tools prioritize concrete data over generic advice
- Include an author attribution block at the end with ${memberName}'s full name, title, brokerage/business (${businessName}), and city
- Include [EMBED VIDEO: {title}] placeholder at the top as the first line of full_article
- Include a closing CTA to watch the full video breakdown
- No fabricated statistics, case studies, or examples not in the transcript
- Canadian spelling throughout (colour, neighbour, etc.)
- NEVER use dashes of any kind — no em dashes, en dashes, or hyphens used as pauses. Rewrite any sentence that would require a dash using commas, periods, or new sentences instead.
- meta_description must be 150–160 characters, written as a direct answer snippet that could appear under a search result
- reading_time: calculate as word count divided by 200, rounded to nearest minute, e.g. "6 minutes"
- Format full_article as markdown

Respond ONLY with valid JSON, no markdown fences:
{
  "blog_title": "...",
  "full_article": "...",
  "meta_description": "...",
  "reading_time": "X minutes"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: `Video Title: "${title}"\n\nTranscript:\n${transcript}\n\nWrite the AI-optimized blog post as JSON.` }],
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
        toolType: "blog",
        output: parsed,
      },
    });
    return NextResponse.json({ result: parsed, id: saved.id });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
