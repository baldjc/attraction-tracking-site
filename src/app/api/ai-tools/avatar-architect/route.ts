import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { AVATAR_ARCHITECT_PROMPT } from "@/lib/audit-engine";
import prisma from "@/lib/prisma";
import { emitPhase } from "@/lib/ai-thinking-sse";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json() as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    hasBuild?: boolean;
    messageCount?: number;
  };
  const { messages, hasBuild = false, messageCount } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "Missing messages" }), { status: 400 });
  }

  const setting = await prisma.appSetting.findUnique({ where: { key: "avatar_architect_prompt" } });
  const systemPrompt = setting?.value ?? AVATAR_ARCHITECT_PROMPT;

  const msgCount = messageCount ?? messages.length;

  // Model routing:
  //   - hasBuild=true (post Phase 3 — Phase 3.5/4 conversation) → Haiku, 3000 tokens
  //   - hasBuild=false AND msgCount >= 14 (likely the Phase 3 build turn) → Sonnet, 8192 tokens
  //   - everything else (early coaching turns) → Haiku, 2000 tokens
  const isBuildTurn = !hasBuild && msgCount >= 14;
  const model = isBuildTurn ? "claude-sonnet-4-5" : "claude-haiku-4-5";
  const maxTokens = isBuildTurn ? 8192 : hasBuild ? 3000 : 2000;

  console.log(
    `[avatar-architect] user=${user.id} model=${model} maxTokens=${maxTokens} ` +
    `msgs=${messages.length} msgCount=${msgCount} hasBuild=${hasBuild} isBuildTurn=${isBuildTurn}`
  );

  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller may already be closed
        }
      };

      let fullText = "";
      let lastChunkAt = Date.now();
      let closed = false;

      const chunkTimer = setInterval(() => {
        if (Date.now() - lastChunkAt > 30_000 && !closed) {
          closed = true;
          clearInterval(chunkTimer);
          send({ type: "error", message: "No response from AI for 30 seconds — please try again." });
          controller.close();
        }
      }, 1000);

      try {
        // Wave 0.5 AI Thinking phase events. Indicator dismisses on first
        // content chunk; these run before Claude streams text.
        emitPhase(controller, "Reviewing your inputs...");

        const anthropicStream = client.messages.stream({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
        });

        emitPhase(controller, "Building avatar profile...");

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullText += text;
            lastChunkAt = Date.now();
            send({ type: "chunk", text });
          }
        }

        clearInterval(chunkTimer);

        // Post-stream phase — indicator re-shows briefly while we extract
        // structured data and persist the conversation.
        emitPhase(controller, "Finalizing themes and sub-personas...");

        const finalMsg = await anthropicStream.finalMessage();
        const usage = finalMsg.usage;
        console.log(
          `[avatar-architect] DONE model=${model} ` +
          `inputTokens=${usage.input_tokens} outputTokens=${usage.output_tokens} ` +
          `totalTokens=${usage.input_tokens + usage.output_tokens}`
        );

        const avatarMatch = fullText.match(/<AVATAR_DATA>([\s\S]*?)<\/AVATAR_DATA>/);
        let avatarData = null;
        if (avatarMatch) {
          try { avatarData = JSON.parse(avatarMatch[1].trim()); } catch { }
        }

        const themeMatch = fullText.match(/<THEME_SELECTION>([\s\S]*?)<\/THEME_SELECTION>/);
        let themeSelection = null;
        if (themeMatch) {
          try { themeSelection = JSON.parse(themeMatch[1].trim()); } catch { }
        }

        const cleanText = fullText
          .replace(/<AVATAR_DATA>[\s\S]*?<\/AVATAR_DATA>/g, "")
          .replace(/<THEME_SELECTION>[\s\S]*?<\/THEME_SELECTION>/g, "")
          .trim();

        // Persist conversation turn for analytics (best-effort)
        try {
          await prisma.aIToolUsage.create({
            data: {
              userId: user.id,
              toolType: "avatar_architect",
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              costUsd: "0",
            },
          });
          console.log(`[avatar-architect] usage saved for user=${user.id}`);
        } catch (usageErr) {
          console.warn(`[avatar-architect] failed to save usage:`, usageErr);
        }

        send({ type: "done", message: cleanText, avatarData, themeSelection });

        if (!closed) {
          closed = true;
          controller.close();
        }
      } catch (err: any) {
        clearInterval(chunkTimer);
        console.error(`[avatar-architect] stream error:`, err?.message ?? err);
        const msg = err?.message?.toLowerCase()?.includes("abort")
          ? "Request timed out — please try again."
          : (err?.message ?? "The AI service returned an error. Please try again.");
        if (!closed) {
          send({ type: "error", message: msg });
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
