import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { SCRIPT_REVIEW_PROMPT, SCRIPT_REVIEW_CHAT_SYSTEM_PROMPT } from "@/lib/audit-engine";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { getAvatarData } from "@/lib/avatar-utils";
import { parseOverallScore } from "@/lib/score-badge";
import { getFeatureFlags } from "@/lib/feature-flags";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-sonnet-4-20250514";

async function getSystemPromptForMode(userId: string, mode: "analysis" | "chat", avatar: string): Promise<string> {
  const key = mode === "analysis" ? "script_review_analysis_prompt" : "script_review_chat_prompt";
  const defaultPrompt = mode === "analysis" ? SCRIPT_REVIEW_PROMPT : SCRIPT_REVIEW_CHAT_SYSTEM_PROMPT;

  const setting = await prisma.appSetting.findUnique({ where: { key } });
  const prompt = setting?.value ?? defaultPrompt;
  return prompt.replace("{{AVATAR_CONTEXT}}", avatar).replace("{{FULL_AVATAR_PROFILE}}", avatar);
}

// Change 4: Updated buildAvatarContext to inject the full 11-section avatarProfile document
// including anxiety phases, internal monologue, emotional triggers, fears, and creator credentials.
// Previously only pulled avatarName, avatarSummary, and contentThemes (surface-level fields).
// Merged with remote improvements to content theme detail rendering.
function buildAvatarContext(user: any): { block: string; name: string | null } {
  if (!user.avatarSummary && !user.avatarName && !user.avatarProfile) {
    return {
      block: "",
      name: null,
    };
  }

  let block = "=== MEMBER AVATAR — HARD CONSTRAINT ===\n";
  block += "This is who the script must speak to. Every tone decision, word choice, and emotional beat must be calibrated to this specific person.\n\n";

  if (user.avatarName) block += `Avatar Name: ${user.avatarName}\n`;
  if (user.avatarSummary) block += `Avatar Summary: ${user.avatarSummary}\n`;

  // Include the full avatar profile if available (rich structured data from Avatar Architect)
  if (user.avatarProfile) {
    try {
      const profile = typeof user.avatarProfile === "string"
        ? JSON.parse(user.avatarProfile)
        : user.avatarProfile;
      block += "\nFull Avatar Profile:\n";
      block += JSON.stringify(profile, null, 2) + "\n";
    } catch {
      // If it's a plain string, include it directly
      if (typeof user.avatarProfile === "string") {
        block += `\nFull Avatar Profile:\n${user.avatarProfile}\n`;
      }
    }
  }


  if (user.contentThemes) {
    try {
      const themes =
        typeof user.contentThemes === "string"
          ? JSON.parse(user.contentThemes)
          : user.contentThemes;
      if (Array.isArray(themes) && themes.length > 0) {
        block += "\nContent Themes:\n";
        for (const t of themes) {
          if (typeof t === "string") {
            block += `  - ${t}\n`;
          } else {
            block += `  - ${t.name ?? t}`;
            if (t.coreStress) block += ` — "${t.coreStress}"`;
            block += "\n";
            if (t.content_engine_prompt) {
              block += `    Context: ${t.content_engine_prompt.slice(0, 300)}${t.content_engine_prompt.length > 300 ? "…" : ""}\n`;
            }
          }
        }
        block += "\n";
      }
    } catch {
      // ignore malformed JSON
    }
  }
  block += "\nUse this avatar context to evaluate Avatar Alignment and Values Peppering — does the script speak directly to this person's pain points, values, and aspirations?\n";
  return { block, name: user.avatarName ?? null };
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoTitle, scriptText, messages, conversationId, contentPlanId } = await req.json();
  const isFirstCall = !conversationId && videoTitle && scriptText;

  const avatarData = await getAvatarData(user.id);
  const avatar = buildAvatarContext({
    avatarName: avatarData.avatarName,
    avatarSummary: avatarData.avatarSummary,
    avatarProfile: avatarData.avatarProfile,
    contentThemes: avatarData.contentThemes,
  });

  if (isFirstCall) {
    const systemPrompt = await getSystemPromptForMode(user.id, "analysis", avatar.block);

    const userMessage = `Video Title: ${videoTitle}\n\nScript:\n${scriptText}`;

    // Change 1 (model) + Change 2 (max_tokens): Fixed model string and increased tokens from 4000 to 8192
    // Higher token limit is required to support the new rewritten_script field in the JSON output
    const response = await claude.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const markdownReport = response.content[0].type === "text" ? response.content[0].text : "";

    const conversationMessages = [
      { role: "user", content: `**Video Title:** ${videoTitle}\n\n**Script:**\n${scriptText}`, hidden: true },
      {
        role: "assistant",
        content: markdownReport,
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
        metadata: { avatarName: avatar.name },
      },
    });

    // Sprint 3 Part A: Save review as PlanArtifact when linked to a plan
    let savedToPlan = false;
    let planArtifactId: string | null = null;
    let overallScore: number | null = null;
    if (contentPlanId) {
      try {
        const flags = await getFeatureFlags();
        if (flags.tool_planner_linkage) {
          const plan = await prisma.contentPlan.findFirst({
            where: { id: contentPlanId, userId: user.id, deletedAt: null },
          });
          if (plan) {
            overallScore = parseOverallScore(markdownReport);
            const existing = await prisma.planArtifact.findFirst({
              where: { planId: plan.id, type: "script_review", supersededById: null },
              orderBy: { version: "desc" },
            });
            const nextVersion = existing ? existing.version + 1 : 1;
            const artifact = await prisma.$transaction(async (tx) => {
              const created = await tx.planArtifact.create({
                data: {
                  planId: plan.id,
                  type: "script_review",
                  content: markdownReport,
                  metadata: {
                    overallScore,
                    conversationId: conv.id,
                    videoTitle,
                    reviewedAt: new Date().toISOString(),
                  },
                  version: nextVersion,
                },
              });
              if (existing) {
                await tx.planArtifact.update({
                  where: { id: existing.id },
                  data: { supersededById: created.id },
                });
              }
              return created;
            });
            savedToPlan = true;
            planArtifactId = artifact.id;
          }
        }
      } catch (err) {
        console.error("[script-review] Failed to save PlanArtifact:", err);
      }
    }

    return NextResponse.json({
      markdownReport,
      conversationId: conv.id,
      savedToPlan,
      planArtifactId,
      overallScore,
    });
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
          content: String(m.content),
        }))
    : [];

  const chatMessages = [
    ...contextMessages,
    ...messages.map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content),
    })),
  ];

  // Change 1 (model) + Change 2 (max_tokens): Applied to chat call as well
  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: chatMessages,
  });

  const reply = response.content[0].type === "text" ? response.content[0].text : "";

  const savedMessages = Array.isArray(conversation.messages)
    ? [...(conversation.messages as any[])]
    : [];
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
