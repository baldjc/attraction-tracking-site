import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transcript, title, neighbourhood } = await req.json();
  if (!transcript || !title || !neighbourhood) {
    return NextResponse.json({ error: "Missing transcript, title, or neighbourhood" }, { status: 400 });
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
    },
  });

  const memberName = dbUser?.repurposeName || "the agent";
  const businessName = dbUser?.repurposeBusiness || "the business";
  const avatarText = dbUser?.avatarProfile ? JSON.stringify(dbUser.avatarProfile) : "No avatar saved";

  const systemPrompt = `You are writing a direct mail neighbourhood postcard for ${memberName} at ${businessName}.

MEMBER AVATAR:
${avatarText}

TARGET NEIGHBOURHOOD: ${neighbourhood}

CRITICAL DESIGN PRINCIPLE — ALWAYS BUY-SIDE:
The postcard speaks to homeowners who are thinking about their NEXT home — never about selling their current one. The current home is the fuel for the move, never the headline.

CORRECT FRAMING EXAMPLES:
- "Wondering what your next home looks like after ${neighbourhood}? I just broke down what families in your position are actually buying — and what it takes to get there."
- "Most ${neighbourhood} families looking to move up have no idea how much buying power they are actually sitting on. I made a video about it."

NEVER GENERATE:
- "Thinking of selling your ${neighbourhood} home?"
- "Find out what your home is worth"
- "Is it time to list?"
- Any language positioning the reader as a seller

RULES:
- Front copy: maximum 25 words total across front_headline and front_hook combined
- Back copy (back_body): maximum 60 words, 2–3 sentences
- Must reference the specific neighbourhood (${neighbourhood}) by name
- Must be framed from the buy side — the viewer is thinking about their next home, not about selling
- The video does the heavy lifting — the postcard just gets them there
- No salesy language, no urgency tactics, no "call me today"
- Curiosity over pressure — the reader should feel like they are missing out on something useful, not being sold to
- Canadian spelling throughout
- No dashes of any kind as pauses

video_url_placeholder is always exactly: "[Insert your video URL for QR code generation]"

Respond ONLY with valid JSON, no markdown fences:
{
  "front_headline": "...",
  "front_hook": "...",
  "back_body": "...",
  "video_url_placeholder": "[Insert your video URL for QR code generation]"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: `Video Title: "${title}"\n\nTranscript:\n${transcript}\n\nNeighbourhood: ${neighbourhood}\n\nWrite the postcard copy as JSON.` }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  try {
    const parsed = JSON.parse(extracted);
    const outputWithNeighbourhood = { ...parsed, neighbourhood };
    const saved = await prisma.repurposedContent.create({
      data: {
        userId: user.id,
        videoTitle: title,
        toolType: "postcard",
        output: outputWithNeighbourhood,
      },
    });
    return NextResponse.json({ result: parsed, id: saved.id });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
