import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { topic, selectedTheme, messages } = await req.json();
  if (!topic && (!messages || messages.length === 0)) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }

  // Get user's avatar and recent titles
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarProfile: true, contentThemes: true, youtubeHandle: true },
  });

  const avatarText = dbUser?.avatarProfile
    ? JSON.stringify(dbUser.avatarProfile)
    : "No avatar saved — generate titles for a general real estate audience";

  const themesText = dbUser?.contentThemes
    ? JSON.stringify(dbUser.contentThemes)
    : "No content themes saved";

  // Get recent audit titles if available
  const recentAudit = await prisma.audit.findFirst({
    where: { userId: user.id, auditType: "baseline" },
    orderBy: { createdAt: "desc" },
    select: { videosAnalysed: true },
  });

  let pastTitles = "No past titles available";
  if (recentAudit?.videosAnalysed) {
    const videos = recentAudit.videosAnalysed as any[];
    if (Array.isArray(videos)) {
      pastTitles = videos.slice(0, 10).map((v: any) => v.title || v.videoTitle).filter(Boolean).join("\n");
    }
  }

  const systemPrompt = `You are a YouTube Title Generator for Attraction by Video members. You generate irresistible, curiosity-driven, high-performance video titles using proven frameworks.

IMPORTANT RULES:
- Never use em dash, en dash or colons in titles
- Write at a grade 5 reading level
- Every title must be specific to the user's topic and avatar

MEMBER'S AVATAR:
${avatarText}

MEMBER'S CONTENT THEMES:
${themesText}

MEMBER'S PAST VIDEO TITLES (for reference — avoid duplicating):
${pastTitles}

Generate titles organised into these framework categories:

MISTAKES & WARNINGS:
- (Topic) & The Biggest Mistake You're Making
- This is Why 99% of (Audience) Don't (Achieve Goal)
- What (Authority Figures) DON'T Tell You About (Topic)
- STOP Doing This When (Activity)
- If You Hear (Authority Figure) Say This… RUN!

HOW-TO & EDUCATION:
- (Number) Things I Wish I Knew Before (Activity)
- The NEW Way To (Achieve Goal) in (Current Year)
- (Number) Tips NOBODY Tells You (but are EASY to do)
- How I (Activity) (With Proof of Credibility)

LISTS & RANKINGS:
- (Number) Signs Your (Journey) Is Going Well
- (Number) Habits of (Secretly Successful) People
- I Tried (Large Number). These (Small Number) Worked Best
- (Authority Figure) Ranks Best/Worst (Entities)

COMPARISONS:
- I Tested (Option A) vs (Option B) — Which Is Better?
- Is It Still Worth (Activity) in (Current Year)?
- Why (Underdog) Crushes Every Other (Option)

TIMELY & NEWS:
- The REALITY of (Topic) in (Current Year)
- Something Is About to Happen in (Place/Industry)
- New (Rules/Changes) for (Year) You MUST Know

STORY & CURIOSITY:
- If You (Experience Problem), Watch This
- Why Everything Changes If You (Specific Situation)
- They Said It Couldn't Be Done… But I Did It Anyway

For each category, generate 2-3 title options. Return your response as JSON in this exact structure:

{
  "categories": [
    {
      "name": "MISTAKES & WARNINGS",
      "titles": [
        {
          "title": "The actual title",
          "framework": "Which framework pattern it uses",
          "trigger": "curiosity|negativity|desire|urgency",
          "note": "Why it works for this avatar"
        }
      ]
    }
  ],
  "follow_up": "Which ones stand out? I can refine your favourites or explore different angles."
}

ONLY return valid JSON. No markdown, no code fences, no extra text.`;

  const customSetting = await prisma.appSetting.findUnique({ where: { key: "title_creator_prompt" } });
  const finalPrompt = customSetting?.value ?? systemPrompt;

  const chatMessages = messages && messages.length > 0
    ? messages
    : [{ role: "user" as const, content: `Generate title options for this video topic: ${topic}${selectedTheme ? `\nContent theme: ${selectedTheme}` : ""}` }];

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: finalPrompt,
    messages: chatMessages,
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  try {
    const parsed = JSON.parse(extracted);
    return NextResponse.json({ result: parsed, raw: rawText });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
