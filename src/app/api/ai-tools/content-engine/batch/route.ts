import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { logUsage } from "@/lib/ai-tool-cost";
import { buildBatchSystemPrompt } from "@/lib/content-engine-prompts";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY_2 || process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { theme } = await req.json();
  if (!theme) return NextResponse.json({ error: "Missing theme" }, { status: 400 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarProfile: true, contentThemes: true, niche: true, city: true },
  });

  const savedIdeas = await prisma.savedIdea.findMany({
    where: { userId: user.id, theme },
    select: { title: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const customSetting = await prisma.appSetting.findUnique({ where: { key: "content_engine_prompt" } });

  let systemPrompt = buildBatchSystemPrompt({
    avatarProfile: dbUser?.avatarProfile ?? null,
    contentThemes: dbUser?.contentThemes ?? null,
    niche: dbUser?.niche ?? null,
    city: dbUser?.city ?? null,
    savedTitles: savedIdeas.map((i) => i.title),
    theme,
  });

  if (customSetting?.value?.trim()) {
    systemPrompt = systemPrompt + "\n\n" + customSetting.value;
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Generate 5 video ideas for the content theme: "${theme}"`,
      },
    ],
  });

  await logUsage(user.id, "content_engine", response.usage.input_tokens, response.usage.output_tokens);

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";

  let parsed: { theme?: string; ideas?: unknown[] } = {};
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw: text }, { status: 500 });
  }

  return NextResponse.json(parsed);
}
