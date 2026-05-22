// Wave 1 Phase 2A — Fact Validator orchestration.
//
// Pipeline: load CSV + config → aggregate (csv-aggregate.ts, no Claude) →
// build user message → single Anthropic call with system-prompt caching →
// parse markdown → persist MarketFact + MarketStoryLead → mark upload validated.
//
// Cost cap is checked BEFORE the Anthropic call. If hard-blocked, the upload
// is marked `failed` with a friendly message and no Claude tokens are spent.
//
// Fire-and-forget contract: `validateUploadAsync(uploadId)` schedules
// `runValidation` on the microtask queue and returns immediately. Callers
// (the validate API route + the auto-trigger inside the upload route) MUST
// NOT await this — the upload route returns 200/202 instantly while the
// background work runs.

import Anthropic from "@anthropic-ai/sdk";
import Decimal from "decimal.js-light";
import prisma from "@/lib/prisma";
import { FACT_VALIDATOR_SYSTEM_PROMPT } from "@/lib/fact-validator-prompt";
import {
  aggregateUploadFromDb,
  type AggregatedTable,
} from "@/lib/csv-aggregate";
import {
  parseValidatorOutput,
  type ParsedFact,
  type ParsedStoryLead,
  type ParsedMetricFamily,
} from "@/lib/fact-validator-parser";
import { getCostCapStatus } from "@/lib/ai-tool-cost";
import type { MarketConfigShape } from "@/lib/market-config";

const SONNET_MODEL = "claude-sonnet-4-20250514";
// Sonnet pricing: $3 / 1M input, $12 / 1M output.
// Cached input is billed at 10% of the base input price ($0.30 / 1M).
const SONNET_INPUT_COST_PER_TOKEN = 0.000003;
const SONNET_OUTPUT_COST_PER_TOKEN = 0.000012;
const SONNET_CACHE_WRITE_PER_TOKEN = 0.00000375; // 1.25x base for cache writes
const SONNET_CACHE_READ_PER_TOKEN = 0.0000003; // 0.1x base for cache reads

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// Fire-and-forget entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schedules `runValidation(uploadId)` on the microtask queue without awaiting.
 * Safe to call from a route handler that returns 202 immediately. Any error
 * is caught and persisted to MarketDataUpload.status = 'failed'.
 */
export function validateUploadAsync(uploadId: string): void {
  Promise.resolve().then(async () => {
    try {
      await runValidation(uploadId);
    } catch (err) {
      // Defensive — runValidation should already mark failed on its own.
      // This catches anything thrown before the try/catch inside runValidation.
      try {
        await markUploadFailed(uploadId, err);
      } catch {
        // Last-resort: swallow to avoid unhandled rejection bringing down the route.
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// User message construction
// ─────────────────────────────────────────────────────────────────────────────

function serializeTable(table: AggregatedTable): string {
  // Compact but explicit. We tag the section headers so the validator can
  // see structure without having to parse JSON. Numbers are rounded to keep
  // the user message small (every saved token compounds across re-runs).
  const round = (n: number | null, digits = 2): string => {
    if (n == null) return "n/a";
    return Number(n.toFixed(digits)).toString();
  };

  const meta = table.meta;
  const header = [
    `Market: ${meta.marketName}${meta.mlsSource ? ` (${meta.mlsSource})` : ""}`,
    `Month: ${meta.monthYear}`,
    `CSV: ${meta.csvFileName}`,
    `Total rows parsed: ${meta.totalRowsParsed}`,
    `Total Sold rows: ${meta.totalSold}`,
    `Empty-zone rows: ${meta.emptyZoneCount}`,
    `Unknown-status rows: ${meta.unknownStatusCount}`,
    `Date range: ${meta.dateRangeMin ?? "n/a"} → ${meta.dateRangeMax ?? "n/a"}`,
    `YoY comparison month: ${meta.yoyComparisonMonthYear ?? "none available"}`,
    `90-day rolling priors: ${meta.rolling90dMonthYears.join(", ") || "none available"}`,
  ].join("\n");

  const groupLines = table.groups.map((g) => {
    const parts = [
      `- neighbourhood: ${g.neighbourhood}`,
      `  propertyType: ${g.propertyType ?? "n/a"}`,
      `  priceTier: ${g.priceTier ?? "n/a"}`,
      `  sampleSize: ${g.sampleSize}`,
      `  active=${g.activeCount} pending=${g.pendingCount} sold=${g.soldCount} expired=${g.expiredCount} terminated=${g.terminatedCount} withdrawn=${g.withdrawnCount}`,
      `  moi_strict: ${round(g.moiStrict)}`,
      `  moi_inclusive: ${round(g.moiInclusive)}`,
      `  medianPrice: ${round(g.medianPrice, 0)}`,
      `  medianSqft: ${round(g.medianSqft, 0)}`,
      `  psf: ${round(g.psf, 2)}`,
      `  dom_median: ${round(g.domMedian, 1)}`,
      `  dom_average: ${round(g.domAverage, 1)}`,
      `  sp_lp_ratio: ${round(g.spLpRatio, 4)}`,
      `  failure_rate_pct: ${round(g.failureRate, 2)}`,
      `  yoy_median_price_pct: ${round(g.yoy.medianPriceDelta, 2)}`,
      `  yoy_median_sqft_pct: ${round(g.yoy.medianSqftDelta, 2)}`,
      `  yoy_psf_pct: ${round(g.yoy.psfDelta, 2)}`,
      `  yoy_moi_strict_pct: ${round(g.yoy.moiStrictDelta, 2)}`,
      `  rolling90d_medianPrice: ${round(g.rolling90d.medianPrice, 0)}`,
      `  rolling90d_psf: ${round(g.rolling90d.psf, 2)}`,
      `  rolling90d_moi_strict: ${round(g.rolling90d.moiStrict, 2)}`,
      `  composition_shift_flag: ${g.compositionShiftFlag}`,
    ];
    if (g.rollupNotes.length > 0) {
      parts.push(`  rollup_notes: ${g.rollupNotes.join(" | ")}`);
    }
    return parts.join("\n");
  });

  return [
    "=== AGGREGATED INPUT (pre-computed by server; no Claude work needed for these numbers) ===",
    header,
    "",
    "=== GROUPS ===",
    ...groupLines,
  ].join("\n");
}

function serializeConfig(config: MarketConfigShape): string {
  return [
    "=== MARKET CONFIG ===",
    `marketName: ${config.marketName}`,
    `mlsSource: ${config.mlsSource}`,
    `priceTiers: ${JSON.stringify(config.priceTiers)}`,
    `moiThresholds: ${JSON.stringify(config.moiThresholds)}`,
    `highEndException: ${JSON.stringify(config.highEndException)}`,
    `neighbourhoodVocab: ${JSON.stringify(config.neighbourhoodVocab.slice(0, 200))}`,
    `subPersonasEnabled: ${JSON.stringify(
      config.subPersonas.filter((p) => p.enabled).map((p) => p.label),
    )}`,
  ].join("\n");
}

async function serializePriorFacts(userId: string, uploadId: string): Promise<string> {
  // Pull headline-safe facts from the 3 most recent prior uploads — keep token
  // cost low by capping at ~120 rows total. The validator uses these only for
  // trajectory context, not as authoritative numbers.
  const priorUploads = await prisma.marketDataUpload.findMany({
    where: {
      userId,
      id: { not: uploadId },
      status: "validated",
    },
    orderBy: { validatedAt: "desc" },
    take: 3,
    select: { id: true, monthYear: true },
  });
  if (priorUploads.length === 0) return "=== PRIOR FACTS ===\n(none — this is the first validated upload)";

  const facts = await prisma.marketFact.findMany({
    where: {
      uploadId: { in: priorUploads.map((u) => u.id) },
      usageClass: "headline_safe",
    },
    take: 120,
    orderBy: { createdAt: "desc" },
    select: {
      uploadId: true,
      neighbourhood: true,
      metricName: true,
      metricValue: true,
      sampleSize: true,
      dateContext: true,
      marketType: true,
      trajectory: true,
    },
  });
  const byUpload = new Map<string, string>(priorUploads.map((u) => [u.id, u.monthYear]));
  const lines = facts.map(
    (f) =>
      `- ${byUpload.get(f.uploadId) ?? "?"} ${f.neighbourhood} ${f.metricName}=${
        f.metricValue ?? "n/a"
      } n=${f.sampleSize ?? "n/a"} type=${f.marketType ?? "n/a"} traj=${f.trajectory ?? "n/a"}`,
  );
  return ["=== PRIOR FACTS (3 most recent validated uploads, headline-safe only) ===", ...lines].join("\n");
}

function buildUserMessage(
  table: AggregatedTable,
  config: MarketConfigShape,
  priorFactsBlock: string,
): string {
  return [
    serializeTable(table),
    "",
    serializeConfig(config),
    "",
    priorFactsBlock,
    "",
    "=== TASK ===",
    "Apply your FACT VALIDATOR MODE instructions to the data above. Output the three sections in the exact format the system prompt defines:",
    "  ## SUMMARY",
    "  ## STORY LEADS",
    "  ## VALIDATED FACTS LIBRARY",
    "Use the pre-computed numbers in the GROUPS block — do not recompute them. Your job is to classify, label, triangulate, and curate.",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic call (system caching + structured cost capture)
// ─────────────────────────────────────────────────────────────────────────────

interface AnthropicCall {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  costUsd: Decimal;
}

async function callValidator(
  userMessage: string,
  retryNote?: string,
): Promise<AnthropicCall> {
  // Anthropic SDK types: cache_control isn't typed on all message variants,
  // so we cast the system block to `any` to attach it. The HTTP wire format
  // accepts it identically.
  const systemBlocks = [
    {
      type: "text",
      text: FACT_VALIDATOR_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];
  if (retryNote) {
    messages.push({
      role: "user",
      content: `Your previous response didn't match the required structure (no parseable facts or story leads). Re-emit your output with the three required H2 sections (## SUMMARY, ## STORY LEADS, ## VALIDATED FACTS LIBRARY) in the exact format defined in the system prompt's OUTPUT FORMAT section. ${retryNote}`,
    });
  }

  const resp = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 16000,
    system: systemBlocks as unknown as Anthropic.Messages.TextBlockParam[],
    messages,
  });

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const usage = resp.usage as unknown as {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreateTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  const costUsd = new Decimal(inputTokens)
    .mul(SONNET_INPUT_COST_PER_TOKEN)
    .add(new Decimal(outputTokens).mul(SONNET_OUTPUT_COST_PER_TOKEN))
    .add(new Decimal(cacheCreateTokens).mul(SONNET_CACHE_WRITE_PER_TOKEN))
    .add(new Decimal(cacheReadTokens).mul(SONNET_CACHE_READ_PER_TOKEN));

  return { text, inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens, costUsd };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

function mapFactToPrisma(
  fact: ParsedFact,
  uploadId: string,
  userId: string,
): Parameters<typeof prisma.marketFact.create>[0]["data"] {
  // Aggregate `notes` from extraNotes + any prompt-emitted text we didn't pull
  // into a column. Keeps every raw scrap accessible for audit.
  const notes = fact.extraNotes ?? null;
  return {
    userId,
    uploadId,
    neighbourhood: fact.neighbourhood,
    propertyType: null, // not surfaced in validator output (we group inside the validator's neighbourhood field — e.g. "Calgary detached overall")
    priceTier: null,
    metricName: fact.metricName,
    metricFamily: fact.metricFamily as ParsedMetricFamily,
    metricValue: fact.metricValue,
    metricValueString: fact.metricValueString,
    sampleSize: fact.sampleSize,
    timeWindow: fact.timeWindow,
    dateContext: null,
    sourceUrl: fact.sourceUrl,
    sourceTitle: fact.sourceTitle,
    notes,
    marketType: fact.marketType ?? undefined,
    trajectory: fact.trajectory ?? undefined,
    usageClass: fact.usageClass,
    moiStrict: fact.moiStrict,
    moiInclusive: fact.moiInclusive,
    domMedian: fact.domMedian,
    domAverage: fact.domAverage,
    crebAligned: fact.crebAligned ?? null,
    crebDeltaEstimate: fact.crebDeltaEstimate,
    viewerCaveat: fact.viewerCaveat,
    inventoryGapWithCreb: fact.inventoryGapWithCreb,
    failureRateFormula: fact.failureRateFormula,
    usageNotes: fact.usageNotes,
  };
}

function mapLeadToPrisma(
  lead: ParsedStoryLead,
  uploadId: string,
  userId: string,
): Parameters<typeof prisma.marketStoryLead.create>[0]["data"] {
  return {
    userId,
    uploadId,
    scanType: lead.scanType,
    pattern: lead.pattern,
    dataThreads: lead.dataThreads,
    whyItMatters: lead.whyItMatters,
    suggestedRotationSlot: lead.rotationSlot ?? undefined,
    suggestedSubPersonas: lead.subPersonas,
    suggestedFramework: lead.suggestedFramework,
    tactileType: lead.tactileType,
    label: lead.label,
    isThesisLead: lead.isThesisLead,
    displayOrder: lead.displayOrder,
  };
}

async function persistResults(
  uploadId: string,
  userId: string,
  facts: ParsedFact[],
  leads: ParsedStoryLead[],
  costUsd: Decimal,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (facts.length > 0) {
      await tx.marketFact.createMany({
        data: facts.map((f) => mapFactToPrisma(f, uploadId, userId)),
      });
    }
    if (leads.length > 0) {
      // createMany doesn't take Json fields cleanly on all providers — do
      // individual creates for the small N (3-8 leads per validation).
      for (const lead of leads) {
        await tx.marketStoryLead.create({ data: mapLeadToPrisma(lead, uploadId, userId) });
      }
    }
    await tx.marketDataUpload.update({
      where: { id: uploadId },
      data: {
        status: "validated",
        validatedAt: new Date(),
        validationCostUsd: costUsd.toNumber(),
        validationError: null,
      },
    });
    await tx.aIToolUsage.create({
      data: {
        userId,
        toolType: "fact_validator",
        inputTokens,
        outputTokens,
        costUsd: costUsd.toString(),
      },
    });
  });
}

async function markUploadFailed(uploadId: string, err: unknown): Promise<void> {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  await prisma.marketDataUpload.update({
    where: { id: uploadId },
    data: {
      status: "failed",
      validationError: message.slice(0, 4000),
    },
  });
}

async function markUploadValidating(uploadId: string): Promise<void> {
  await prisma.marketDataUpload.update({
    where: { id: uploadId },
    data: { status: "validating" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export async function runValidation(uploadId: string): Promise<void> {
  // Resolve userId first (cheap) so we can run cost-cap BEFORE any heavy work.
  const upload = await prisma.marketDataUpload.findUnique({
    where: { id: uploadId },
    select: { id: true, userId: true, status: true },
  });
  if (!upload) throw new Error(`Upload ${uploadId} not found`);

  // Idempotency: a validated upload should not be re-run by accident.
  if (upload.status === "validated") return;

  try {
    // Cost cap FIRST. Don't even aggregate if we're hard-blocked.
    const cap = await getCostCapStatus(upload.userId);
    if (cap.hardBlocked) {
      await prisma.marketDataUpload.update({
        where: { id: uploadId },
        data: {
          status: "failed",
          validationError:
            "Monthly AI cost cap reached. Validation paused — try again next month, or contact admin if you need a higher cap.",
        },
      });
      return;
    }

    await markUploadValidating(uploadId);

    // Aggregate (pure compute, no Claude).
    const { table, userId, configSnapshot } = await aggregateUploadFromDb(uploadId);
    const priorFactsBlock = await serializePriorFacts(userId, uploadId);
    const userMessage = buildUserMessage(table, configSnapshot, priorFactsBlock);

    // First Claude call.
    let call = await callValidator(userMessage);
    let parsed = parseValidatorOutput(call.text);

    // Retry once if the output is structurally unusable.
    if (parsed.facts.length === 0 && parsed.storyLeads.length === 0) {
      const retry = await callValidator(
        userMessage,
        "Be sure each fact starts with `- neighbourhood:` and each Story Lead heading starts with `### LEAD #N — Label`.",
      );
      // Cost rolls up across both attempts.
      call = {
        text: retry.text,
        inputTokens: call.inputTokens + retry.inputTokens,
        outputTokens: call.outputTokens + retry.outputTokens,
        cacheCreateTokens: call.cacheCreateTokens + retry.cacheCreateTokens,
        cacheReadTokens: call.cacheReadTokens + retry.cacheReadTokens,
        costUsd: call.costUsd.add(retry.costUsd),
      };
      parsed = parseValidatorOutput(call.text);
    }

    if (parsed.facts.length === 0 && parsed.storyLeads.length === 0) {
      // Final failure — store the raw output so the operator can debug.
      await prisma.marketDataUpload.update({
        where: { id: uploadId },
        data: {
          status: "failed",
          validationCostUsd: call.costUsd.toNumber(),
          validationError: `Validator output did not contain any parseable facts or story leads after one retry.\n\n--- RAW OUTPUT ---\n${call.text.slice(0, 8000)}`,
        },
      });
      // Still log the spend so cost-cap stays honest.
      await prisma.aIToolUsage.create({
        data: {
          userId,
          toolType: "fact_validator",
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          costUsd: call.costUsd.toString(),
        },
      });
      return;
    }

    await persistResults(
      uploadId,
      userId,
      parsed.facts,
      parsed.storyLeads,
      call.costUsd,
      call.inputTokens,
      call.outputTokens,
    );
  } catch (err) {
    await markUploadFailed(uploadId, err);
    throw err;
  }
}
