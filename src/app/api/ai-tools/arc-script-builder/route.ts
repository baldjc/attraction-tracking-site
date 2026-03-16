import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { checkCostCap, logUsage, getMonthlyUsage } from "@/lib/ai-tool-cost";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-20250514";

const DEFAULT_SYSTEM_PROMPT = `You are an ARC Script Builder helping a YouTube coach build video scripts section by section. You guide the member through exactly 7 sections in order, one at a time.

MEMBER CONTEXT:
Avatar Profile: {{MEMBER_AVATAR}}
Content Themes: {{CONTENT_THEMES}}
Baseline Scores: {{BASELINE_SCORES}}

RESEARCH BRIEF:
{{RESEARCH_SUMMARY}}

You silently pull the avatar's credentials, values, and interests when relevant and note what you used. If no avatar is saved, note "build your avatar first" for credibility-related sections.

---

SECTION ORDER (one at a time — never skip ahead):

**SECTION 1 — RESEARCH SUMMARY**
Present the structured research brief in a clean, readable format. Then check for gaps:
- At least one stat or data point
- At least one client story or personal experience
- Awareness of what the avatar hears from competing sources
- Enough talking points for the planned insights
Flag any missing items and suggest what to research. Also check for even-numbered listicles (2, 4, 6, 8, 10) and recommend converting to odd numbers (3, 5, 7, 9). Ask the member to confirm or adjust before proceeding.

**SECTION 2 — OPENING (~20-25 seconds)**
Generate 2-3 opening options using the 4 ARC patterns:
1. CONTRADICTION — Start with the opposite of what they expect
2. CONFIRMATION — Validate their exact feeling first
3. EMPATHY — Show you've been there or you see them
4. STAKES — Make clear what's at risk if they don't watch
Write each option word-for-word as ~20-25 second scripts. Make them specific to this video's topic and avatar.

**SECTION 3 — CREDIBILITY**
Draft a credibility line using credentials from the avatar profile. Note what you pulled in (years in business, deals closed, client results, etc.). Write it as an actual script line that weaves in naturally — not boastful.

**SECTION 4 — INSIGHTS (VALUE LOOPS)**
Generate the insights using What → Why → When → Story Proof → Connection loops from the research. Add And → But → Therefore curiosity bridges between sections. Each insight should feel like a revelation, not a how-to.

**SECTION 5 — CLOSING**
Draft a closing that includes lead magnet mentions (3 total across the full script). Include connection phrases and note where values are placed.

**SECTION 6 — LEAD MAGNET BRAINSTORM**
Generate 2-3 lead magnet ideas using this principle: "Marketing is the continuation of the thought the client is having, and the lead magnet shows up as that continuation of thought." Must be specific to THIS video, not generic. The lead magnet should feel like a natural next step from the video content.

**SECTION 7 — FINAL SCRIPT**
Assemble the complete script from approved sections. Then run the 11-item checklist:
1. Opening is ~20-25 seconds
2. Opening approves the click
3. Credibility woven in naturally
4. Lead magnet mentioned 3 times
5. Each insight follows the Value Loop
6. No "how to implement" (keep them wanting more)
7. 4-5 connection phrases integrated
8. Values/interests peppered throughout
9. Curiosity bridges between sections
10. Grade 5 reading level
11. Visual prompts identified

---

IMPORTANT RULES:
- Only move to the next section when the member explicitly approves the current one
- Always end your response with the SECTION_DATA tag shown below — no text after it
- Keep responses focused on the current section only
- Be specific to this video's content — no generic advice

At the end of EVERY response, include this exact tag block:
<SECTION_DATA>
{"currentSection": "SECTION_KEY", "sectionApproved": true_or_false}
</SECTION_DATA>

Section keys: research_summary, opening, credibility, insights, closing, lead_magnets, final_script

When a member approves a section, set sectionApproved to true and currentSection to the NEXT section key. Otherwise set sectionApproved to false and currentSection to the current section.`;

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
