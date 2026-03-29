import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { HELP_SYSTEM_PROMPT } from "@/lib/help-knowledge-base";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const conversation = await prisma.helpConversation.findFirst({
    where: {
      userId: user.id,
      createdAt: { gte: startOfToday },
    },
    orderBy: { createdAt: "desc" },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conversation) {
    return NextResponse.json({ conversationId: null, messages: [] });
  }

  return NextResponse.json({
    conversationId: conversation.id,
    messages: conversation.messages.map((m) => ({ role: m.role, content: m.content })),
  });
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, conversationId } = await req.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  let conversation;

  if (conversationId) {
    conversation = await prisma.helpConversation.findFirst({
      where: { id: conversationId, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  if (!conversation) {
    conversation = await prisma.helpConversation.create({
      data: { userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  await prisma.helpMessage.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: message.trim(),
    },
  });

  const allMessages = [
    ...conversation.messages,
    { role: "user", content: message.trim() },
  ];

  const last20 = allMessages.slice(-20);

  const claudeMessages = last20.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  let assistantReply = "I'm having a bit of trouble right now. Please try again in a moment.";

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: HELP_SYSTEM_PROMPT,
      messages: claudeMessages,
    });

    assistantReply =
      response.content[0]?.type === "text"
        ? response.content[0].text
        : assistantReply;
  } catch (err) {
    console.error("[help-api] Claude error:", err);
  }

  await prisma.helpMessage.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: assistantReply,
    },
  });

  return NextResponse.json({ conversationId: conversation.id, message: assistantReply });
}
