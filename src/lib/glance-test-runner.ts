import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { TITLE_THUMBNAIL_ANALYZER_PROMPT } from "@/lib/audit-engine";
import { logUsage } from "@/lib/ai-tool-cost";
import { resolveUsersForChannel } from "@/lib/reviewer-channel-resolver";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

async function downloadThumbnailAsBase64(
  url: string,
): Promise<{ b64: string; mime: ImageMime }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Thumbnail fetch ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = (res.headers.get("content-type") || "image/jpeg").toLowerCase();
  let mime: ImageMime = "image/jpeg";
  if (ct.includes("png")) mime = "image/png";
  else if (ct.includes("webp")) mime = "image/webp";
  else if (ct.includes("gif")) mime = "image/gif";
  return { b64: buf.toString("base64"), mime };
}

export async function runGlanceTestForVideo(
  videoId: string,
  channelRef: string,
  title: string,
  thumbnailUrl: string,
  runBy: string,
): Promise<void> {
  if (!thumbnailUrl) throw new Error("No thumbnail URL");
  const { b64, mime } = await downloadThumbnailAsBase64(thumbnailUrl);

  const userContent = [
    {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: mime,
        data: b64,
      },
    },
    {
      type: "text" as const,
      text: `Analyse this thumbnail for the Glance Test (0.5-second readability). Title: "${title}". Return JSON only with: {"thumbnail":{"score":<0-20>,"subject_clarity":<0-5>,"text_overload":<0-5>,"contrast":<0-5>,"emotional_read":<0-5>,"observations":["..."],"improvements":["..."]}}`,
    },
  ];

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    system: TITLE_THUMBNAIL_ANALYZER_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  await logUsage(
    runBy,
    "glance_test",
    response.usage.input_tokens,
    response.usage.output_tokens,
  );

  const raw =
    response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extracted) as Record<string, unknown>;
  } catch {
    parsed = { thumbnail: {} };
  }
  const thumb = (parsed.thumbnail ?? {}) as Record<string, unknown>;
  const num = (k: string) => Number(thumb[k] ?? 0) || 0;
  const arr = (k: string): string[] =>
    Array.isArray(thumb[k]) ? (thumb[k] as string[]) : [];

  await prisma.glanceTestResult.upsert({
    where: { videoId },
    update: {
      title,
      thumbnailUrl,
      propertyPop: num("subject_clarity"),
      faceClear: num("emotional_read"),
      contrast: num("contrast"),
      textMaxWords: num("text_overload"),
      overallScore: Math.round(num("score") * 5),
      observations: arr("observations"),
      improvements: arr("improvements"),
      rawResponse: JSON.parse(JSON.stringify(parsed)),
    },
    create: {
      videoId,
      channelRef,
      title,
      thumbnailUrl,
      propertyPop: num("subject_clarity"),
      faceClear: num("emotional_read"),
      contrast: num("contrast"),
      textMaxWords: num("text_overload"),
      overallScore: Math.round(num("score") * 5),
      observations: arr("observations"),
      improvements: arr("improvements"),
      rawResponse: JSON.parse(JSON.stringify(parsed)),
    },
  });
}

export async function runGlanceTestForChannel(
  channelRef: string,
  runBy: string,
): Promise<{ processed: number; skipped: number }> {
  const userIds = await resolveUsersForChannel(channelRef);
  if (userIds.length === 0) return { processed: 0, skipped: 0 };

  const videos = await prisma.youTubeVideo.findMany({
    where: { userId: { in: userIds } },
    orderBy: { publishedAt: "desc" },
    take: 30,
  });

  let processed = 0;
  let skipped = 0;
  for (const v of videos) {
    if (processed >= 10) break;
    if (!v.thumbnailUrl) {
      skipped++;
      continue;
    }
    const existing = await prisma.glanceTestResult.findUnique({
      where: { videoId: v.videoId },
    });
    if (existing) {
      skipped++;
      continue;
    }
    try {
      await runGlanceTestForVideo(
        v.videoId,
        channelRef,
        v.title,
        v.thumbnailUrl,
        runBy,
      );
      processed++;
    } catch (err) {
      console.error(`[glance-test] video ${v.videoId} failed:`, err);
    }
  }
  return { processed, skipped };
}
