import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { checkCostCap, logUsage, getMonthlyUsage } from "@/lib/ai-tool-cost";
import prisma from "@/lib/prisma";
import { ARC_SCRIPT_BUILDER_DEFAULT_PROMPT } from "@/lib/arc-script-builder-prompt";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-20250514";

const DEFAULT_SYSTEM_PROMPT = ARC_SCRIPT_BUILDER_DEFAULT_PROMPT;

function resetsAtString(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function buildSystemPrompt(userId: string, researchSummary: string): Promise<string> {
  const [dbUser, latestAudit, promptSetting] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { avatarProfile: true, avatarName: true, avatarSummary: true, contentThemes: true },
    }),
    prisma.audit.findFirst({
      where: { userId, auditType: "baseline" },
      orderBy: { createdAt: "desc" },
      select: { scores: true },
    }),
    prisma.appSetting.findUnique({ where: { key: "prompt_arc_script_builder" } }),
  ]);

  const hasAvatar = !!(dbUser?.avatarName || dbUser?.avatarProfile);
  const avatarText = hasAvatar
    ? JSON.stringify({ name: dbUser!.avatarName, summary: dbUser!.avatarSummary, profile: dbUser!.avatarProfile })
    : "No avatar saved — remind the member to build their avatar first.";
  const themes = dbUser?.contentThemes ? JSON.stringify(dbUser.contentThemes) : "No themes saved.";
  const scores = latestAudit?.scores ? JSON.stringify(latestAudit.scores) : "No baseline scores yet.";

  const template = promptSetting?.value ?? DEFAULT_SYSTEM_PROMPT;

  return template
    .replace("{{MEMBER_AVATAR}}", avatarText)
    .replace("{{CONTENT_THEMES}}", themes)
    .replace("{{BASELINE_SCORES}}", scores)
    .replace("{{RESEARCH_SUMMARY}}", researchSummary || "No research summary provided.");
}

// ─── MODE 1: Summarize ────────────────────────────────────────────────────────
async function handleSummarize(
  userId: string,
  researchText: string,
  title: string,
  talkingPoints?: string
): Promise<NextResponse> {
  const cap = await checkCostCap(userId);
  if (!cap.allowed) {
    return NextResponse.json(
      { error: "monthly_cap_reached", resetsAt: cap.resetsAt },
      { status: 429 }
    );
  }

  const prompt = `You are summarizing research for a YouTube video script. Condense the following into a structured brief.

VIDEO TITLE: ${title}${talkingPoints ? `\nKEY TALKING POINTS: ${talkingPoints}` : ""}

RESEARCH:
${researchText}

Extract and organize into these categories (only include what is actually present — do not invent):

## Key Facts & Stats
Specific numbers, data points, studies

## Main Arguments
Core claims and positions

## Client Pain Points
Problems, frustrations, fears the avatar experiences

## Story Angles
Personal experiences, case studies, before/after stories

## Credibility Data
Credentials, results, proof points

## Notable Quotes
Direct quotes worth preserving word-for-word

## What the Avatar Hears from Other Sources
Competing advice, common misconceptions, what gurus or competitors say

Format as clean markdown. Preserve actual numbers and specifics. Do not paraphrase away the details.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const { input_tokens, output_tokens } = response.usage;
  await logUsage(userId, "arc_script_builder", input_tokens, output_tokens);

  const summary = response.content[0].type === "text" ? response.content[0].text : "";
  return NextResponse.json({ summary, usage: { inputTokens: input_tokens, outputTokens: output_tokens } });
}

// ─── MODE 2: Chat (Streaming SSE) ─────────────────────────────────────────────
async function handleChat(
  userId: string,
  messages: Array<{ role: "user" | "assistant"; content: string; researchSummary?: string }>
): Promise<Response> {
  const cap = await checkCostCap(userId);
  if (!cap.allowed) {
    return new Response(
      JSON.stringify({ error: "monthly_cap_reached", resetsAt: resetsAtString() }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  // Extract researchSummary from the first message if present
  let researchSummary = "";
  const claudeMessages = messages.map((m, i) => {
    if (i === 0 && m.researchSummary) researchSummary = m.researchSummary;
    return { role: m.role, content: m.content };
  });

  const systemPrompt = await buildSystemPrompt(userId, researchSummary);
  const encoder = new TextEncoder();
  let fullText = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: claudeMessages,
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = event.delta.text;
            fullText += chunk;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text", text: chunk })}\n\n`)
            );
          }
        }

        const finalMsg = await stream.finalMessage();
        const { input_tokens, output_tokens } = finalMsg.usage;
        await logUsage(userId, "arc_script_builder", input_tokens, output_tokens);

        // Parse SECTION_DATA from full response
        const match = fullText.match(/<SECTION_DATA>([\s\S]*?)<\/SECTION_DATA>/);
        let sectionData: { currentSection: string; sectionApproved: boolean } | null = null;
        if (match) {
          try { sectionData = JSON.parse(match[1].trim()); } catch {}
        }

        // Cost cap warning
        const { percentUsed } = await getMonthlyUsage(userId);
        const costCapWarning =
          percentUsed >= 90 ? "critical" : percentUsed >= 75 ? "warning" : null;

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", sectionData, costCapWarning })}\n\n`
          )
        );
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { step } = body;

  if (step === "summarize") {
    const { researchText, title, talkingPoints } = body;
    if (!researchText || !title) {
      return NextResponse.json({ error: "researchText and title are required" }, { status: 400 });
    }
    return handleSummarize(user.id, researchText, title, talkingPoints);
  }

  if (step === "chat") {
    const { messages } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400 });
    }
    return handleChat(user.id, messages);
  }

  return NextResponse.json({ error: "Unknown step. Use 'summarize' or 'chat'." }, { status: 400 });
}
