import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getCostCapStatus, logUsage } from "@/lib/ai-tool-cost";

export const runtime = "nodejs";
export const maxDuration = 60;

const HAIKU_MODEL = "claude-haiku-4-5";
const MAX_OUTPUT_TOKENS = 600;
const MAX_COMMENT_CHARS = 1000;
const MAX_SCRIPT_CHARS = 12000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST — draft a pinned first comment for a video using Haiku. Pulls the plan's
// title + script for context. Returns the suggestion; the client binds it into
// the editable pinnedComment field (the member can edit before saving).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await getCostCapStatus(user.id);
  if (cap.hardBlocked) {
    return NextResponse.json(
      { error: "Monthly AI usage limit reached. Try again next month." },
      { status: 402 },
    );
  }

  const { id } = await params;
  const plan = await prisma.contentPlan.findFirst({
    where: { id, userId: user.id },
    select: { title: true, script: true, titlePromise: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const script = (plan.script ?? "").slice(0, MAX_SCRIPT_CHARS);
  const systemPrompt = `You write the pinned first comment a YouTube creator posts on their own video. The pinned comment should:
- Open a friendly loop that invites replies (a question or prompt to the audience).
- Reinforce the video's core promise without repeating the title verbatim.
- Optionally point to a next step or resource if one is provided.
- Be warm and conversational, 2-4 short sentences, no hashtags, no emojis unless natural.
- Stay under ${MAX_COMMENT_CHARS} characters.
Return ONLY the comment text — no preamble, no quotes, no markdown.`;

  const userPrompt = `VIDEO TITLE: ${plan.title ?? "(untitled)"}
${plan.titlePromise ? `CORE PROMISE: ${plan.titlePromise}\n` : ""}${
    script ? `SCRIPT (for context):\n${script}` : "(no script provided)"
  }

Write the pinned first comment now.`;

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    console.error("[pinned-comment] anthropic failed:", err);
    return NextResponse.json({ error: "Generation failed. Please try again." }, { status: 502 });
  }

  // Best-effort: a usage-logging failure must not discard a paid model result.
  try {
    await logUsage(
      user.id,
      "content_pinned_comment",
      response.usage.input_tokens,
      response.usage.output_tokens,
    );
  } catch (err) {
    console.error("[pinned-comment] logUsage failed:", err);
  }

  const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Empty response. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ comment: text.slice(0, MAX_COMMENT_CHARS) });
}
