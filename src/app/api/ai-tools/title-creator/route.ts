import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { TITLE_CREATOR_PROMPT } from "@/lib/audit-engine";
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

  const memberContext = `MEMBER'S AVATAR:
${avatarText}

MEMBER'S CONTENT THEMES:
${themesText}

MEMBER'S PAST VIDEO TITLES (for reference — avoid duplicating):
${pastTitles}`;

  const customSetting = await prisma.appSetting.findUnique({ where: { key: "title_creator_prompt" } });
  const basePrompt = customSetting?.value ?? TITLE_CREATOR_PROMPT;
  const finalPrompt = `${basePrompt}\n\n${memberContext}`;

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
