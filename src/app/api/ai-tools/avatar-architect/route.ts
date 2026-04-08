import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { AVATAR_ARCHITECT_PROMPT } from "@/lib/audit-engine";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages } = await req.json() as { messages: Array<{ role: "user" | "assistant"; content: string }> };
  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  const setting = await prisma.appSetting.findUnique({ where: { key: "avatar_architect_prompt" } });
  const systemPrompt = setting?.value ?? AVATAR_ARCHITECT_PROMPT;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: systemPrompt,
    messages,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  const avatarMatch = text.match(/<AVATAR_DATA>([\s\S]*?)<\/AVATAR_DATA>/);
  let avatarData = null;
  if (avatarMatch) {
    try {
      avatarData = JSON.parse(avatarMatch[1].trim());
    } catch {
      // ignore parse error
    }
  }

  const themeSelectionMatch = text.match(/<THEME_SELECTION>([\s\S]*?)<\/THEME_SELECTION>/);
  let themeSelection = null;
  if (themeSelectionMatch) {
    try {
      themeSelection = JSON.parse(themeSelectionMatch[1].trim());
    } catch {
      // ignore parse error
    }
  }

  const cleanText = text
    .replace(/<AVATAR_DATA>[\s\S]*?<\/AVATAR_DATA>/g, "")
    .replace(/<THEME_SELECTION>[\s\S]*?<\/THEME_SELECTION>/g, "")
    .trim();

  return NextResponse.json({ message: cleanText, avatarData, themeSelection });
}
