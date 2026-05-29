import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { TITLE_THUMBNAIL_ANALYZER_PROMPT } from "@/lib/audit-engine";
import { getCostCapStatus, logUsage } from "@/lib/ai-tool-cost";
import { fetchDriveFileBytes } from "@/lib/google-drive";
import { parseVariants, getThumbnailBytes } from "@/lib/content-thumbnails";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type RankEntry = { variantId: string; label: number; score: number | null; reason: string };

// POST — head-to-head comparison of ALL of a plan's thumbnail variants. Sends
// every variant image to the analyzer in a single pass so it can rank them
// against each other (not just score each in isolation) and pick the strongest
// click-magnet for this title. The verdict is rendered in the editor; it is not
// persisted (the member still picks the winner explicitly).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { id } = await params;
  const plan = await prisma.contentPlan.findFirst({
    where: { id, userId: user.id },
    select: { thumbnailVariants: true, title: true, thumbnailWords: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!plan.title) {
    return NextResponse.json({ error: "Add a title before comparing thumbnails." }, { status: 400 });
  }

  const variants = parseVariants(plan.thumbnailVariants);
  if (variants.length < 2) {
    return NextResponse.json({ error: "Add at least two thumbnails to compare." }, { status: 400 });
  }

  // Load each variant's bytes from its backend (Drive or Object Storage).
  const loaded: Array<{ index: number; variantId: string; mimeType: string; bytes: Buffer }> = [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    let bytes: Buffer | null = null;
    try {
      if (v.storage === "drive" && v.driveFileId) {
        bytes = (await fetchDriveFileBytes(v.driveFileId))?.buffer ?? null;
      } else if (v.storage === "object" && v.key) {
        bytes = await getThumbnailBytes(v.key);
      }
    } catch (err) {
      console.error("[thumbnails/compare] fetch failed:", err);
    }
    if (bytes) {
      loaded.push({ index: i, variantId: v.id, mimeType: v.mimeType, bytes });
    }
  }
  if (loaded.length < 2) {
    return NextResponse.json({ error: "Could not load enough images to compare." }, { status: 502 });
  }

  const customSetting = await prisma.appSetting.findUnique({
    where: { key: "title_thumbnail_analyzer_prompt" },
  });
  const basePrompt = customSetting?.value ?? TITLE_THUMBNAIL_ANALYZER_PROMPT;

  const thumbWords = (plan.thumbnailWords ?? "").trim();
  const thumbWordsBlock = thumbWords ? `\n\nPlanned thumbnail text: "${thumbWords}"` : "";

  const content: Anthropic.MessageParam["content"] = [];
  for (const img of loaded) {
    content.push({ type: "text", text: `Thumbnail #${img.index + 1}:` });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: (img.mimeType === "image/png" ? "image/png" : "image/jpeg") as
          | "image/png"
          | "image/jpeg",
        data: img.bytes.toString("base64"),
      },
    });
  }
  content.push({
    type: "text",
    text:
      `Compare these ${loaded.length} thumbnails head-to-head for the title "${plan.title}".${thumbWordsBlock}\n\n` +
      `Judge them against each other on click-compulsion for this title — not in isolation. ` +
      `Return ONLY valid JSON of the shape: ` +
      `{ "winner": <thumbnail number>, "verdict": "<2-4 sentences explaining which wins and why, referencing the thumbnails by their number>", ` +
      `"ranking": [ { "thumbnail": <number>, "score": <0-100>, "reason": "<one sentence>" } ] }. ` +
      `Rank every thumbnail. Every field must be populated.`,
  });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: basePrompt,
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    console.error("[thumbnails/compare] anthropic failed:", err);
    return NextResponse.json({ error: "Comparison failed. Please try again." }, { status: 502 });
  }

  // Best-effort: a usage-logging failure must not discard a paid model result.
  try {
    await logUsage(
      user.id,
      "content_thumbnail_compare",
      response.usage.input_tokens,
      response.usage.output_tokens,
    );
  } catch (err) {
    console.error("[thumbnails/compare] logUsage failed:", err);
  }

  const rawText = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  // Map the model's 1-based "thumbnail number" back to a real variant id.
  const labelToVariant = new Map(loaded.map((l) => [l.index + 1, l.variantId]));

  let verdict: string | null = null;
  let winnerVariantId: string | null = null;
  let ranking: RankEntry[] = [];
  try {
    const parsed = JSON.parse(extracted);
    if (typeof parsed.verdict === "string") verdict = parsed.verdict.trim();
    if (typeof parsed.winner === "number") {
      winnerVariantId = labelToVariant.get(parsed.winner) ?? null;
    }
    if (Array.isArray(parsed.ranking)) {
      ranking = parsed.ranking
        .map((r: { thumbnail?: number; score?: number; reason?: string }) => {
          const label = typeof r?.thumbnail === "number" ? r.thumbnail : null;
          const variantId = label != null ? labelToVariant.get(label) : undefined;
          if (!variantId || label == null) return null;
          return {
            variantId,
            label,
            score: typeof r?.score === "number" ? Math.round(r.score) : null,
            reason: typeof r?.reason === "string" ? r.reason.trim() : "",
          };
        })
        .filter((r: RankEntry | null): r is RankEntry => r !== null);
    }
  } catch {
    console.error("[thumbnails/compare] JSON parse failed. Raw:", rawText.slice(0, 300));
  }

  if (!verdict) {
    return NextResponse.json({ error: "Could not read a verdict. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ verdict, winnerVariantId, ranking });
}
