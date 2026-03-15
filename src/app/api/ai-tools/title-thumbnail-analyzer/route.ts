import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { TITLE_THUMBNAIL_ANALYZER_PROMPT } from "@/lib/audit-engine";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, thumbnailBase64, thumbnailMimeType } = await req.json();
  if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { avatarProfile: true },
  });

  const latestAudit = await prisma.audit.findFirst({
    where: { userId: user.id, auditType: "baseline" },
    orderBy: { createdAt: "desc" },
    select: { scores: true },
  });

  const avatarText = dbUser?.avatarProfile
    ? JSON.stringify(dbUser.avatarProfile)
    : "No avatar saved";

  const titleFrameworksScore = latestAudit?.scores
    ? (latestAudit.scores as any)?.title_frameworks?.score ?? "N/A"
    : "N/A";

  const memberContext = `MEMBER'S AVATAR:
${avatarText}

MEMBER'S BASELINE TITLE FRAMEWORKS SCORE: ${titleFrameworksScore}`;

  const customSetting = await prisma.appSetting.findUnique({ where: { key: "title_thumbnail_analyzer_prompt" } });
  const basePrompt = customSetting?.value ?? TITLE_THUMBNAIL_ANALYZER_PROMPT;
  const finalSystemPrompt = `${basePrompt}\n\n${memberContext}`;

  const userContent: Anthropic.MessageParam["content"] = thumbnailBase64
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: (thumbnailMimeType || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: thumbnailBase64,
          },
        },
        { type: "text", text: `Analyse this title and thumbnail combination.\n\nTitle: "${title}"\n\nPlease provide your full analysis as JSON.` },
      ]
    : `Analyse this title (no thumbnail provided — analyse title only).\n\nTitle: "${title}"\n\nFor thumbnail fields, return score: 0 and note that no image was provided. Provide your full analysis as JSON.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: finalSystemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  try {
    const parsed = JSON.parse(extracted);

    // Save the analysis for tracking
    await prisma.titleAnalysis.create({
      data: {
        userId: user.id,
        videoTitle: title,
        scores: parsed,
      },
    });

    return NextResponse.json({ result: parsed });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
