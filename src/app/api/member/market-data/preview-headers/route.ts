import { NextRequest } from "next/server";
import { requireMarketAccess } from "@/lib/market-config-server";
import { parseCsvPreview, detectMonthYearFromFilename } from "@/lib/market-csv";

export const runtime = "nodejs";

/**
 * POST multipart `file` field. Parses the CSV header row only and returns the
 * headers (+ a small sample). NO AI cost — this powers the interactive column
 * mapper's "Edit column mapping" entry point, where we just need the member's
 * real column names to populate the dropdowns. Does NOT persist anything.
 */
export async function POST(req: NextRequest) {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const preview = parseCsvPreview(buf);
  if (preview.headers.length === 0) {
    return Response.json(
      { error: "Could not read any column headers from this file." },
      { status: 400 },
    );
  }

  return Response.json({
    headers: preview.headers,
    sampleRows: preview.sampleRows.slice(0, 5),
    rowCount: preview.rowCount,
    detectedMonthYear: detectMonthYearFromFilename(file.name),
  });
}
