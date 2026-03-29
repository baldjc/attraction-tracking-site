import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { logUsage } from "@/lib/ai-tool-cost";
import { buildChatSystemPrompt, CONTENT_ENGINE_DEFAULT_ADDENDUM } from "@/lib/content-engine-prompts";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { theme, messages } = await req.json() as {
    theme: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!theme || !messages?.length) {
    return NextResponse.json({ error: "Missing theme or messages" }, { status: 400 });
  }

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

  let systemPrompt = buildChatSystemPrompt({
    avatarProfile: dbUser?.avatarProfile ?? null,
    contentThemes: dbUser?.contentThemes ?? null,
    niche: (dbUser?.niche ?? null) as string | string[] | null,
    city: dbUser?.city ?? null,
    savedTitles: savedIdeas.map((i) => i.title),
    theme,
  });

  const addendum = customSetting !== null ? (customSetting.value ?? "") : CONTENT_ENGINE_DEFAULT_ADDENDUM;
  if (addendum.trim()) {
    systemPrompt = systemPrompt + "\n\n" + addendum;
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  await logUsage(user.id, "content_engine", response.usage.input_tokens, response.usage.output_tokens);

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return NextResponse.json({ message: text });
}
