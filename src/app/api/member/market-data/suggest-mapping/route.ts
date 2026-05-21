import { NextRequest } from "next/server";
import { requireMarketAccess } from "@/lib/market-config";
import {
  parseCsvPreview,
  suggestColumnMapping,
  detectMonthYearFromFilename,
} from "@/lib/market-csv";
import prisma from "@/lib/prisma";
import { getCostCapStatus } from "@/lib/ai-tool-cost";

/**
 * POST multipart `file` field. Parses the CSV, runs one Haiku call to suggest
 * a column mapping, returns headers + sample + suggestion. Does NOT persist
 * the file or create a MarketDataUpload row — that happens in /upload.
 */
export async function POST(req: NextRequest) {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;

  const cap = await getCostCapStatus(access.user.id);
  if (cap.hardBlocked) {
    return Response.json(
      {
        error:
          "You've reached your monthly AI usage cap. Mapping will resume next month.",
        capStatus: cap,
      },
      { status: 402 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const preview = parseCsvPreview(buf);
  if (preview.headers.length === 0) {
    return Response.json(
      { error: "Could not read CSV headers." },
      { status: 400 },
    );
  }

  const suggestion = await suggestColumnMapping(preview);

  // Log cost for transparency (separate from validator).
  await prisma.aIToolUsage.create({
    data: {
      userId: access.user.id,
      toolType: "market_column_mapping",
      inputTokens: suggestion.inputTokens,
      outputTokens: suggestion.outputTokens,
      costUsd: suggestion.costUsd,
    },
  });

  return Response.json({
    detectedMonthYear: detectMonthYearFromFilename(file.name),
    headers: preview.headers,
    sampleRows: preview.sampleRows.slice(0, 10),
    rowCount: preview.rowCount,
    suggestedMapping: suggestion.mapping,
    costUsd: suggestion.costUsd,
  });
}
