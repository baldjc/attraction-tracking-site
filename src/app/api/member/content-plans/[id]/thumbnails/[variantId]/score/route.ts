import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { TITLE_THUMBNAIL_ANALYZER_PROMPT } from "@/lib/audit-engine";
import { getCostCapStatus, logUsage } from "@/lib/ai-tool-cost";
import { fetchDriveFileBytes } from "@/lib/google-drive";
import { SONNET_MODEL } from "@/lib/ai-models";
import {
  parseVariants,
  getThumbnailBytes,
  updateVariantsLocked,
} from "@/lib/content-thumbnails";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST — score a single thumbnail variant with the Title & Thumbnail Analyzer
// (Sonnet vision). Uses the plan's title + the variant image and stores the
// combined click-compulsion score (0-100) on the variant.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cap = await getCostCapStatus(user.id);
  if (cap.hardBlocked) {
    return NextResponse.json(
      { error: "Monthly AI usage limit reached. Try again next month." },
      { status: 402 },
    );
  }

  const { id, variantId } = await params;
  const plan = await prisma.contentPlan.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { thumbnailVariants: true, title: true, thumbnailWords: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!plan.title) {
    return NextResponse.json({ error: "Add a title before scoring thumbnails." }, { status: 400 });
  }

  const variants = parseVariants(plan.thumbnailVariants);
  const variant = variants.find((v) => v.id === variantId);
  if (!variant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let bytes: Buffer | null = null;
  try {
    if (variant.storage === "drive" && variant.driveFileId) {
      bytes = (await fetchDriveFileBytes(variant.driveFileId))?.buffer ?? null;
    } else if (variant.storage === "object" && variant.key) {
      bytes = await getThumbnailBytes(variant.key);
    }
  } catch (err) {
    console.error("[thumbnails/score] fetch failed:", err);
  }
  if (!bytes) return NextResponse.json({ error: "Could not load image" }, { status: 502 });

  const customSetting = await prisma.appSetting.findUnique({
    where: { key: "title_thumbnail_analyzer_prompt" },
  });
  const basePrompt = customSetting?.value ?? TITLE_THUMBNAIL_ANALYZER_PROMPT;

  const thumbWords = (plan.thumbnailWords ?? "").trim();
  const thumbWordsBlock = thumbWords
    ? `\n\nPlanned thumbnail text: "${thumbWords}"`
    : "";
  const analysisText = `Analyse this title and thumbnail combination.\n\nTitle: "${plan.title}"${thumbWordsBlock}\n\nReturn ONLY valid JSON including "thumbnail" (with "score") and "combined" (with "score", "observations", "improvements"). Every field must be populated.`;

  const mediaType = (variant.mimeType === "image/png" ? "image/png" : "image/jpeg") as
    | "image/png"
    | "image/jpeg";

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 2048,
      system: basePrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: bytes.toString("base64") },
            },
            { type: "text", text: analysisText },
          ],
        },
      ],
    });
  } catch (err) {
    console.error("[thumbnails/score] anthropic failed:", err);
    return NextResponse.json({ error: "Scoring failed. Please try again." }, { status: 502 });
  }

  // Best-effort: a usage-logging failure must not discard a paid model result.
  try {
    await logUsage(
      user.id,
      "content_thumbnail_score",
      response.usage.input_tokens,
      response.usage.output_tokens,
    );
  } catch (err) {
    console.error("[thumbnails/score] logUsage failed:", err);
  }

  const rawText = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  let score: number | null = null;
  let notes: string | null = null;
  try {
    const parsed = JSON.parse(extracted);
    const raw = parsed.combined?.score ?? parsed.thumbnail?.score ?? null;
    score = typeof raw === "number" ? Math.round(raw) : null;
    const obs = parsed.combined?.observations ?? parsed.thumbnail?.observations;
    if (Array.isArray(obs) && obs.length > 0) {
      notes = obs.slice(0, 2).map(String).join(" ");
    }
  } catch {
    console.error("[thumbnails/score] JSON parse failed. Raw:", rawText.slice(0, 300));
  }
  if (score == null) {
    return NextResponse.json({ error: "Could not read a score. Please try again." }, { status: 500 });
  }

  let found = false;
  const result = await updateVariantsLocked(id, user.id, (current, winnerId) => {
    const next = current.map((v) => {
      if (v.id === variantId) {
        found = true;
        return { ...v, score, scoreNotes: notes };
      }
      return v;
    });
    return { variants: next, winnerId };
  });
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!found) return NextResponse.json({ error: "Thumbnail was removed." }, { status: 404 });

  return NextResponse.json({ variants: result.variants, score, scoreNotes: notes });
}
