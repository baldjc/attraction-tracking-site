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
      repurposeListSize: true,
      repurposeVoice: true,
    },
  });

  const memberName = dbUser?.repurposeName || "the author";
  const businessName = dbUser?.repurposeBusiness || "the business";
  const listSize = dbUser?.repurposeListSize || "";
  const voiceStyle = VOICE_MAP[dbUser?.repurposeVoice || "direct"] || VOICE_MAP.direct;
  const avatarText = dbUser?.avatarProfile ? JSON.stringify(dbUser.avatarProfile) : "No avatar saved";

  const systemPrompt = `You are an email copywriter for ${businessName}. When given a video transcript, you write a single email newsletter that goes to the subscriber list${listSize ? ` of ${listSize}+ subscribers` : ""}.

## AUDIENCE
The audience is defined by this avatar profile. These are people who already know and trust ${memberName} from their content. They're not cold — they're warm. Write like ${memberName} is writing to someone who has already watched their videos.

AVATAR:
${avatarText}

## VOICE
${voiceStyle}

## RULES — FOLLOW EXACTLY

Every email must include:
1. A subject line that creates a knowledge gap or leads with a counterintuitive insight
2. A preview text line (separate from the subject, 60-80 characters) that adds intrigue or completes a thought
3. An opening line that names what the reader is already thinking or feeling
4. One central insight from the transcript — not a summary, a revelation
5. Can include one small section of up to 3 bullet points max, but short thoughts only
6. One URL placeholder: [INSERT URL]
7. A P.S. line that functions as a second hook for skimmers
8. Sign off personally as ${memberName}, not a team signature
9. Total length: 150-250 words maximum in the body

## NEVER DO
- Multiple CTAs
- Bullet-heavy formatting that reads like a report
- Generic openings like "Hi [Name], here's your market update"
- Vague subject lines that describe content rather than create curiosity
- Never use dashes of any kind — including em dashes, en dashes, or hyphens used as pauses. Rewrite any sentence that relies on a dash for rhythm or structure on a new line.

## PROCESS
Extract the single most surprising or counterintuitive insight from the transcript. Build the email around that one idea. Everything else in the transcript is supporting context — not content to summarise.

## CANADIAN SPELLING
Always use Canadian spelling (colour, neighbourhood, analyse, etc.)

Return ONLY valid JSON in this exact structure:
{
  "subject_line": "the email subject line",
  "preview_text": "60-80 character preview text",
  "body": "the full email body (150-250 words, no dashes of any kind)",
  "ps_line": "P.S. line as a second hook",
  "sign_off": "${memberName}"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPrompt,
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

    return NextResponse.json({ result: parsed, id: saved.id });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
