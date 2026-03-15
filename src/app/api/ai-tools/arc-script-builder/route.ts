import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { step, stepData, allStepData } = await req.json();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarProfile: true, avatarName: true, contentThemes: true },
  });

  const latestAudit = await prisma.audit.findFirst({
    where: { userId: user.id, auditType: "baseline" },
    orderBy: { createdAt: "desc" },
    select: { scores: true },
  });

  const avatarText = dbUser?.avatarProfile
    ? JSON.stringify(dbUser.avatarProfile)
    : "No avatar saved";
  const avatarName = dbUser?.avatarName ?? "your avatar";
  const themes = dbUser?.contentThemes ? JSON.stringify(dbUser.contentThemes) : "No themes saved";
  const baselineScores = latestAudit?.scores ? JSON.stringify(latestAudit.scores) : "No baseline scores";

  const contextBlock = `MEMBER CONTEXT:
Avatar: ${avatarText}
Avatar Name: ${avatarName}
Content Themes: ${themes}
Baseline Scores: ${baselineScores}`;

  let prompt = "";
  let maxTokens = 2048;

  if (step === "opening") {
    const { topic, title, uniqueAngle, beforeFeeling, afterFeeling } = allStepData;
    prompt = `${contextBlock}

VIDEO DETAILS:
Topic: ${topic}
Title: ${title}
Unique angle: ${uniqueAngle}
How viewer feels BEFORE: ${beforeFeeling}
How viewer feels AFTER: ${afterFeeling}

Generate the 4 ARC intro patterns for this specific video, plus relevant hook starters and a lead magnet mention line.

The 4 intro patterns are:
1. CONTRADICTION — Start with the opposite of what they expect
2. CONFIRMATION — Validate their exact feeling first  
3. EMPATHY — Show you've been there or you see them
4. STAKES — Make clear what's at risk if they don't watch

For each pattern, write the actual ~20-25 second opening script (word for word). Make them specific to this video's topic, title, and avatar.

Also suggest 2-3 hook starters that genuinely add value (not filler), and a natural lead magnet mention line.

Return as JSON:
{
  "intro_patterns": [
    { "name": "CONTRADICTION", "script": "Full opening text here..." },
    { "name": "CONFIRMATION", "script": "..." },
    { "name": "EMPATHY", "script": "..." },
    { "name": "STAKES", "script": "..." }
  ],
  "hook_starters": ["Hook option 1", "Hook option 2"],
  "lead_magnet_line": "Natural lead magnet mention..."
}`;
  } else if (step === "credibility") {
    const { topic, title, credentialInput } = allStepData;
    prompt = `${contextBlock}

VIDEO: ${title}
TOPIC: ${topic}
CREDENTIAL INPUT: ${credentialInput}

Based on this credential/proof point, suggest 3 natural ways to weave credibility into this specific video without sounding boastful. Write them as actual script lines.

Return as JSON:
{
  "suggestions": [
    { "line": "Actual script line", "placement": "Where in the video to use this" }
  ]
}`;
  } else if (step === "insights") {
    const { topic, title, insightCount } = allStepData;
    prompt = `${contextBlock}

VIDEO: ${title}
TOPIC: ${topic}
Number of insights needed: ${insightCount || 3}

Generate ${insightCount || 3} insight prompts using the Value Loop structure (What → Why → When → Story Proof → What This Means). For each insight slot, provide guiding questions to help the member fill it in. Do NOT generate the insights themselves — just the structure and prompts.

Return as JSON:
{
  "insight_slots": [
    {
      "slot": 1,
      "label": "Best insight (save for last)",
      "prompts": {
        "what": "Question to draw out the what",
        "why": "Question to draw out the why",
        "when": "Question to draw out the when",
        "story": "Prompt for a client story",
        "connection": "Question for what this means for the viewer"
      }
    }
  ]
}`;
  } else if (step === "final") {
    maxTokens = 4096;
    const { topic, title, uniqueAngle, selectedOpening, credibility, insights, values, interests } = allStepData;
    prompt = `${contextBlock}

VIDEO DETAILS:
Title: ${title}
Topic: ${topic}
Unique angle: ${uniqueAngle}

SELECTED OPENING:
${selectedOpening}

CREDIBILITY:
${credibility}

INSIGHTS (Value Loops):
${JSON.stringify(insights, null, 2)}

VALUES TO PEPPER IN: ${values}
PERSONAL INTERESTS: ${interests}

Assemble the complete ARC Method script outline. Include:
1. Full opening (as written)
2. Credibility signal (woven naturally)
3. Lead magnet mention #1
4. Each insight in Value Loop format (What → Why → When → Story Proof → What This Means)
5. 4-5 connection phrases distributed throughout (not clustered)
6. Values and interests peppered in at natural points
7. 5 curiosity bridges using And → But → Therefore transitions
8. Visual prompt suggestions (charts, maps, screen recordings, etc.)
9. Lead magnet mention #2 (at 2/3 point)
10. Closing with lead magnet mention #3

Also run the Final Script Checklist and return pass/fail for each item.

Return as JSON:
{
  "script_outline": {
    "opening": "Full opening text",
    "credibility": "Credibility signal text",
    "lead_magnet_1": "First mention text",
    "insights": [
      {
        "slot": 1,
        "what": "What text",
        "why": "Why text",
        "when": "When text",
        "story": "Story proof text",
        "connection": "What this means text",
        "curiosity_bridge": "Transition to next section"
      }
    ],
    "lead_magnet_2": "Second mention text",
    "closing": "Closing text with lead magnet #3",
    "visual_prompts": ["Visual suggestion 1", "Visual suggestion 2"],
    "connection_phrases": [
      { "phrase": "Phrase text", "placement": "Where in script" }
    ],
    "values_placed": [
      { "value": "Value text", "placement": "Where in script" }
    ]
  },
  "checklist": {
    "opening_length_ok": true,
    "opening_approves_click": true,
    "credibility_natural": true,
    "lead_magnet_3_times": true,
    "value_loops_correct": true,
    "no_how_to_implement": true,
    "connection_phrases_4_5": true,
    "values_peppered": true,
    "curiosity_bridges": true,
    "grade_5_language": true,
    "visual_prompts_identified": true
  }
}`;
  } else {
    return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  try {
    const parsed = JSON.parse(extracted);
    return NextResponse.json({ result: parsed });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
