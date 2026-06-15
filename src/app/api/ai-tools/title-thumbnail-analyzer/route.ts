import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import { TITLE_THUMBNAIL_ANALYZER_PROMPT } from "@/lib/audit-engine";
import { logUsage } from "@/lib/ai-tool-cost";
import prisma from "@/lib/prisma";
import { getAvatarData } from "@/lib/avatar-utils";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractTitles(text: string): string[] {
  const lines = text.split("\n");
  const titles: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*\d+\.\s+(.{10,150})$/);
    if (match) {
      const t = match[1].trim().replace(/^\*+|\*+$/g, "");
      if (t.length >= 10) titles.push(t);
    }
  }
  return titles;
}

async function getMemberContext(userId: string) {
  const [avatar, latestAudit] = await Promise.all([
    getAvatarData(userId),
    prisma.audit.findFirst({
      where: { userId, auditType: "baseline" },
      orderBy: { createdAt: "desc" },
      select: { scores: true },
    }),
  ]);

  const avatarText = avatar.avatarProfile
    ? JSON.stringify(avatar.avatarProfile)
    : "No avatar saved";

  // Build theme context for title evaluation
  let themesText = "";
  if (Array.isArray(avatar.contentThemes) && avatar.contentThemes.length > 0) {
    themesText = "\n\nCONTENT THEMES (use to evaluate if title speaks to the right theme):\n";
    for (const t of avatar.contentThemes as any[]) {
      if (typeof t === "string") {
        themesText += `- ${t}\n`;
      } else {
        themesText += `- ${t.name ?? t}`;
        if (t.coreStress) themesText += ` — "${t.coreStress}"`;
        themesText += "\n";
      }
    }
  }

  const titleFrameworksScore = latestAudit?.scores
    ? (latestAudit.scores as any)?.title_frameworks?.score ?? "N/A"
    : "N/A";
  return { avatarText: avatarText + themesText, titleFrameworksScore, testAvatarLabel: avatar.testAvatarLabel };
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === "chat") {
    const { title, analysisResult, messages, introTranscript } = body;
    const { avatarText, titleFrameworksScore } = await getMemberContext(user.id);

    const customSetting = await prisma.appSetting.findUnique({
      where: { key: "title_thumbnail_analyzer_prompt" },
    });
    const basePrompt = customSetting?.value ?? TITLE_THUMBNAIL_ANALYZER_PROMPT;

    const thumbnailNote =
      analysisResult?.thumbnail?.score > 0
        ? "A thumbnail image was provided and analysed."
        : "No thumbnail was provided.";

    const introNote = introTranscript
      ? `VIDEO INTRO TRANSCRIPT (first ~30-60s):\n${introTranscript}`
      : "No intro transcript was provided.";

    const systemPrompt = `${basePrompt}

You are now in follow-up conversation mode. The member has completed their analysis and wants to go deeper.

ORIGINAL TITLE: "${title}"
${thumbnailNote}
${introNote}

FULL ANALYSIS RESULTS:
${JSON.stringify(analysisResult, null, 2)}

MEMBER AVATAR PROFILE:
${avatarText}

BASELINE TITLE FRAMEWORKS SCORE: ${titleFrameworksScore}

Your role: Help the member refine titles, create variations, adapt for different platforms, and answer specific questions about their title, thumbnail, and intro. When you provide a list of title alternatives, number each one clearly (1. Title here) so they can be saved. Keep responses concise and actionable.`;

    const apiMessages: Anthropic.MessageParam[] = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })
    );

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: systemPrompt,
      messages: apiMessages,
    });

    await logUsage(
      user.id,
      "title_thumbnail_analyzer_chat",
      response.usage.input_tokens,
      response.usage.output_tokens
    );

    const reply =
      response.content[0].type === "text" ? response.content[0].text : "";
    const titles = extractTitles(reply);

    return NextResponse.json({ reply, titles });
  }

  const { title, thumbnailBase64, thumbnailMimeType, introTranscript, thumbnailWords } = body;
  if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });
  const thumbWords = typeof thumbnailWords === "string" ? thumbnailWords.trim() : "";

  const { avatarText, titleFrameworksScore } = await getMemberContext(user.id);

  const memberContext = `MEMBER'S AVATAR:\n${avatarText}\n\nMEMBER'S BASELINE TITLE FRAMEWORKS SCORE: ${titleFrameworksScore}`;

  const customSetting = await prisma.appSetting.findUnique({
    where: { key: "title_thumbnail_analyzer_prompt" },
  });
  const basePrompt = customSetting?.value ?? TITLE_THUMBNAIL_ANALYZER_PROMPT;
  const finalSystemPrompt = `${basePrompt}\n\n${memberContext}`;

  const introInstructions = introTranscript
    ? `\n\nA video intro transcript has also been provided. Additionally evaluate whether this intro "approves the click" — does it deliver on the promise made by the title and thumbnail, and would the viewer feel satisfied they clicked? Include an "intro" key in your JSON response with: {"intro": {"score": <0-20>, "approves_click": <bool>, "observations": ["..."], "improvements": ["..."]}}`
    : "";

  const jsonReminder = `\n\nReturn ONLY valid JSON with the exact structure from your instructions — including "thumbnail", "title" (with "score", "attraction_scores", "observations", "alternatives"), "combined" (with "score", "avatar_would_click", "observations", "improvements", "redundancies", "thumbnail_concepts"), and "follow_up". Every field must be populated.`;

  const thumbWordsBlock = thumbWords ? `\n\nPlanned thumbnail text (the 2-3 words the member intends to put on the thumbnail): "${thumbWords}"` : "";

  const analysisText = thumbnailBase64
    ? `Analyse this title and thumbnail combination.\n\nTitle: "${title}"${thumbWordsBlock}${introTranscript ? `\n\nVideo intro transcript (first ~30-60 seconds):\n${introTranscript}` : ""}\n\nPlease provide your full analysis as JSON.${introInstructions}${jsonReminder}`
    : thumbWords
      ? `Analyse this title and the planned thumbnail copy${introTranscript ? " and video intro" : ""} (no thumbnail image provided — score the title-and-thumbnail-text combo for cognitive dissonance and click compulsion, and note that visual execution still needs evaluation).\n\nTitle: "${title}"${thumbWordsBlock}${introTranscript ? `\n\nVideo intro transcript (first ~30-60 seconds):\n${introTranscript}` : ""}\n\nIn the thumbnail score, evaluate how the planned text complements the title rather than penalising the lack of an image. Mention in observations that no image was provided.${introInstructions}${jsonReminder}`
      : `Analyse this title${introTranscript ? " and video intro" : ""} (no thumbnail provided — analyse title only).\n\nTitle: "${title}"${introTranscript ? `\n\nVideo intro transcript (first ~30-60 seconds):\n${introTranscript}` : ""}\n\nFor thumbnail fields, return score: 0 and note that no image was provided.${introInstructions}${jsonReminder}`;

  const userContent: Anthropic.MessageParam["content"] = thumbnailBase64
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: (thumbnailMimeType ||
              "image/jpeg") as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "image/gif",
            data: thumbnailBase64,
          },
        },
        { type: "text", text: analysisText },
      ]
    : analysisText;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: finalSystemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  await logUsage(
    user.id,
    "title_thumbnail_analyzer",
    response.usage.input_tokens,
    response.usage.output_tokens
  );

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  try {
    const parsed = JSON.parse(extracted);

    // Validate that essential fields exist — if not, the response was malformed
    const hasScores = parsed.thumbnail?.score != null || parsed.title?.score != null || parsed.combined?.score != null;
    if (!hasScores) {
      console.error("[title-analyzer] Malformed response — missing scores. Raw:", rawText.slice(0, 500));
      return NextResponse.json(
        { error: "Analysis returned incomplete data. Please try again." },
        { status: 500 }
      );
    }

    await prisma.titleAnalysis.create({
      data: {
        userId: user.id,
        videoTitle: title,
        scores: parsed,
      },
    });

    return NextResponse.json({ result: parsed });
  } catch {
    console.error("[title-analyzer] JSON parse failed. Raw:", rawText.slice(0, 500));
    return NextResponse.json(
      { error: "Failed to parse response. Please try again.", raw: rawText },
      { status: 500 }
    );
  }
}
