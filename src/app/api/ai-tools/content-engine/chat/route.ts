import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { logUsage } from "@/lib/ai-tool-cost";
import { buildChatSystemPrompt, CONTENT_ENGINE_DEFAULT_ADDENDUM, getActiveThemeEnforceBuySide } from "@/lib/content-engine-prompts";
import prisma from "@/lib/prisma";
import { getAvatarData } from "@/lib/avatar-utils";
import { SONNET_MODEL } from "@/lib/ai-models";

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

  const [avatar, savedIdeas, customSetting] = await Promise.all([
    getAvatarData(user.id),
    prisma.savedIdea.findMany({
      where: { userId: user.id, theme },
      select: { title: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.appSetting.findUnique({ where: { key: "content_engine_prompt" } }),
  ]);

  let systemPrompt = buildChatSystemPrompt({
    avatarProfile: avatar.avatarProfile ?? null,
    contentThemes: avatar.contentThemes ?? null,
    niche: (avatar.niche ?? null) as string | string[] | null,
    city: avatar.city ?? null,
    savedTitles: savedIdeas.map((i) => i.title),
    theme,
  });

  const enforceBuySide = getActiveThemeEnforceBuySide(avatar.contentThemes ?? null, theme);
  const addendum = customSetting !== null ? (customSetting.value ?? "") : (enforceBuySide ? CONTENT_ENGINE_DEFAULT_ADDENDUM : "");
  if (addendum.trim()) {
    systemPrompt = systemPrompt + "\n\n" + addendum;
  }

  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  await logUsage(user.id, "content_engine", response.usage.input_tokens, response.usage.output_tokens);

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return NextResponse.json({ message: text });
}
