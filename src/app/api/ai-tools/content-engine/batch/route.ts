import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { logUsage } from "@/lib/ai-tool-cost";
import { buildBatchSystemPrompt, CONTENT_ENGINE_DEFAULT_ADDENDUM } from "@/lib/content-engine-prompts";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { theme, shownTitles = [] } = await req.json();
  if (!theme) return NextResponse.json({ error: "Missing theme" }, { status: 400 });

  console.log("[content-engine/batch] Generating for theme:", theme, "user:", user.id);

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
    niche: (dbUser?.niche ?? null) as string | string[] | null,
    city: dbUser?.city ?? null,
    savedTitles: savedIdeas.map((i) => i.title),
    shownTitles,
    theme,
  });

  const addendum = customSetting !== null ? (customSetting.value ?? "") : CONTENT_ENGINE_DEFAULT_ADDENDUM;
  if (addendum.trim()) {
    systemPrompt = systemPrompt + "\n\n" + addendum;
  }

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      temperature: 1,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Generate 5 video ideas for the content theme: "${theme}"`,
        },
      ],
    });
    console.log("[content-engine/batch] Claude responded, stop_reason:", response.stop_reason, "usage:", response.usage);
  } catch (err) {
    console.error("[content-engine/batch] Anthropic API error:", err);
    return NextResponse.json({ error: "AI request failed", detail: String(err) }, { status: 500 });
  }

  try {
    await logUsage(user.id, "content_engine", response.usage.input_tokens, response.usage.output_tokens);
  } catch (err) {
    console.warn("[content-engine/batch] logUsage failed (non-fatal):", err);
  }

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  console.log("[content-engine/batch] Raw response length:", text.length, "| First 200 chars:", text.slice(0, 200));

  let parsed: { theme?: string; ideas?: unknown[] } = {};
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("[content-engine/batch] JSON parse failed:", err, "| raw:", text.slice(0, 500));
    return NextResponse.json({ error: "Failed to parse AI response", raw: text }, { status: 500 });
  }

  console.log("[content-engine/batch] Parsed ideas count:", Array.isArray(parsed.ideas) ? parsed.ideas.length : "none");
  return NextResponse.json(parsed);
}
