import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { THEME_BUILDER_PROMPT } from "@/lib/audit-engine";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, themeName, avatarContext } = await req.json() as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    themeName?: string;
    avatarContext?: string;
  };
  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  const setting = await prisma.appSetting.findUnique({ where: { key: "theme_builder_prompt" } });
  const basePrompt = setting?.value ?? THEME_BUILDER_PROMPT;

  // Inject avatar context and theme name into the system prompt
  let systemPrompt = basePrompt;
  if (avatarContext) {
    systemPrompt += `\n\n---\n\nMEMBER'S AVATAR CONTEXT:\n${avatarContext}`;
  }
  if (themeName) {
    systemPrompt += `\n\nTHEME BEING BUILT: "${themeName}"`;
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: systemPrompt,
    messages,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Extract theme data if present
  const themeMatch = text.match(/<THEME_DATA>([\s\S]*?)<\/THEME_DATA>/);
  let themeData = null;
  if (themeMatch) {
    try {
      themeData = JSON.parse(themeMatch[1].trim());
    } catch {
      // ignore parse error
    }
  }

  return NextResponse.json({ message: text.replace(/<THEME_DATA>[\s\S]*?<\/THEME_DATA>/g, "").trim(), themeData });
}
