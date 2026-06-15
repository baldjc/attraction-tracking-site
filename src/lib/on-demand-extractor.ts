/**
 * Layer 2 of the three-layer Script Builder data fallback — PAID on-demand
 * extraction. When Layer 1 (`findDataForScriptNeed`) returns nothing for a
 * `ScriptDataNeed`, the member can choose to spend a small amount to have Claude
 * read the relevant slice of their own uploaded CSV and extract the single
 * metric they're missing.
 *
 * Cost discipline is the whole point of this module — three independent gates
 * MUST short-circuit BEFORE any Claude call:
 *   1. sample floor   — < 10 in-scope rows -> none/sample_too_small (no spend).
 *   2. per-request    — estimated cost > maxCostUsd -> none/cost_cap_hit.
 *   3. monthly hard   — getCostCapStatus().hardBlocked -> none/cost_cap_hit.
 * The monthly check runs first (cheapest) so a capped member never even reads
 * the CSV. Only after all three pass do we spend a token.
 *
 * Every dependency that touches the network, the DB, or the clock is injectable
 * (`ExtractDeps`) so the gates can be unit-tested with a Claude spy that asserts
 * it was never called when a cap is hit.
 */
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import prismaDefault from "@/lib/prisma";
import {
  getCostCapStatus as realGetCostCapStatus,
  logUsage as realLogUsage,
  calculateCost,
  type CostCapStatus,
} from "@/lib/ai-tool-cost";
import { readUploadFile } from "@/lib/market-csv";
import { parseCsvPreview } from "@/lib/market-csv";
import type { ColumnMapping } from "@/lib/market-config";
import { MetricFamily } from "@/generated/prisma/enums";
import {
  estimateExtractionCostUsd,
  estimateExtractionTokens,
  unitForFamily,
  monthInWindow,
  EXTRACTION_PROMPT_OVERHEAD_TOKENS,
  EXTRACTION_TOKENS_PER_ROW,
  type ScriptDataNeed,
  type ScriptDataResult,
} from "@/lib/script-data-resolver";

const SONNET_MODEL = "claude-sonnet-4-5";
const SAMPLE_FLOOR = 10;
const DEFAULT_MAX_COST_USD = 1.0;
/**
 * Hard context-window guard. Claude's input window is 200K tokens; market-wide
 * needs match the ENTIRE CSV (tens of thousands of rows), and the per-request
 * COST cap ($1) is looser than the model's token limit — a slice can clear the
 * cost gate yet still overflow the context window (observed 203K-token 400s).
 * Bound the serialized rows to a safe budget (well under 200K to leave room for
 * the system prompt, output, and any per-row underestimate).
 */
const SAFE_PROMPT_INPUT_TOKENS = 150_000;
/** Tool-ledger tag — getCostCapStatus aggregates ALL tool types, so the label
 *  is informational only, but keep it stable for per-tool cost reporting. */
export const EXTRACTION_TOOL_TYPE = "script_data_extraction";

export interface ExtractOutcome {
  result: ScriptDataResult;
  /** Surface upstream so the banner can show the inline soft-cap warning. */
  softWarning: boolean;
  estimatedCostUsd: number;
}

export interface ClaudeExtractResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ExtractDeps {
  prisma: {
    marketDataUpload: {
      findFirst: (args: unknown) => Promise<{
        id: string;
        monthYear: string;
        csvStorageUrl: string | null;
        rowCount: number;
      } | null>;
    };
    marketConfig: {
      findUnique: (args: unknown) => Promise<{ columnMapping: unknown } | null>;
    };
    marketFact: { create: (args: unknown) => Promise<{ id: string }> };
    onDemandExtractionLog: { create: (args: unknown) => Promise<unknown> };
  };
  readCsv: (storageKey: string) => Promise<Buffer>;
  callClaude: (args: {
    system: string;
    user: string;
  }) => Promise<ClaudeExtractResponse>;
  getCostCapStatus: (userId: string) => Promise<CostCapStatus>;
  logUsage: (
    userId: string,
    toolType: string,
    inputTokens: number,
    outputTokens: number,
  ) => Promise<void>;
}

// ── Default (real) dependency wiring ────────────────────────────────────────

let anthropicSingleton: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!anthropicSingleton) {
    anthropicSingleton = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicSingleton;
}

function defaultDeps(): ExtractDeps {
  return {
    prisma: prismaDefault as unknown as ExtractDeps["prisma"],
    readCsv: readUploadFile,
    getCostCapStatus: realGetCostCapStatus,
    logUsage: realLogUsage,
    callClaude: async ({ system, user }) => {
      const { outputTokens } = estimateExtractionTokens(0);
      const resp = await anthropic().messages.create({
        model: SONNET_MODEL,
        max_tokens: Math.max(512, outputTokens + 128),
        system,
        messages: [{ role: "user", content: user }],
      });
      const text = resp.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      return {
        text,
        inputTokens: resp.usage?.input_tokens ?? 0,
        outputTokens: resp.usage?.output_tokens ?? 0,
      };
    },
  };
}

// ── Metric prompt config ────────────────────────────────────────────────────

const METRIC_INSTRUCTION: Record<MetricFamily, string> = {
  [MetricFamily.MEDIAN]: "the MEDIAN sale price across the rows, in whole dollars",
  [MetricFamily.AVG]: "the AVERAGE sale price across the rows, in whole dollars",
  [MetricFamily.BENCHMARK]: "the benchmark (typical) sale price, in whole dollars",
  [MetricFamily.PSF]: "the median price per square foot, in dollars",
  [MetricFamily.DOM]: "the MEDIAN days on market",
  [MetricFamily.MOI]: "the months of inventory (active listings ÷ monthly sales)",
  [MetricFamily.SP_LP]:
    "the MEDIAN sale-to-list ratio as a DECIMAL FRACTION (e.g. 0.985), using salePrice ÷ listPrice",
  [MetricFamily.INVENTORY]: "the COUNT of listings in scope",
  [MetricFamily.FAILURE_RATE]:
    "the share of listings that failed to sell (expired/withdrawn/cancelled ÷ total), as a percent 0–100",
  [MetricFamily.ABSORPTION]:
    "the absorption rate (sold ÷ active listings) for the period, as a percent 0–100",
  [MetricFamily.OTHER]:
    "the single most representative numeric value for the requested metric across the rows",
};

// Columns we project into the prompt (bounds token cost vs. dumping every col).
const PROJECTED_FIELDS: Array<keyof ColumnMapping> = [
  "neighbourhood",
  "propertyType",
  "salePrice",
  "listPrice",
  "daysOnMarket",
  "sqft",
  "saleToListRatio",
  "status",
  "date",
];

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function headerIndex(headers: string[], headerName?: string): number {
  if (!headerName) return -1;
  const want = norm(headerName);
  return headers.findIndex((h) => norm(h) === want);
}

/** Parse Claude's `{value, sampleSize, ...}` JSON, tolerating stray fences. */
export function parseExtractionJson(text: string): {
  value: number | null;
  sampleSize: number | null;
} {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const value =
      typeof parsed.value === "number" && Number.isFinite(parsed.value)
        ? parsed.value
        : null;
    const sampleSize =
      typeof parsed.sampleSize === "number" && Number.isFinite(parsed.sampleSize)
        ? Math.floor(parsed.sampleSize)
        : null;
    return { value, sampleSize };
  } catch {
    return { value: null, sampleSize: null };
  }
}

function metricLabel(family: MetricFamily): string {
  return `${family} (on-demand)`;
}

/**
 * Run a paid Layer 2 extraction for a single `ScriptDataNeed`. Returns a
 * `ScriptDataResult` (`on_demand_extraction` on success, `none` with a reason
 * otherwise) plus the monthly soft-warning flag for the banner.
 */
export async function extractOnDemand(
  params: { need: ScriptDataNeed; maxCostUsd?: number },
  deps: ExtractDeps = defaultDeps(),
): Promise<ExtractOutcome> {
  const { need } = params;
  const maxCostUsd = params.maxCostUsd ?? DEFAULT_MAX_COST_USD;
  const unit = unitForFamily(need.metricFamily);

  const none = (
    reason: "no_data" | "sample_too_small" | "cost_cap_hit",
    softWarning: boolean,
    estimatedCostUsd: number,
  ): ExtractOutcome => ({
    result: { source: "none", reason },
    softWarning,
    estimatedCostUsd,
  });

  // GATE 0 (cheapest, runs first): monthly hard cap. A capped member must never
  // even read their CSV, let alone reach Claude.
  const cap = await deps.getCostCapStatus(need.memberId);
  if (cap.hardBlocked) {
    return none("cost_cap_hit", cap.softWarning, 0);
  }

  // Resolve the most-recent validated upload whose month intersects the window.
  const upload = await deps.prisma.marketDataUpload.findFirst({
    where: { userId: need.memberId, status: "validated" },
    orderBy: [{ monthYear: "desc" }, { validatedAt: "desc" }],
    select: { id: true, monthYear: true, csvStorageUrl: true, rowCount: true },
  });
  if (!upload || !upload.csvStorageUrl || !monthInWindow(upload.monthYear, need.timeWindow)) {
    return none("no_data", cap.softWarning, 0);
  }

  const config = await deps.prisma.marketConfig.findUnique({
    where: { userId: need.memberId },
    select: { columnMapping: true },
  });
  const mapping = (config?.columnMapping ?? {}) as ColumnMapping;

  const buf = await deps.readCsv(upload.csvStorageUrl);
  const preview = parseCsvPreview(buf);
  const rows = preview.allRows ?? [];
  const headers = preview.headers;

  const hoodIdx = headerIndex(headers, mapping.neighbourhood);
  const typeIdx = headerIndex(headers, mapping.propertyType);

  // Filter to scope. Missing a mapped column -> can't constrain on it (treated
  // as market-wide / all-types) rather than silently returning nothing.
  const wantHood = need.neighbourhood ? norm(need.neighbourhood) : null;
  const wantType =
    need.propertyType && need.propertyType !== "All" ? norm(need.propertyType) : null;
  const filtered = rows.filter((r) => {
    if (wantHood !== null && hoodIdx >= 0 && norm(r[hoodIdx]) !== wantHood) {
      return false;
    }
    if (wantType !== null && typeIdx >= 0 && norm(r[typeIdx]) !== wantType) {
      return false;
    }
    return true;
  });

  const filteredRowCount = filtered.length;
  const estimatedCostUsd = estimateExtractionCostUsd(filteredRowCount);

  // GATE 1: sample floor — too thin to anchor a defensible stat, don't spend.
  if (filteredRowCount < SAMPLE_FLOOR) {
    await deps.prisma.onDemandExtractionLog.create({
      data: {
        userId: need.memberId,
        uploadId: upload.id,
        needSpec: need as unknown as object,
        estimatedCostUsd: estimatedCostUsd.toFixed(4),
        actualCostUsd: null,
        resultClassification: "sample_too_small",
      },
    });
    return none("sample_too_small", cap.softWarning, estimatedCostUsd);
  }

  // GATE 2: per-request estimate cap — bail BEFORE Claude when too expensive.
  if (estimatedCostUsd > maxCostUsd) {
    await deps.prisma.onDemandExtractionLog.create({
      data: {
        userId: need.memberId,
        uploadId: upload.id,
        needSpec: need as unknown as object,
        estimatedCostUsd: estimatedCostUsd.toFixed(4),
        actualCostUsd: null,
        resultClassification: "cost_cap_hit",
      },
    });
    return none("cost_cap_hit", cap.softWarning, estimatedCostUsd);
  }

  // All gates passed — build the focused prompt and spend a token.
  // Context-window guard: bound rows to a safe input-token budget. When the
  // in-scope slice is larger (market-wide needs match the whole CSV), take an
  // evenly-spaced sample so the median/average stays representative instead of
  // 400ing on "prompt is too long".
  const maxPromptRows = Math.max(
    SAMPLE_FLOOR,
    Math.floor(
      (SAFE_PROMPT_INPUT_TOKENS - EXTRACTION_PROMPT_OVERHEAD_TOKENS) /
        EXTRACTION_TOKENS_PER_ROW,
    ),
  );
  let promptRows = filtered;
  let sampledFromTotal = 0;
  if (filtered.length > maxPromptRows) {
    const stride = filtered.length / maxPromptRows;
    const sampled: typeof filtered = [];
    for (let i = 0; i < maxPromptRows; i++) {
      sampled.push(filtered[Math.floor(i * stride)]);
    }
    promptRows = sampled;
    sampledFromTotal = filtered.length;
  }

  const projected = PROJECTED_FIELDS.map((f) => ({
    field: f,
    idx: headerIndex(headers, mapping[f]),
  })).filter((c) => c.idx >= 0);
  const projectedHeader = projected.map((c) => c.field).join("\t");
  const projectedRows = promptRows
    .map((r) => projected.map((c) => (r[c.idx] ?? "").toString()).join("\t"))
    .join("\n");

  const system = `You extract ONE market-data metric from a filtered slice of a member's own MLS export. You never invent data and never widen scope.

GEOGRAPHIC SCOPE: Use ONLY the rows provided below. They are already filtered to the requested neighbourhood. Do not estimate beyond them.
PROPERTY-TYPE LOCK: The rows are already filtered to the requested property type. Do not generalize to other types.
SAMPLE FLOOR: If fewer than ${SAMPLE_FLOOR} rows are actually usable for this metric, return value null.

Respond with ONLY a JSON object, no prose and no markdown fences:
{"value": <number|null>, "sampleSize": <integer>, "unit": "<unit>", "note": "<short>"}`;

  const samplingNote =
    sampledFromTotal > 0
      ? `\nNOTE: The rows below are an evenly-spaced representative sample of ${sampledFromTotal} total in-scope rows (the full slice is too large to send). Compute the metric from this sample and set "sampleSize" to the number of rows you actually used.`
      : "";

  const user = `Metric to compute: ${METRIC_INSTRUCTION[need.metricFamily]}.
Expected unit: ${unit || "(none)"}.
Neighbourhood: ${need.neighbourhood ?? "(market-wide)"}.
Property type: ${need.propertyType ?? "(all types)"}.
Month: ${upload.monthYear}.${samplingNote}

Rows (tab-separated, header first):
${projectedHeader}
${projectedRows}

Return JSON only.`;

  const resp = await deps.callClaude({ system, user });
  // A real call happened — always record the spend on the shared ledger.
  await deps.logUsage(
    need.memberId,
    EXTRACTION_TOOL_TYPE,
    resp.inputTokens,
    resp.outputTokens,
  );
  const actualCostUsd = calculateCost(resp.inputTokens, resp.outputTokens).toNumber();

  const { value, sampleSize } = parseExtractionJson(resp.text);
  const effectiveSample = sampleSize ?? filteredRowCount;

  // Claude couldn't anchor a defensible value, or it self-reported too thin a
  // sample → no fact persisted, but the spend is already on the ledger.
  if (value === null || effectiveSample < SAMPLE_FLOOR) {
    await deps.prisma.onDemandExtractionLog.create({
      data: {
        userId: need.memberId,
        uploadId: upload.id,
        needSpec: need as unknown as object,
        estimatedCostUsd: estimatedCostUsd.toFixed(4),
        actualCostUsd: actualCostUsd.toFixed(4),
        resultClassification: value === null ? "no_value" : "sample_too_small",
      },
    });
    return none(
      value === null ? "no_data" : "sample_too_small",
      cap.softWarning,
      estimatedCostUsd,
    );
  }

  const requestId = randomUUID();
  const fact = await deps.prisma.marketFact.create({
    data: {
      userId: need.memberId,
      uploadId: upload.id,
      neighbourhood: need.neighbourhood ?? "All Neighbourhoods",
      propertyType: need.propertyType ?? null,
      metricName: metricLabel(need.metricFamily),
      metricFamily: need.metricFamily,
      metricValue: value,
      metricValueString: String(value),
      sampleSize: effectiveSample,
      timeWindow: upload.monthYear,
      dateContext: new Date(`${upload.monthYear.slice(0, 7)}-01T00:00:00Z`),
      // On-demand facts are texture-only: extracted ad-hoc, NOT vetted by the
      // headline-safe validator pass. The resolver maps texture accordingly.
      usageClass: "supporting_texture_only",
      sourceType: "on_demand_extraction",
      extractedAtCost: actualCostUsd.toFixed(4),
      extractedAtRequest: requestId,
    },
    select: { id: true },
  });

  await deps.prisma.onDemandExtractionLog.create({
    data: {
      userId: need.memberId,
      uploadId: upload.id,
      needSpec: need as unknown as object,
      estimatedCostUsd: estimatedCostUsd.toFixed(4),
      actualCostUsd: actualCostUsd.toFixed(4),
      resultClassification: "extracted",
      factId: fact.id,
    },
  });

  return {
    result: {
      source: "on_demand_extraction",
      value,
      unit,
      factId: fact.id,
      costUsd: actualCostUsd,
    },
    softWarning: cap.softWarning,
    estimatedCostUsd,
  };
}
