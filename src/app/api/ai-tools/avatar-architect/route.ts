import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { AVATAR_ARCHITECT_PROMPT } from "@/lib/audit-engine";
import prisma from "@/lib/prisma";

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
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Check if avatar data is present
  const avatarMatch = text.match(/<AVATAR_DATA>([\s\S]*?)<\/AVATAR_DATA>/);
  let avatarData = null;
  if (avatarMatch) {
    try {
      avatarData = JSON.parse(avatarMatch[1].trim());
    } catch {
      // ignore parse error
    }
  }

  return NextResponse.json({ message: text, avatarData });
}
