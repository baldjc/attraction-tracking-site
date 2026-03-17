import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { checkCostCap, logUsage, getMonthlyUsage } from "@/lib/ai-tool-cost";
import prisma from "@/lib/prisma";
import { ARC_MASTER_SYSTEM_PROMPT } from "@/lib/arc-script-builder-prompt";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-20250514";

// ─── Master System Prompt ─────────────────────────────────────────────────────
const MASTER_SYSTEM_PROMPT = ARC_MASTER_SYSTEM_PROMPT;


// ─── Step Prompts ─────────────────────────────────────────────────────────────
const OPENING_PROMPT = (p: {
  topic: string; title: string; uniqueAngle: string;
  beforeFeeling: string; afterFeeling: string;
  talkingPoints?: string;
}) => `VIDEO DETAILS:
Topic: ${p.topic}
Title: ${p.title}
Unique angle: ${p.uniqueAngle}
How viewer feels BEFORE: ${p.beforeFeeling}
How viewer feels AFTER: ${p.afterFeeling}${p.talkingPoints ? `\nPlanned talking points (the script will cover these):\n${p.talkingPoints}` : ""}

=== YOUR TASK ===

Generate the complete opening toolkit for this video. This includes intro patterns, expertise bridges, hook starters, and a lead magnet line.

=== PART 1: INTRO PATTERNS ===

Generate all 4 intro pattern types. For CONTRADICTION, generate 2 variations of EACH of the 5 sub-patterns (10 contradiction scripts total). For the other 3 types, generate 1 script each.

CONTRADICTION sub-patterns (generate 2 variations of each):
1. Validation Pivot
2. Universal Flip
3. Logic Trap
4. Obvious Wrong
5. Smart People Mistake

Rules for contradiction intros:
- Use a conversational tone
- Validate first when possible, then deliver a sharp pivot to the real issue
- Each must be specific to THIS video's topic, title, and avatar
- Each must approve the click (mirror the title/thumbnail promise)
- ~8-10 seconds of spoken word per intro

Other intro types (1 script each):
- CONFIRMATION — Restate the title promise and reinforce.
- EMPATHY — Lead with the emotion they're feeling.
- STAKES — Lead with what's at risk.

=== PART 2: EXPERTISE BRIDGES ===

Generate all 3 expertise bridge types, written specifically for this video topic. These come AFTER the lead magnet mention and transition INTO the first insight.

1. Authority Bridge: "After helping [X families/clients] [do the thing], the first thing I always tell them is..." — best when experience directly sets up the insight
2. Revelation Bridge: "What most [experts] won't tell you — and I can say this after [credibility proof] — is..." — best when first insight is contrarian
3. Pattern Bridge: "I've seen this play out [X times], and here's what happens every time..." — best when insight comes from recognizing patterns

Each bridge must be specific to this video's topic and avatar, and ~3-5 seconds of spoken word.

=== PART 3: HOOK STARTERS & LEAD MAGNET ===

Generate 2-3 hook starters that genuinely add value (not filler).

Generate a natural lead magnet mention line (~4-5 seconds): "I've put together a free [resource name] that [brief benefit] — link's in the description." Keep it tight. Do NOT pitch it.

=== OUTPUT FORMAT ===

Return ONLY valid JSON. No markdown, no explanation, just the JSON object:
{
  "intro_patterns": [
    { "name": "CONTRADICTION — Validation Pivot", "subtype": "Validation Pivot", "variation": 1, "script": "Full ~8-10 sec intro text..." },
    { "name": "CONTRADICTION — Validation Pivot", "subtype": "Validation Pivot", "variation": 2, "script": "..." },
    { "name": "CONTRADICTION — Universal Flip", "subtype": "Universal Flip", "variation": 1, "script": "..." },
    { "name": "CONTRADICTION — Universal Flip", "subtype": "Universal Flip", "variation": 2, "script": "..." },
    { "name": "CONTRADICTION — Logic Trap", "subtype": "Logic Trap", "variation": 1, "script": "..." },
    { "name": "CONTRADICTION — Logic Trap", "subtype": "Logic Trap", "variation": 2, "script": "..." },
    { "name": "CONTRADICTION — Obvious Wrong", "subtype": "Obvious Wrong", "variation": 1, "script": "..." },
    { "name": "CONTRADICTION — Obvious Wrong", "subtype": "Obvious Wrong", "variation": 2, "script": "..." },
    { "name": "CONTRADICTION — Smart People Mistake", "subtype": "Smart People Mistake", "variation": 1, "script": "..." },
    { "name": "CONTRADICTION — Smart People Mistake", "subtype": "Smart People Mistake", "variation": 2, "script": "..." },
    { "name": "CONFIRMATION", "script": "..." },
    { "name": "EMPATHY", "script": "..." },
    { "name": "STAKES", "script": "..." }
  ],
  "expertise_bridges": [
    { "name": "Authority Bridge", "script": "Full bridge text...", "best_when": "experience directly sets up the insight" },
    { "name": "Revelation Bridge", "script": "...", "best_when": "first insight is contrarian" },
    { "name": "Pattern Bridge", "script": "...", "best_when": "insight comes from recognizing patterns" }
  ],
  "hook_starters": ["Hook option 1", "Hook option 2"],
  "lead_magnet_line": "Natural one-line lead magnet mention..."
}`;

const CREDIBILITY_PROMPT = (p: {
  title: string; topic: string; credentialInput: string;
}) => `VIDEO: ${p.title}
TOPIC: ${p.topic}
CREDENTIAL INPUT: ${p.credentialInput}

=== YOUR TASK ===

Based on this credential or proof point, generate 3 natural ways to weave credibility into this specific video.

Rules:
- Never sound boastful or salesy
- Credibility should feel like a natural part of the conversation, not a standalone brag
- Each suggestion should work as an actual spoken line in the script
- Suggest WHERE in the video each line would land (e.g., "After your first insight", "During the closing")
- Write at grade 5 reading level — simple, conversational
- These are ADDITIONAL credibility moments beyond the expertise bridge in the opening

Return ONLY valid JSON. No markdown, no explanation, just the JSON object:
{
  "suggestions": [
    { "line": "Actual spoken script line", "placement": "Where in the video to use this" }
  ]
}`;

const INSIGHTS_PROMPT = (p: {
  title: string; topic: string; insightCount: number; selectedTalkingPoints: string[];
}) => `VIDEO: ${p.title}
TOPIC: ${p.topic}
Number of insights needed: ${p.insightCount}

MEMBER'S SELECTED TALKING POINTS:
${p.selectedTalkingPoints.length > 0
  ? p.selectedTalkingPoints.map((pt, i) => `${i + 1}. ${pt}`).join("\n")
  : "(none provided — generate insights based on the video topic and avatar context in your system prompt)"}

=== YOUR TASK ===

You have the member's selected talking points and their avatar profile (in your system prompt under MEMBER CONTEXT). For each insight slot, use the talking points as raw material and the avatar's emotional landscape to generate a complete first draft of each Value Loop section.

Write in the member's voice — conversational, Grade 5 reading level. The member will edit these, so give them a strong starting point, not a perfect final draft.

Enhanced Value Loop structure:
- WHAT: State the insight clearly using the talking point as the core idea
- WHY: Connect it to the avatar's stress/fear — why does this matter emotionally to the avatar?
- WHEN: Give a specific scenario where this becomes relevant for the avatar
- STORY: Suggest a client story framework referencing the avatar's name and situation (member will replace with their real story)
- WHAT THIS MEANS (connection): Connect back to the avatar — what does this change for them?

Important:
- Use the selected talking points as the BASIS for each insight — distribute them across slots (if more talking points than slots, combine related ones into single slots)
- Order insights: second-best first, best last (save the strongest for the end)
- Pull from the avatar's name, stresses, and emotional language throughout
- Each insight should feel like a revelation, not a textbook definition
- Story proof is critical — name the avatar and describe their situation as the story seed

Return ONLY valid JSON. No markdown, no explanation, just the JSON object:
{
  "insight_slots": [
    {
      "slot": 1,
      "label": "Brief label describing what this insight covers",
      "prompts": {
        "what": "Short guiding hint for the WHAT field",
        "why": "Short guiding hint for the WHY field",
        "when": "Short guiding hint for the WHEN field",
        "story": "Short story prompt",
        "connection": "Short connection hint"
      },
      "drafts": {
        "what": "Full pre-written draft for the WHAT field based on the talking point",
        "why": "Full pre-written draft for the WHY field referencing the avatar's fears/stresses",
        "when": "Full pre-written draft for the WHEN field with a specific scenario for the avatar",
        "story": "Full pre-written story framework draft — name the avatar and describe their situation as the scenario seed",
        "connection": "Full pre-written draft connecting this insight back to the avatar's life"
      }
    }
  ]
}`;

const FINAL_PROMPT = (p: {
  title: string; topic: string; uniqueAngle: string;
  selectedOpening: string; selectedBridge: string; leadMagnetLine: string;
  credibility: string; insights: string; values: string; interests: string;
  nextVideoTitle: string; nextVideoWhy: string;
}) => `VIDEO DETAILS:
Title: ${p.title}
Topic: ${p.topic}
Unique angle: ${p.uniqueAngle}

SELECTED OPENING:
Intro Pattern: ${p.selectedOpening}
Expertise Bridge: ${p.selectedBridge}
Lead Magnet Line: ${p.leadMagnetLine}

CREDIBILITY:
${p.credibility}

INSIGHTS (Value Loops):
${p.insights}

VALUES TO PEPPER IN: ${p.values}
PERSONAL INTERESTS: ${p.interests}

NEXT VIDEO PUSH:
${p.nextVideoTitle
  ? `Next video title: ${p.nextVideoTitle}\nWhy it matters now: ${p.nextVideoWhy || "(not provided)"}`
  : "(not provided — write a generic sign-off without a next-video push)"}

=== YOUR TASK ===

Assemble the complete ARC Method script outline. This is the final deliverable — a full video outline the creator can use to film.

=== SCRIPT STRUCTURE ===

1. Full Opening (~20-25 seconds): Intro Pattern + Lead Magnet line + Expertise Bridge + Transition line into first insight
2. Credibility signal woven naturally (not front-loaded)
3. Lead magnet mention #1 (already in opening)
4. Each insight in Enhanced Value Loop format (What/Why/When/Story/What This Means/Curiosity Bridge)
5. 4-5 connection phrases distributed throughout (written as actual spoken dialogue)
6. Values and interests peppered in at 2-3 natural points (casual, conversational)
7. 5 curiosity bridges using And → But → Therefore transitions between sections
8. Visual prompt suggestions for each major section
9. Lead magnet mention #2 (at ~2/3 point, tied to a point just made)
10. Closing: lead magnet mention #3 + next video bridge + sign-off

=== CLOSING INSTRUCTIONS ===

If a next video is provided, the closing MUST follow this exact pattern:
1. Bridge sentence — connect the current video's final insight directly to the next video topic (not generic; use the specific idea just covered)
2. Tease — use the "why it matters now" to frame the next video as a natural continuation of the viewer's thought, not a plug
3. Lead magnet mention #3 — weave the lead magnet reference in naturally
4. Sign-off — brief, warm, conversational

Example tone (not a template — adapt to the actual content):
"The reality is, [insight from this video]. If you've ever wondered about [next video topic], you'll want to watch this next video where I unpack [specific angle from nextVideoWhy]. Grab the [lead magnet] in the description — and we'll see you in that video."

Write this as natural spoken dialogue, Grade 5 reading level.

=== RULES ===

- Grade 5 reading level throughout
- Conversational tone — not scripted-sounding
- NO "how to implement" in any insight
- Connection phrases must be written INTO the dialogue, not listed as notes
- Visual prompts should be specific and actionable
- Closing must use the next video title specifically — never say "check out my other videos" or "see you next time"

=== FINAL SCRIPT CHECKLIST ===

After assembling, run this checklist and report pass/fail for each item.

=== RETENTION ANALYSIS ===

After the script is assembled, analyse it for viewer retention and provide 3-5 specific suggestions for places where viewers might drop off and how to tighten those moments.

=== OUTPUT FORMAT ===

Return ONLY valid JSON. No markdown, no explanation, just the JSON object:
{
  "script_outline": {
    "opening": "Complete opening text (intro pattern + lead magnet + expertise bridge + transition)",
    "credibility": "Credibility signal text woven into the script",
    "lead_magnet_1": "First mention (already in opening)",
    "insights": [
      {
        "slot": 1,
        "what": "What text — written as spoken dialogue",
        "why": "Why text — written as spoken dialogue",
        "when": "When text — written as spoken dialogue",
        "story": "Story proof text — written as spoken dialogue",
        "connection": "What this means text — written as spoken dialogue",
        "curiosity_bridge": "Transition to next section",
        "visual_prompt": "What to show on screen during this insight"
      }
    ],
    "lead_magnet_2": "Second mention (~2/3 through), tied to a specific point",
    "closing": "Closing text: bridge to next video → next video tease → lead magnet #3 → sign-off, all as spoken dialogue",
    "visual_prompts": ["Additional visual suggestions not tied to specific insights"],
    "connection_phrases": [
      { "phrase": "The exact phrase as spoken dialogue", "placement": "Where in the script" }
    ],
    "values_placed": [
      { "value": "The value or interest", "placement": "Where and how it's mentioned" }
    ]
  },
  "checklist": {
    "opening_length_ok": true,
    "opening_approves_click": true,
    "expertise_bridge_after_lead_magnet": true,
    "credibility_natural": true,
    "lead_magnet_3_times": true,
    "value_loops_correct": true,
    "no_how_to_implement": true,
    "connection_phrases_4_5": true,
    "values_peppered": true,
    "curiosity_bridges": true,
    "grade_5_language": true,
    "visual_prompts_identified": true
  },
  "retention_suggestions": [
    { "location": "Where in the script", "issue": "What might cause drop-off", "fix": "How to tighten it" }
  ]
}`;

// ─── Context builder ──────────────────────────────────────────────────────────
async function buildMasterPrompt(userId: string): Promise<string> {
  const [dbUser, latestAudit, customSetting] = await Promise.all([
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

  const basePrompt = (customSetting?.value?.trim()) ? customSetting.value : MASTER_SYSTEM_PROMPT;

  const hasAvatar = !!(dbUser?.avatarName || dbUser?.avatarProfile);
  const avatarText = hasAvatar
    ? JSON.stringify({ name: dbUser!.avatarName, summary: dbUser!.avatarSummary, profile: dbUser!.avatarProfile })
    : "No avatar saved — remind the member to build their avatar first.";
  const themes = dbUser?.contentThemes ? JSON.stringify(dbUser.contentThemes) : "No themes saved.";
  const scores = latestAudit?.scores ? JSON.stringify(latestAudit.scores) : "No baseline scores yet.";

  const contextBlock = `=== MEMBER CONTEXT ===
Avatar: ${avatarText}
Content Themes: ${themes}
Baseline Scores: ${scores}`;

  if (basePrompt.includes("{{MEMBER_CONTEXT}}")) {
    return basePrompt.replace("{{MEMBER_CONTEXT}}", contextBlock);
  }
  return basePrompt + "\n\n" + contextBlock;
}

function parseJSON(text: string): any {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned);
}

// ─── Step Handlers ────────────────────────────────────────────────────────────
async function handleSummarize(userId: string, researchText: string, title: string, talkingPoints?: string): Promise<NextResponse> {
  const cap = await checkCostCap(userId);
  if (!cap.allowed) return NextResponse.json({ error: "monthly_cap_reached", resetsAt: cap.resetsAt }, { status: 429 });

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

async function handleOpening(userId: string, body: any): Promise<NextResponse> {
  const cap = await checkCostCap(userId);
  if (!cap.allowed) return NextResponse.json({ error: "monthly_cap_reached", resetsAt: cap.resetsAt }, { status: 429 });

  const system = await buildMasterPrompt(userId);
  const userContent = OPENING_PROMPT({
    topic: body.topic ?? body.title ?? "",
    title: body.title ?? "",
    uniqueAngle: body.uniqueAngle ?? "",
    beforeFeeling: body.beforeFeeling ?? "",
    afterFeeling: body.afterFeeling ?? "",
    talkingPoints: body.talkingPoints ?? undefined,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  const { input_tokens, output_tokens } = response.usage;
  await logUsage(userId, "arc_script_builder", input_tokens, output_tokens);

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const data = parseJSON(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 500 });
  }
}

async function handleCredibility(userId: string, body: any): Promise<NextResponse> {
  const cap = await checkCostCap(userId);
  if (!cap.allowed) return NextResponse.json({ error: "monthly_cap_reached", resetsAt: cap.resetsAt }, { status: 429 });

  const system = await buildMasterPrompt(userId);
  const userContent = CREDIBILITY_PROMPT({
    title: body.title ?? "",
    topic: body.topic ?? body.title ?? "",
    credentialInput: body.credentialInput ?? "",
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  const { input_tokens, output_tokens } = response.usage;
  await logUsage(userId, "arc_script_builder", input_tokens, output_tokens);

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const data = parseJSON(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 500 });
  }
}

async function handleInsights(userId: string, body: any): Promise<NextResponse> {
  const cap = await checkCostCap(userId);
  if (!cap.allowed) return NextResponse.json({ error: "monthly_cap_reached", resetsAt: cap.resetsAt }, { status: 429 });

  const system = await buildMasterPrompt(userId);
  const userContent = INSIGHTS_PROMPT({
    title: body.title ?? "",
    topic: body.topic ?? body.title ?? "",
    insightCount: body.insightCount ?? 5,
    selectedTalkingPoints: Array.isArray(body.selectedTalkingPoints) ? body.selectedTalkingPoints : [],
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  const { input_tokens, output_tokens } = response.usage;
  await logUsage(userId, "arc_script_builder", input_tokens, output_tokens);

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const data = parseJSON(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 500 });
  }
}

async function handleFinal(userId: string, body: any): Promise<NextResponse> {
  const cap = await checkCostCap(userId);
  if (!cap.allowed) return NextResponse.json({ error: "monthly_cap_reached", resetsAt: cap.resetsAt }, { status: 429 });

  const system = await buildMasterPrompt(userId);
  const userContent = FINAL_PROMPT({
    title: body.title ?? "",
    topic: body.topic ?? body.title ?? "",
    uniqueAngle: body.uniqueAngle ?? "",
    selectedOpening: body.selectedOpening ?? "",
    selectedBridge: body.selectedBridge ?? "",
    leadMagnetLine: body.leadMagnetLine ?? "",
    credibility: body.credibility ?? "",
    insights: body.insights ?? "",
    values: body.values ?? "",
    interests: body.interests ?? "",
    nextVideoTitle: body.nextVideoTitle ?? "",
    nextVideoWhy: body.nextVideoWhy ?? "",
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  const { input_tokens, output_tokens } = response.usage;
  await logUsage(userId, "arc_script_builder", input_tokens, output_tokens);

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const data = parseJSON(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 500 });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { step } = body;

  try {
    switch (step) {
      case "summarize":
        if (!body.researchText || !body.title)
          return NextResponse.json({ error: "researchText and title are required" }, { status: 400 });
        return handleSummarize(user.id, body.researchText, body.title, body.talkingPoints);
      case "opening":
        return handleOpening(user.id, body);
      case "credibility":
        return handleCredibility(user.id, body);
      case "insights":
        return handleInsights(user.id, body);
      case "final":
        return handleFinal(user.id, body);
      default:
        return NextResponse.json(
          { error: "Unknown step. Use summarize | opening | credibility | insights | final." },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("[arc-script-builder]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Legacy GET usage check
export async function GET(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usage = await getMonthlyUsage(user.id);
  return NextResponse.json(usage);
}
