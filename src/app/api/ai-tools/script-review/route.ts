import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { SCRIPT_REVIEW_PROMPT, SCRIPT_REVIEW_CHAT_SYSTEM_PROMPT } from "@/lib/audit-engine";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";

const claude = new Anthropic();

async function getSystemPromptForMode(userId: string, mode: "analysis" | "chat", avatar: string): Promise<string> {
  const key = mode === "analysis" ? "script_review_analysis_prompt" : "script_review_chat_prompt";
  const defaultPrompt = mode === "analysis" ? SCRIPT_REVIEW_PROMPT : SCRIPT_REVIEW_CHAT_SYSTEM_PROMPT;

  const setting = await prisma.appSetting.findUnique({ where: { key } });
  const prompt = setting?.value ?? defaultPrompt;
  return prompt.replace("{{AVATAR_CONTEXT}}", avatar);
}

function buildAvatarContext(user: any): { block: string; name: string | null } {
  if (!user.avatarSummary && !user.avatarName) {
    return {
      block: "",
      name: null,
    };
  }
  let block = "MEMBER AVATAR CONTEXT:\n";
  if (user.avatarName) block += `Avatar Name: ${user.avatarName}\n`;
  if (user.avatarSummary) block += `Avatar Summary: ${user.avatarSummary}\n`;
  if (user.contentThemes) {
    try {
      const themes = typeof user.contentThemes === "string"
        ? JSON.parse(user.contentThemes)
        : user.contentThemes;
      if (Array.isArray(themes) && themes.length > 0) {
        block += `Content Themes: ${themes.join(", ")}\n`;
      }
    } catch {
    }
  }
  block += "Use the avatar context to calibrate your feedback — does the script speak to the right person?\n";
  return { block, name: user.avatarName ?? null };
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarName: true, avatarSummary: true, contentThemes: true },
  });

  const { videoTitle, scriptText, messages, conversationId } = await req.json();
  const isFirstCall = !conversationId && videoTitle && scriptText;

  const avatar = buildAvatarContext(dbUser ?? {});

  if (isFirstCall) {
    const systemPrompt = await getSystemPromptForMode(user.id, "analysis", avatar.block);

    const userMessage = `Video Title: ${videoTitle}\n\nScript:\n${scriptText}`;

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";

    let analysis: any = null;
    try {
      const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "AI returned invalid JSON. Please try again.", raw },
        { status: 422 }
      );
    }

    const overallScore = analysis.overall_score ?? analysis.overallScore ?? null;

    const conversationMessages = [
      { role: "user", content: `**Video Title:** ${videoTitle}\n\n**Script:**\n${scriptText}`, hidden: true },
      {
        role: "assistant",
        content: analysis.one_sentence_diagnosis ?? "Script reviewed.",
        analysis,
        hidden: false,
      },
    ];

    const title = videoTitle.slice(0, 100);
    const conv = await prisma.aIToolConversation.create({
      data: {
        userId: user.id,
        toolType: "script_review",
        title,
        messages: conversationMessages as any,
        metadata: { overallScore, avatarName: avatar.name },
      },
    });

    return NextResponse.json({ analysis, conversationId: conv.id, overallScore });
  }

  if (!conversationId || !messages?.length) {
    return NextResponse.json({ error: "Missing conversationId or messages" }, { status: 400 });
  }

  const conversation = await prisma.aIToolConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (conversation.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const systemPrompt = await getSystemPromptForMode(user.id, "chat", avatar.block);

  const contextMessages = Array.isArray(conversation.messages)
    ? (conversation.messages as any[])
        .filter((m) => !m.hidden)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.role === "assistant" && m.analysis
            ? `[ANALYSIS SUMMARY] Score: ${(conversation.metadata as any)?.overallScore}/10. Diagnosis: ${m.analysis.one_sentence_diagnosis ?? ""}`
            : String(m.content),
        }))
    : [];

  const chatMessages = [
    ...contextMessages,
    ...messages.map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content),
    })),
  ];

  const response = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: systemPrompt,
    messages: chatMessages,
  });

  const reply = response.content[0].type === "text" ? response.content[0].text : "";

  const savedMessages = Array.isArray(conversation.messages) ? [...(conversation.messages as any[])] : [];
  for (const m of messages) {
    savedMessages.push({ role: m.role, content: m.content, hidden: false });
  }
  savedMessages.push({ role: "assistant", content: reply, hidden: false });

  await prisma.aIToolConversation.update({
    where: { id: conversationId },
    data: { messages: savedMessages },
  });

  return NextResponse.json({ reply, conversationId });
}
