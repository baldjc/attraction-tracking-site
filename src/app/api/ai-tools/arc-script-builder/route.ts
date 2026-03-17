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
  topic: string; title: string;
  conventionalWisdom: string; uniqueAngle: string;
  viewerEmotion: string; viewerQuestion: string; viewerFear: string; viewerHope: string;
  talkingPoints?: string;
}) => `VIDEO DETAILS:
Topic: ${p.topic}
Title: ${p.title}

WHAT CONVENTIONAL WISDOM SAYS: ${p.conventionalWisdom || "(not provided)"}
WHAT THE MEMBER BELIEVES INSTEAD: ${p.uniqueAngle || "(not provided)"}
Write ALL intro patterns from the member's corrective perspective — they are reframing a common misconception.

VIEWER EMOTIONAL STATE:
- Emotion right now: ${p.viewerEmotion || "(not provided)"}
- Question they won't say out loud: ${p.viewerQuestion || "(not provided)"}
- What they're afraid this video might confirm: ${p.viewerFear || "(not provided)"}
- What they secretly hope this video will tell them: ${p.viewerHope || "(not provided)"}
Write every opening speaking directly to this internal state — not a general audience.${p.talkingPoints ? `\nPlanned talking points (the script will cover these):\n${p.talkingPoints}` : ""}

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

Generate 5-7 hook starter ideas that genuinely add value (not filler). Each should be a different angle or entry point into the topic.

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
  title: string; topic: string;
  credClientsHelped: string; credSpecificResult: string; credFrequency: string; credSurprise: string;
}) => `VIDEO: ${p.title}
TOPIC: ${p.topic}

MEMBER'S CREDENTIALS (use EXACTLY as written — do not rephrase or generalize):
${p.credClientsHelped ? `- Clients/families/businesses helped: ${p.credClientsHelped}` : ""}
${p.credSpecificResult ? `- Specific result achieved for a client: ${p.credSpecificResult}` : ""}
${p.credFrequency ? `- How often they do this work: ${p.credFrequency}` : ""}
${p.credSurprise ? `- Surprising track record fact: ${p.credSurprise}` : ""}

CRITICAL: Use the member's exact numbers, timeframes, and results verbatim. Do NOT substitute with generic language like "years of experience." If they said "22 years," write "22 years." If they said "200+ families," write "200+ families."

=== YOUR TASK ===

Generate 3 natural ways to weave these credentials into this specific video.

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

const HOOKS_PROMPT = (p: {
  title: string; topic: string;
}) => `VIDEO: ${p.title}
TOPIC: ${p.topic}

Generate 5-7 fresh hook starter ideas for this video. A hook starter is a 1-sentence conversational line the presenter can use as an alternative opening hook or mid-video re-engagement point.

Rules:
- Each hook should be a genuinely different angle (not just rewording the same idea)
- Grade 5 reading level, conversational
- Specific to this topic — no generic advice hooks
- Not rhetorical questions — make them statements or observations that pull the viewer in

Return ONLY valid JSON:
{"hook_starters": ["Hook 1", "Hook 2", "Hook 3", "Hook 4", "Hook 5"]}`;

const INSIGHTS_PROMPT = (p: {
  title: string; topic: string; insightCount: number; selectedTalkingPoints: string[]; sourceTheme?: string;
  viewerEmotion: string; viewerQuestion: string; viewerFear: string; viewerHope: string;
  clientStory: string;
}) => `VIDEO: ${p.title}
TOPIC: ${p.topic}${p.sourceTheme ? `\nSOURCE THEME: ${p.sourceTheme} — all insights must connect to this emotional category and the stresses it represents` : ""}
Number of insights needed: ${p.insightCount}

VIEWER EMOTIONAL STATE:
- Emotion right now: ${p.viewerEmotion || "(not provided)"}
- Internal question they won't say out loud: ${p.viewerQuestion || "(not provided)"}
- What they're afraid this video might confirm: ${p.viewerFear || "(not provided)"}
- What they secretly hope this video will tell them: ${p.viewerHope || "(not provided)"}
Write every insight speaking directly to this person's internal state — not a general audience.

MEMBER'S REAL CLIENT STORY:
${p.clientStory
  ? `"${p.clientStory}"
Use this story in the most impactful Value Loop's STORY section. Reference the real name, real details, and real outcome. For other Value Loops, adapt elements of the story or write placeholders.`
  : "The member hasn't provided a client story. In the STORY section of EVERY Value Loop, write a PLACEHOLDER that says exactly: '[INSERT YOUR REAL CLIENT STORY HERE — a name, a specific situation, what shifted, and what happened]' — do NOT invent a generic story."}

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
- STORY: Use the real client story or write a clear placeholder (never invent a generic story)
- WHAT THIS MEANS (connection): Connect back to the avatar — what does this change for them?

Important:
- Use the selected talking points as the BASIS for each insight — distribute them across slots (if more talking points than slots, combine related ones into single slots)
- Order insights: second-best first, best last (save the strongest for the end)
- Pull from the avatar's stresses, fears, and emotional landscape to inform tone — address the viewer as "you" and "your" throughout, NEVER use the avatar's name in any output
- Each insight must pass this test: would the viewer say "I've never thought about it that way"? If no — rewrite it.
- Story proof is critical — use the real story or write the exact placeholder text, never invent

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
        "story": "Full pre-written story framework draft — use 'a client' or 'a couple I worked with', NEVER the avatar name; describe a specific real-feeling situation as the scenario seed",
        "connection": "Full pre-written draft connecting this insight back to the avatar's life"
      }
    }
  ]
}`;

const FINAL_PROMPT = (p: {
  title: string; topic: string; conventionalWisdom: string; uniqueAngle: string;
  viewerEmotion: string; viewerQuestion: string; viewerFear: string; viewerHope: string;
  selectedOpening: string; selectedBridge: string; leadMagnetLine: string;
  credibility: string; insights: string; values: string; interests: string;
  nextVideoTitle: string; nextVideoWhy: string; sourceTheme?: string;
  credClientsHelped?: string; credSpecificResult?: string; credFrequency?: string; credSurprise?: string;
  clientStory?: string; nextVideoTranscript?: string;
}) => `VIDEO DETAILS:
Title: ${p.title}
Topic: ${p.topic}
${p.sourceTheme ? `Source Theme: ${p.sourceTheme} — align all language, examples, and emotional tone with this theme\n` : ""}
MEMBER'S UNIQUE ANGLE:
What conventional wisdom says: ${p.conventionalWisdom || "(not provided)"}
What this member believes instead: ${p.uniqueAngle || "(not provided)"}

VIEWER EMOTIONAL STATE (write EVERY section speaking to this internal experience):
- Emotion right now: ${p.viewerEmotion || "(not provided)"}
- Question they won't say out loud: ${p.viewerQuestion || "(not provided)"}
- What they're afraid this video might confirm: ${p.viewerFear || "(not provided)"}
- What they secretly hope this video will tell them: ${p.viewerHope || "(not provided)"}

SELECTED OPENING (use EXACTLY — this is the first thing the viewer hears):
Intro Pattern: ${p.selectedOpening}
Expertise Bridge: ${p.selectedBridge}
Lead Magnet Line: ${p.leadMagnetLine}

MEMBER'S EXACT CREDENTIALS (use verbatim — never rephrase, never substitute):
${p.credClientsHelped ? `- Clients/families helped: ${p.credClientsHelped}` : ""}
${p.credSpecificResult ? `- Specific result: ${p.credSpecificResult}` : ""}
${p.credFrequency ? `- How often: ${p.credFrequency}` : ""}
${p.credSurprise ? `- Surprising track record: ${p.credSurprise}` : ""}

CREDIBILITY SIGNAL (weave naturally — not as a standalone sentence):
${p.credibility || "(none selected)"}

VALUE LOOP CONTENT (the insights to develop into narrative sections — DO NOT label them WHAT/WHY/WHEN in the script):
${p.insights}

VALUES TO PEPPER IN: ${p.values}
PERSONAL INTERESTS: ${p.interests}

CLIENT STORY:
${p.clientStory
  ? `Member's real story: "${p.clientStory}"
THREADING APPROACH: Introduce this story early (first or second section). Use the real name, specific situation, and real outcome. Then REVISIT it at 1-2 later moments using a callback: "Remember [name]? Here's where it got worse..." — only bring it back when it genuinely reinforces the new point. Do NOT force story callbacks into every section.`
  : `No client story provided.
THREADING APPROACH: Place ONE specific story cue early: [STORY CUE: describe exactly what kind of story to tell — a specific client situation, the stakes, and what changed]. Then add 1-2 callbacks later using [CALLBACK: Reference how this played out for the same client from your earlier story]. Do NOT put a story placeholder in every section — template-generated content kills credibility.`}

NEXT VIDEO PUSH:
${p.nextVideoTitle
  ? `Next video title: ${p.nextVideoTitle}\nWhy it matters now: ${p.nextVideoWhy || "(not provided)"}${p.nextVideoTranscript ? `\nNext video opening (first 30 seconds): "${p.nextVideoTranscript}"\nUSE THIS: Write the bridge using specific language and ideas from this opening so the CTA feels like a natural continuation.` : ""}`
  : "(none provided — write a warm sign-off without a next-video push)"}

=== YOUR TASK ===

Write a FILMABLE VIDEO SCRIPT — a flowing monologue that a creator can read on camera or from a teleprompter. This is NOT an outline. This is NOT a template with labels. These are the actual words the creator will say.

Target length: 2,500–4,000 words. Over-deliver on content so the creator edits DOWN, not builds up.

=== 14 RULES ===

1. INVISIBLE STRUCTURE: The ARC Value Loop (What → Why → When → Story → What This Means) must be present but NEVER labelled. No "WHAT:", "WHY:", "WHEN:" headers anywhere. The viewer should never see a framework — they should feel a compelling argument.

2. NARRATIVE ARC: Insights must BUILD on each other — not be independent modules. Structure as Act 1 (setup/tension — the viewer's current reality and why it's about to get worse or better), Act 2 (escalation — complications they haven't considered, the deeper problem underneath the surface problem), Act 3 (resolution/playbook — specific actions and what changes). Each section raises the stakes from the previous one.

3. CONVERSATIONAL VOICE: Write in spoken English, not written English.
   - Contractions: you're, it's, that's, here's, they've, I've
   - Sentence fragments for emphasis: "Not anymore." "Here's the thing." "That's the part nobody talks about."
   - Rhetorical questions: "So what does that mean for you?" "You know what that actually costs?"
   - Direct address: "Let me show you what I mean." "Think about it this way."
   - Grade 5 reading level throughout — no jargon, no MBA language

4. ANALOGIES: Include at least one vivid analogy per major section. Make them relatable to the avatar's everyday life (sports, family, home repairs, everyday experiences). Examples of the RIGHT kind of analogy: "That safety net has a hole in it now." "It's like leaving the game when they're down by three — you miss the comeback." "It's like grading on a curve — your home didn't change, the comparisons did."

5. DATA INTEGRATION: If the member provided research, data, or statistics in their talking points, weave specific numbers throughout. Show the math — walk through calculations the viewer can follow step by step. Example: "Let's say you've got a $600,000 property at 5.5%. Your carrying costs run about $5,800 a month. Sits empty 60 days? That's $11,600 gone — before you've done a single repair."

6. STORY THREADING — ONE STORY, NOT MANY: Use ONE primary client story (two at most) threaded through the entire script, not a different story for every section. Introduce it early. Revisit it at key moments when it genuinely reinforces the new point. Between sections that DON'T have a story callback, use data and analogies instead. NEVER put a story placeholder in every section — that's the #1 tell of template-generated content.
   - Story CUE format (for first introduction, if no real story provided): [STORY CUE: A client who did X, faced Y situation, and what actually happened — be specific about the type of story needed]
   - Story CALLBACK format (for later revisits): [CALLBACK: Reference how this played out for the same client — connect it to this specific new point]
   - If member provided a real story: use the real name, real situation, real outcome. First mention = full story. Later mentions = brief callback ("Remember [name]? This is where it got expensive for them...")

7. LEAD MAGNET — ORGANIC, 3 TIMES: Mention the lead magnet 3 times as natural asides woven into the narrative — never as a labelled section. Each mention should connect to what was just said. Example: "By the way — I've put together a free breakdown of exactly this. Link's in the description. But here's what makes this complicated..."

8. WHAT TO DO ABOUT IT: After the insights, include a "So what do you actually do?" playbook section. Give 3-5 numbered, specific actions. Each action needs a concrete threshold, number, or decision rule — not vague advice. This section is what makes viewers save and share the video.

9. NEXT VIDEO PUSH: End with a bridge that connects THIS video's content to the next video. Create a specific open loop from the argument just made. Do NOT write "check out my next video" — make it feel like the natural next chapter of the story. The viewer should feel like stopping now would leave their question unanswered.

10. SPECIFIC VISUAL CUES: Write production cues tied to specific content, inline: [ON SCREEN: Show rental vacancy rate chart 2021–2025] — not generic "show relevant data." These guide the editor and creator on exactly what to display.

11. FULL LENGTH: 2,500–4,000 words. A complete 10-15 minute video script. Do not stop at a skeleton.

12. CREDENTIALS EXACT: Use the member's credentials verbatim. "22 years" means "22 years." "200+ families" means "200+ families." Never substitute avatar defaults.

13. CONNECTION PHRASES: Don't list them separately. Weave empathy, shared experience, and personal touches into the narrative fabric. "I've got kids too — I get it" belongs inside a section, not as a labelled note. Make the creator sound like a real person, not a broadcaster.

14. CURIOSITY BRIDGES: Between sections, create specific open loops — not generic "but there's more" transitions. The viewer should have a specific unanswered question that makes leaving feel like quitting a mystery halfway through. Example: "That vacancy number gets worse when you look at who's actually leaving — and why they're not coming back." The next section must answer the question the bridge opened.

=== WHAT TO DO ABOUT IT SECTION ===

After the insights and before the closing, include a clearly spoken "What you actually do about this" section. Number each action. Give it a concrete threshold or trigger the viewer can apply immediately. Example format (adapt to the content):
"So here's what I'd do if I were in your position right now. First — [specific action with a number or threshold]. Second — [specific action]. Third — [specific action]..."

=== CLOSING ===

If a next video is provided:
1. Bridge sentence — connect the final insight directly to the next video topic using the specific idea just covered (not generic)
2. Tease — frame the next video as the natural next chapter using the "why it matters now" context
3. Lead magnet mention #3 — weave it in naturally as a final aside
4. Warm sign-off

=== CHECKLIST ===

After writing the script, evaluate it against these criteria and report true/false:
- opening_hook_strong: Opening hook creates immediate tension or curiosity within the first 3 sentences
- arc_invisible: ARC structure is invisible — no WHAT/WHY/WHEN labels anywhere in the script
- narrative_escalates: Each section raises the stakes from the previous — reads as a single escalating argument
- one_story_threaded: One primary story introduced early and revisited (not a different placeholder per section)
- analogies_present: At least one vivid relatable analogy per major section
- data_specific: Specific data, numbers, or math woven throughout (not vague "statistics show")
- lead_magnet_organic_3x: Lead magnet mentioned organically 3 times as narrative asides
- playbook_included: "What to do about it" section with 3-5 numbered specific actions
- curiosity_bridges_specific: Each bridge between sections creates a specific open loop (not generic transitions)
- next_video_bridge_specific: Next video push connects specifically to this video's content
- credentials_exact: Member's exact credentials appear verbatim in the script
- conversational_tone: Contractions, fragments, rhetorical questions throughout
- visual_cues_specific: Visual cues tied to specific content inline (not generic)

=== RETENTION ANALYSIS ===

After writing the script, identify 3-5 specific moments where viewers are most likely to drop off. For each, give an estimated timestamp, the issue, and a specific fix.

=== OUTPUT FORMAT ===

Return ONLY valid JSON. No markdown fences, no explanation outside the JSON:
{
  "script": "The COMPLETE filmable script as one continuous monologue. [STORY CUE: ...], [CALLBACK: ...], and [ON SCREEN: ...] markers appear inline where they belong. The full text — 2,500 to 4,000 words.",
  "title": "${p.title}",
  "leadMagnet": "Name of the lead magnet referenced in the script",
  "nextVideo": "${p.nextVideoTitle || ""}",
  "checklist": {
    "opening_hook_strong": true,
    "arc_invisible": true,
    "narrative_escalates": true,
    "one_story_threaded": true,
    "analogies_present": true,
    "data_specific": true,
    "lead_magnet_organic_3x": true,
    "playbook_included": true,
    "curiosity_bridges_specific": true,
    "next_video_bridge_specific": true,
    "credentials_exact": true,
    "conversational_tone": true,
    "visual_cues_specific": true
  },
  "retentionNotes": [
    { "timestamp": "~2:30", "issue": "What might cause drop-off here", "fix": "How to tighten it" }
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

  const currentYear = new Date().getFullYear();
  const contextBlock = `=== MEMBER CONTEXT ===
Current Year: ${currentYear}
Always reference the current year (${currentYear}) when mentioning dates, market conditions, statistics, or any time-specific content. Never hardcode a year — always use the current year provided here.
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
    conventionalWisdom: body.conventionalWisdom ?? "",
    uniqueAngle: body.uniqueAngle ?? "",
    viewerEmotion: body.viewerEmotion ?? "",
    viewerQuestion: body.viewerQuestion ?? "",
    viewerFear: body.viewerFear ?? "",
    viewerHope: body.viewerHope ?? "",
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
    credClientsHelped: body.credClientsHelped ?? "",
    credSpecificResult: body.credSpecificResult ?? "",
    credFrequency: body.credFrequency ?? "",
    credSurprise: body.credSurprise ?? "",
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
    sourceTheme: body.sourceTheme,
    viewerEmotion: body.viewerEmotion ?? "",
    viewerQuestion: body.viewerQuestion ?? "",
    viewerFear: body.viewerFear ?? "",
    viewerHope: body.viewerHope ?? "",
    clientStory: body.clientStory ?? "",
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

async function handleHooks(userId: string, body: any): Promise<NextResponse> {
  const cap = await checkCostCap(userId);
  if (!cap.allowed) return NextResponse.json({ error: "monthly_cap_reached", resetsAt: cap.resetsAt }, { status: 429 });

  const system = await buildMasterPrompt(userId);
  const userContent = HOOKS_PROMPT({ title: body.title ?? "", topic: body.topic ?? body.title ?? "" });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  const { input_tokens, output_tokens } = response.usage;
  await logUsage(userId, "arc_script_builder", input_tokens, output_tokens);

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    return NextResponse.json(parseJSON(raw));
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
    conventionalWisdom: body.conventionalWisdom ?? "",
    uniqueAngle: body.uniqueAngle ?? "",
    viewerEmotion: body.viewerEmotion ?? "",
    viewerQuestion: body.viewerQuestion ?? "",
    viewerFear: body.viewerFear ?? "",
    viewerHope: body.viewerHope ?? "",
    selectedOpening: body.selectedOpening ?? "",
    selectedBridge: body.selectedBridge ?? "",
    leadMagnetLine: body.leadMagnetLine ?? "",
    credibility: body.credibility ?? "",
    insights: body.insights ?? "",
    values: body.values ?? "",
    interests: body.interests ?? "",
    nextVideoTitle: body.nextVideoTitle ?? "",
    nextVideoWhy: body.nextVideoWhy ?? "",
    sourceTheme: body.sourceTheme,
    credClientsHelped: body.credClientsHelped,
    credSpecificResult: body.credSpecificResult,
    credFrequency: body.credFrequency,
    credSurprise: body.credSurprise,
    clientStory: body.clientStory,
    nextVideoTranscript: body.nextVideoTranscript,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
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
      case "hooks":
        return handleHooks(user.id, body);
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
