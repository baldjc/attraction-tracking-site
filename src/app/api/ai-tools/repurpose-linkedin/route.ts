import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VOICE_MAP: Record<string, string> = {
  direct: "Direct, data-grounded, conversational. Not salesy. No fluff. Confident but not arrogant. Speak plainly and respect the reader's intelligence.",
  warm: "Warm, encouraging, and personal. Like a trusted friend sharing advice. Approachable but still credible. Use 'you' and 'we' naturally.",
  authoritative: "Authoritative and expert. Lead with confidence and credibility. Back claims with experience. Professional but not stuffy.",
};

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transcript, title, selectedLinks, oneOffLinks } = await req.json();
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

  const allLinks = [
    ...(selectedLinks || []),
    ...(oneOffLinks || []),
  ];
  const linksText = allLinks.length > 0
    ? allLinks.map((l: { label: string; url: string }) => `- ${l.label}: ${l.url}`).join("\n")
    : "No links provided — do not include any clickable links in the article.";

  const systemPrompt = `You are a content strategist transforming video transcripts into engaging LinkedIn articles for ${memberName} and ${businessName}. Your articles educate the member's target audience while positioning ${memberName} as a trusted expert.

ALWAYS use Canadian spelling (colour, neighbourhood, analyse, favour, centre, etc.)

## MEMBER'S AVATAR
${avatarText}

## VOICE
${voiceStyle}

## AVAILABLE LINKS (use maximum 5 in the article, choose strategically)
${linksText}

## ARTICLE STRUCTURE

Use the video title as the article headline. Write 2,500-3,000 words following this structure:

1. **BYLINE** — "${memberName}, ${businessName}"

2. **EXECUTIVE SUMMARY** (250-400 words)
   - Conversational hook acknowledging reader's situation
   - 2-3 data points from the transcript (if available)
   - The uncomfortable truth about their current approach
   - "Here's what we're covering:" bullet list (4 items)
   - Reading time note
   - Bottom line: one sentence summarising the article's promise

3. **THE PROBLEM** (150-200 words)
   - Name the problem with a compelling header
   - 3-4 specific pain points with context from the transcript
   - End with the cost/consequence of inaction

4. **THE NUMBERS** (200-250 words)
   - Present quantitative case for change using data from transcript
   - Add context — what each number really means
   - Show progression: current situation → opportunity cost → better path

5. **WHAT ACTUALLY WORKS** (300-400 words)
   - Introduce the counterintuitive solution from the transcript
   - Explain WHY it works
   - Reference psychological principles where relevant

6. **THE FRAMEWORK** (500-700 words)
   - Step-by-step process extracted from the transcript
   - Each step: what to do, why it matters, common mistake vs better approach
   - Reference relevant links from the available links list where they add value

7. **FAQ** (5-7 questions)
   - Address real objections from the transcript
   - Each answer: acknowledge with personality → honest insight → caveat → action step
   - Include one link to contact/booking page in the most important FAQ answer

8. **RESOURCES** (brief section)
   - List only 2-3 most relevant links from the available links
   - One line description each
   - Do NOT list all available links

9. **CALL TO ACTION**
   - "Here's What To Do Next"
   - This week challenge (one specific action)
   - Professional CTA with link

10. **DISCLAIMER** — Standard disclaimer about individual results varying

## CRITICAL RULES
- Maximum 5 clickable links total in the entire article
- Never fabricate case studies, statistics, or examples not in the transcript
- If data is mentioned in the transcript, cite it. If not available, don't make it up.
- No real estate cliches or hype
- Education over sales, strategy over pressure
- Use parenthetical asides naturally: "(trust me, I've seen this dozens of times)"
- Bold for key concepts, italics for emphasis
- 3-5 sentence paragraphs maximum
- REALTOR® and MLS® properly marked with ® when applicable

Return ONLY valid JSON in this exact structure:
{
  "full_article": "the complete formatted article as a single markdown string with all sections",
  "reading_time": "X minutes"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: systemPrompt,
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

    return NextResponse.json({ result: parsed, id: saved.id });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
