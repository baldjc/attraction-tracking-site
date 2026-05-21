import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import { getCostCapStatus } from "@/lib/ai-tool-cost";
import {
  extractTextFromUpload,
  parseResearchDocument,
} from "@/lib/knowledge-base-parser";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/member/knowledge-base/upload
 * multipart body (any of the below):
 *   - `text` (string) — raw markdown / plain text pasted by the member
 *   - `file` (single File) — .md / .txt / .docx / .pdf
 *   - `toolUsed` (string, optional) — "ChatGPT Deep Research" / "Claude" / "Perplexity" / etc.
 *
 * Pipeline: extract text → load member's MarketConfig.neighbourhoodVocab →
 * Haiku parse → upsert NeighbourhoodProfile rows → record the upload row.
 */
export async function POST(req: NextRequest) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  const cap = await getCostCapStatus(access.user.id);
  if (cap.hardBlocked) {
    return Response.json(
      {
        error:
          "You've reached your monthly AI usage cap. Parsing will resume next month.",
        capStatus: cap,
      },
      { status: 402 },
    );
  }

  const form = await req.formData();
  const textField = form.get("text");
  const fileField = form.get("file");
  const toolUsedField = form.get("toolUsed");
  const toolUsed =
    typeof toolUsedField === "string" && toolUsedField.trim().length
      ? toolUsedField.trim().slice(0, 120)
      : null;

  let rawContent = "";
  let sourceFileName: string | null = null;

  if (fileField instanceof File && fileField.size > 0) {
    sourceFileName = fileField.name;
    try {
      rawContent = await extractTextFromUpload(fileField);
    } catch (e) {
      return Response.json(
        {
          error: `Could not read that file (${fileField.name}). ${(e as Error).message}`,
        },
        { status: 400 },
      );
    }
  } else if (typeof textField === "string" && textField.trim().length) {
    rawContent = textField;
  }

  rawContent = rawContent.trim();
  if (rawContent.length < 200) {
    return Response.json(
      {
        error:
          "The document looks too short to parse. Paste at least one full neighbourhood profile, or upload your research file.",
      },
      { status: 400 },
    );
  }

  const config = await prisma.marketConfig.findUnique({
    where: { userId: access.user.id },
    select: { neighbourhoodVocab: true },
  });
  const vocab = Array.isArray(config?.neighbourhoodVocab)
    ? (config!.neighbourhoodVocab as unknown[]).filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      )
    : [];

  if (vocab.length === 0) {
    return Response.json(
      {
        error:
          "Add at least one neighbourhood to your Market Data setup before uploading research.",
      },
      { status: 400 },
    );
  }

  const uploadBatchId = randomUUID();

  const uploadRow = await prisma.neighbourhoodResearchUpload.create({
    data: {
      id: uploadBatchId,
      userId: access.user.id,
      rawContent,
      sourceFileName,
      toolUsed,
    },
  });

  let parseResult;
  try {
    parseResult = await parseResearchDocument(rawContent, vocab);
  } catch (e) {
    return Response.json(
      {
        uploadId: uploadRow.id,
        error: `Parse failed: ${(e as Error).message}`,
      },
      { status: 500 },
    );
  }

  // Upsert each parsed profile by (userId, neighbourhood). Upload is
  // authoritative — replace content + summary.
  for (const p of parseResult.profiles) {
    await prisma.neighbourhoodProfile.upsert({
      where: {
        userId_neighbourhood: {
          userId: access.user.id,
          neighbourhood: p.neighbourhood,
        },
      },
      create: {
        userId: access.user.id,
        neighbourhood: p.neighbourhood,
        content: p.content,
        summary: p.summary || null,
        sourceFile: sourceFileName,
        uploadBatchId: uploadRow.id,
      },
      update: {
        content: p.content,
        summary: p.summary || null,
        sourceFile: sourceFileName,
        uploadBatchId: uploadRow.id,
      },
    });
  }

  await prisma.neighbourhoodResearchUpload.update({
    where: { id: uploadRow.id },
    data: {
      parsedAt: new Date(),
      profileCount: parseResult.profiles.length,
      parseCostUsd: parseResult.costUsd,
      unmatchedSections: parseResult.unmatchedSections.length
        ? (parseResult.unmatchedSections as unknown as object)
        : undefined,
    },
  });

  await prisma.aIToolUsage.create({
    data: {
      userId: access.user.id,
      toolType: "knowledge_base_parse",
      inputTokens: parseResult.inputTokens,
      outputTokens: parseResult.outputTokens,
      costUsd: parseResult.costUsd.toString(),
    },
  });

  return Response.json({
    uploadId: uploadRow.id,
    profilesUpserted: parseResult.profiles.map((p) => p.neighbourhood),
    unmatchedSections: parseResult.unmatchedSections,
    costUsd: parseResult.costUsd,
  });
}
