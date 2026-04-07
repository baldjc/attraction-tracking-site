import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { THEME_BUILDER_PROMPT } from "@/lib/audit-engine";
import { checkCostCap, logUsage } from "@/lib/ai-tool-cost";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, aiToolsMonthlyCapOverride: true },
  });
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const capCheck = await checkCostCap(dbUser.id);
  if (!capCheck.allowed) {
    return NextResponse.json(
      { error: "monthly_cap_reached", resetsAt: capCheck.resetsAt },
      { status: 429 }
    );
  }

  const { messages, themeName, avatarContext, memberName, city, enforceBuySideTitles } = await req.json() as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    themeName?: string;
    avatarContext?: string;
    memberName?: string;
    city?: string;
    enforceBuySideTitles?: boolean;
  };
  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  const setting = await prisma.appSetting.findUnique({ where: { key: "theme_builder_prompt" } });
  const basePrompt = setting?.value ?? THEME_BUILDER_PROMPT;

  const buySideFlag = enforceBuySideTitles === true ? "true" : "false";
  const systemPrompt = `${basePrompt}

---

SESSION CONTEXT:
[ACTIVE_THEME]: ${themeName ?? "Not specified"}
[AVATAR_PROFILE]: ${avatarContext ?? "Not provided"}
[MEMBER_NAME]: ${memberName ?? "Member"}
[CITY]: ${city ?? "Not specified"}
[ENFORCE_BUY_SIDE_TITLES]: ${buySideFlag}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: systemPrompt,
      messages,
    });

    await logUsage(
      dbUser.id,
      "theme_builder",
      response.usage.input_tokens,
      response.usage.output_tokens
    );

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    const themeMatch = text.match(/<THEME_DATA>([\s\S]*?)<\/THEME_DATA>/);
    let themeData = null;
    if (themeMatch) {
      try {
        themeData = JSON.parse(themeMatch[1].trim());
      } catch {
        // ignore parse error — theme data is optional
      }
    }

    return NextResponse.json({
      message: text.replace(/<THEME_DATA>[\s\S]*?<\/THEME_DATA>/g, "").trim(),
      themeData,
    });
  } catch (err) {
    console.error("[theme-builder] Anthropic API error:", err);
    return NextResponse.json(
      { error: "AI service error. Please try again." },
      { status: 500 }
    );
  }
}
