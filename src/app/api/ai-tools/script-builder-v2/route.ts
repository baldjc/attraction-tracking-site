/**
 * POST /api/ai-tools/script-builder-v2
 *
 * Wave 3 — Script Builder v2 (Talking Head). Streams a FACT → CLARITY
 * arc script for a Wave 2 ContentPlan with full lineage (rotationSlot,
 * titlePromise, linkedFactIds ≥ 3, linkedStoryLeadId?, visualPeak,
 * thumbnailWords). Server-side enforces the five locked content rules
 * via `validateScript()` (script-content-rules.ts) AFTER each generation
 * attempt — failures trigger a re-prompt loop up to MAX_REPROMPTS.
 *
 * Response: Server-Sent Events (text/event-stream).
 *
 *   event: phase
 *   data: {"key": "load", "label": "Loading your facts and neighbourhood context..."}
 *
 *   event: phase
 *   data: {"key": "intro", "label": "Drafting the 2-beat intro..."}
 *
 *   event: token
 *   data: {"text": "..."}
 *
 *   ... (more `token` events as Claude streams) ...
 *
 *   event: phase
 *   data: {"key": "validate", "label": "Validating content rules..."}
 *
 *   event: complete
 *   data: {
 *     script: "...",
 *     attempt: 0,                          // 0 = first try, 1-2 = re-prompts
 *     warnings: [ScriptViolation, ...],    // soft-warning violations only
 *     metrics: { dialogueWordCount, anchoredDetailCount, anchoredDetailsPer120Words },
 *     monthSpendUsd: 12.34
 *   }
 *
 * On unrecoverable validation failure (errors persisted across MAX_REPROMPTS
 * retries), the route emits `event: error` with the violations and closes:
 *
 *   event: error
 *   data: { error: "validation_gate_failed", violations: [ScriptViolation, ...], ... }
 *
 * Cost cap: getCostCapStatus() runs BEFORE the stream opens; hard-blocked
 * members get a JSON 402 response (NOT a stream — the EventSource consumer
 * never opens). logUsage() is called in a finally-equivalent block so an
 * aborted stream still bills for the tokens already consumed.
 *
 * AbortController: req.signal aborts when the client EventSource closes
 * (or the wizard component unmounts mid-stream). The Anthropic SDK call
 * is bound to that signal so upstream stops billing immediately.
 *
 * The script is NOT persisted by this route — the wizard's "Approve & Save"
 * button POSTs the returned script to a separate save endpoint (commit 6).
 * That two-step flow is the spec's "don't silently save bad output" gate
 * even when validation passes.
 */
import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getCostCapStatus, logUsage } from "@/lib/ai-tool-cost";
import prisma from "@/lib/prisma";
import { SCRIPT_BUILDER_MODE_PROMPT } from "@/lib/script-builder-mode-prompt";
import {
  autoFixMechanicalRules,
  autoSoftenUnanchoredStats,
  validateScript,
  type ScriptViolation,
  type ScriptValidationResult,
} from "@/lib/script-content-rules";
import {
  getSourceOfTruthMetrics,
  renderSourceOfTruthBlockWithLock,
  type SourceOfTruthMetric,
} from "@/lib/aggregated-metrics";
import {
  loadMarketConfigSummary,
  type MarketConfigSummary,
} from "@/lib/content-engine-context";
import { getNeighbourhoodContext } from "@/lib/get-neighbourhood-context";
import {
  ROTATION_SLOT_LABELS,
  METRIC_NAME_LABELS,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";

export const runtime = "nodejs";
export const maxDuration = 300; // ~5 min for a 12-16 min script + re-prompts

const SONNET_MODEL = "claude-sonnet-4-20250514";
const MAX_REPROMPTS = 2;
const MAX_OUTPUT_TOKENS = 12000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface RegenerationBrief {
  selectedSuggestions?: Array<{
    category?: string;
    title?: string;
    regenerationDirective?: string;
  }>;
  customNotes?: string;
  priorScript?: string;
}

interface RequestBody {
  planId?: string;
  shootType?: "talking_head" | "home_tour";
  regenerationBrief?: RegenerationBrief;
}

interface CitedFact {
  id: string;
  neighbourhood: string;
  metricName: string;
  metricLabel: string;
  metricValueString: string;
  monthYear: string;
  marketType: string | null;
  trajectory: string | null;
  caveat: string | null;
}

interface PlanContext {
  id: string;
  title: string;
  rotationSlot: RotationSlotKey;
  titlePromise: string;
  visualPeak: string | null;
  thumbnailCallouts: string[];
  subPersonas: string[] | null;
  tactileType: string | null;
  framework: string | null;
  clarityPremise: string | null;
  estimatedRuntime: string | null;
}

interface AssignedCampaign {
  name: string;
  destinationUrl: string;
  leadMagnetUrl: string | null;
  description: string | null;
  pitchOneLiner: string | null;
  audience: string | null;
}

interface AssignedBingeVideo {
  title: string;
  theme: string | null;
  status: string;
  youtubeVideoId: string | null;
}

// ContentPlan statuses for which the binge target is not yet usable —
// we don't want the script to tease a video the member hasn't committed
// to make yet. Match by case-insensitive trim against ContentPlan.status.
const EARLY_PLAN_STATUSES = new Set(["idea", "future idea"]);

// Statuses at which the YouTube video id can be embedded as a card URL.
const PUBLISHED_PLAN_STATUSES = new Set([
  "live on yt",
  "live",
  "published",
]);

// ───────────────────────────────────────────────────────────────────────
// POST handler
// ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth + feature flag (HTTP errors before opening the stream) ──────
  const session = await auth();
  const userId = session?.user?.id;
  const userRole = session?.user?.role ?? null;
  if (!userId) return jsonError(401, "Unauthorized");

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_script_builder_v2) return jsonError(404, "Not enabled");

  // ── Cost cap (hard block before any Claude work) ─────────────────────
  const cap = await getCostCapStatus(userId);
  if (cap.hardBlocked) {
    return jsonError(
      402,
      "monthly_cost_cap_reached",
      `You've hit your $${cap.capUsd.toFixed(2)} monthly AI budget. It resets on the 1st of next month.`,
    );
  }

  // ── Parse + validate body ────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json");
  }
  if (!body.planId) return jsonError(400, "missing_plan_id");
  const shootType = body.shootType ?? "talking_head";
  if (shootType !== "talking_head") {
    return jsonError(
      400,
      "unsupported_shoot_type",
      "Only talking_head is supported in Wave 3. Home Tour ships in Wave 4.",
    );
  }

  // ── Load ContentPlan + lineage (ownership-filtered) ──────────────────
  const plan = await prisma.contentPlan.findFirst({
    where: { id: body.planId, userId },
    select: {
      id: true,
      title: true,
      rotationSlot: true,
      titlePromise: true,
      visualPeak: true,
      thumbnailWords: true,
      linkedFactIds: true,
      researchNotes: true,
      linkedCampaignId: true,
      bingeVideoId: true,
      propertyTypeFocus: true,
    },
  });
  if (!plan) return jsonError(404, "plan_not_found");
  if (!plan.rotationSlot) {
    return jsonError(
      409,
      "plan_missing_lineage",
      "This plan wasn't created with the Wave 2 wizard — Script Builder v2 needs rotationSlot + linked facts.",
    );
  }
  if (!plan.titlePromise) {
    return jsonError(
      409,
      "plan_missing_title_promise",
      "This plan is missing titlePromise — Script Builder v2 needs it to anchor the first 30 seconds.",
    );
  }

  const linkedFactIds: string[] = Array.isArray(plan.linkedFactIds)
    ? (plan.linkedFactIds as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];
  if (linkedFactIds.length < 3) {
    return jsonError(
      409,
      "insufficient_linked_facts",
      `Need ≥3 linked facts to write a script — this plan has ${linkedFactIds.length}.`,
    );
  }

  // ── Build the PlanContext from first-class columns + researchNotes ───
  const parsedNotes = parseResearchNotesBlob(plan.researchNotes ?? "");
  const planContext: PlanContext = {
    id: plan.id,
    title: plan.title,
    rotationSlot: plan.rotationSlot as RotationSlotKey,
    titlePromise: plan.titlePromise,
    visualPeak: plan.visualPeak,
    thumbnailCallouts: (plan.thumbnailWords ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    subPersonas: parsedNotes.subPersonas,
    tactileType: parsedNotes.tactileType,
    framework: parsedNotes.framework,
    clarityPremise: parsedNotes.clarityPremise,
    estimatedRuntime: parsedNotes.estimatedRuntime,
  };

  // ── Load cited facts (ownership-filtered on the JOIN) ────────────────
  const factRows = await prisma.marketFact.findMany({
    where: { id: { in: linkedFactIds }, userId },
    select: {
      id: true,
      neighbourhood: true,
      metricName: true,
      metricValue: true,
      metricValueString: true,
      dateContext: true,
      marketType: true,
      trajectory: true,
      viewerCaveat: true,
      uploadId: true,
      upload: { select: { monthYear: true } },
    },
  });
  if (factRows.length < 3) {
    return jsonError(
      409,
      "cited_facts_not_found",
      `Only ${factRows.length} of the plan's ${linkedFactIds.length} linked facts are still in your facts library — Script Builder v2 needs ≥3. Some may have been deleted; re-run the wizard to relink.`,
    );
  }
  // Preserve linkedFactIds order so the script cites them in the order
  // the Content Engine picked them.
  const orderIndex = new Map(linkedFactIds.map((id, i) => [id, i]));
  factRows.sort(
    (a, b) =>
      (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const citedFacts: CitedFact[] = factRows.map((f) => ({
    id: f.id,
    neighbourhood: f.neighbourhood,
    metricName: f.metricName,
    metricLabel: METRIC_NAME_LABELS[f.metricName] ?? f.metricName,
    metricValueString:
      f.metricValueString ??
      (f.metricValue !== null ? String(f.metricValue) : ""),
    monthYear:
      toMonthYearUtc(f.dateContext) || (f.upload?.monthYear ?? ""),
    marketType: f.marketType,
    trajectory: f.trajectory,
    caveat: f.viewerCaveat,
  }));

  // ── Load assigned lead-magnet campaign + binge-target plan ───────────
  // Both ownership-filtered. Each fetch is optional — if the plan has
  // no assignment, we fall back to a generic placement and surface a
  // soft warning to the client so the wizard can prompt the member to
  // wire the assets up next time.
  const planWarnings: string[] = [];
  let assignedCampaign: AssignedCampaign | null = null;
  let assignedBingeVideo: AssignedBingeVideo | null = null;

  if (plan.linkedCampaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: plan.linkedCampaignId, userId, deletedAt: null },
      select: {
        name: true,
        destinationUrl: true,
        leadMagnetUrl: true,
        description: true,
        pitchOneLiner: true,
        audience: true,
      },
    });
    if (campaign) {
      assignedCampaign = {
        name: campaign.name,
        destinationUrl: campaign.destinationUrl,
        leadMagnetUrl: campaign.leadMagnetUrl,
        description: campaign.description,
        pitchOneLiner: campaign.pitchOneLiner,
        audience: campaign.audience,
      };
      if (!campaign.pitchOneLiner) {
        planWarnings.push(
          `Lead magnet "${campaign.name}" has no calibrated pitch defined — script will fall back to generic pitch language. Edit at /admin/campaigns/${plan.linkedCampaignId} to add a one-line pitch.`,
        );
      }
    } else {
      planWarnings.push(
        "The lead magnet campaign assigned to this plan no longer exists — script uses generic placeholders. Reassign one in the planner.",
      );
    }
  } else {
    planWarnings.push(
      "Plan has no lead magnet assigned — script uses generic placeholders. Assign a lead magnet in the planner for specific references.",
    );
  }

  if (plan.bingeVideoId) {
    const binge = await prisma.contentPlan.findFirst({
      where: { id: plan.bingeVideoId, userId },
      select: {
        title: true,
        theme: true,
        status: true,
        youtubeVideoId: true,
      },
    });
    if (binge) {
      const statusKey = (binge.status ?? "").trim().toLowerCase();
      if (EARLY_PLAN_STATUSES.has(statusKey)) {
        planWarnings.push(
          `Binge target "${binge.title}" is still at "${binge.status}" stage — skipping specific next-video tease to avoid promising a video that doesn't exist yet.`,
        );
      } else {
        assignedBingeVideo = {
          title: binge.title,
          theme: binge.theme,
          status: binge.status,
          youtubeVideoId: PUBLISHED_PLAN_STATUSES.has(statusKey)
            ? binge.youtubeVideoId
            : null,
        };
      }
    } else {
      planWarnings.push(
        "The binge target assigned to this plan no longer exists — script uses a generic next-video tease. Reassign one in the planner.",
      );
    }
  } else {
    planWarnings.push(
      "Plan has no binge target assigned — script uses a generic next-video tease. Assign a binge target in the planner for specific references.",
    );
  }

  // ── Load MarketConfig (avatar, sub-personas, MOI thresholds, ...) ────
  const marketConfig = await loadMarketConfigSummary(userId);
  // (extractAvatarNarrativeText helper lives at the bottom of this file.)
  if (!marketConfig) {
    // Onboarding Wizard gate: hand the client a redirectUrl so it can route
    // the member straight into setup instead of leaving them stuck on a
    // generic "configure your market" error.
    return Response.json(
      {
        error:
          "Finish setting up your system before building scripts. You're a few steps away from real output.",
        code: "incomplete_setup",
        missing: ["marketConfig"],
        redirectUrl: "/member/onboarding",
      },
      { status: 409 },
    );
  }
  if (
    !marketConfig.primaryAvatar ||
    (typeof marketConfig.primaryAvatar === "object" &&
      Object.keys(marketConfig.primaryAvatar as Record<string, unknown>).length ===
        0)
  ) {
    // Same gate, just a narrower miss — they have a market config row but
    // never finished Step 3 (avatar), OR finished with an empty {} payload.
    // Same redirect: the wizard knows where to drop them.
    return Response.json(
      {
        error:
          "Your scripts need an avatar to write to. Finish the avatar step before building a script.",
        code: "incomplete_setup",
        missing: ["primaryAvatar"],
        redirectUrl: "/member/onboarding?step=3",
      },
      { status: 409 },
    );
  }

  // ── Load FULL NeighbourhoodProfile content for the cited neighbourhoods ─
  // Wave 5: switched from "summary" (~200 words) to "full" (~1000 words) so
  // Claude has hyper-local demographic, housing-stock, lifestyle, transit,
  // and market-positioning context to weave into each section. Two effects
  // we're chasing: (1) longer scripts (2500-3500 dialogue word target) and
  // (2) fewer fabricated stats because the model has real specifics to
  // reach for instead of inventing round narrative numbers. Cost impact:
  // ~5-8k extra input tokens per generation (~$0.02 at Sonnet pricing).
  const neighbourhoodsInScript = Array.from(
    new Set(citedFacts.map((f) => f.neighbourhood).filter(Boolean)),
  );
  const neighbourhoodContext = await getNeighbourhoodContext(
    userId,
    neighbourhoodsInScript,
    "full",
  );

  // ── Wave 1: load deterministic source-of-truth metrics ───────────────
  // These were persisted by `persistAggregatedMetrics` immediately before
  // the Sonnet fact-validator ran. They are the ground truth — Claude
  // must not invent stats, and the locked validator will flag any number
  // in the script that doesn't match a SoT value (within 2% tolerance).
  // Filtered to (cited neighbourhoods ∪ "All Neighbourhoods") to keep
  // the injected block compact (~30-80 rows typical).
  const uploadIdsForSot = Array.from(
    new Set(factRows.map((f) => f.uploadId).filter(Boolean)),
  );
  const sourceOfTruthMetrics = await getSourceOfTruthMetrics({
    userId,
    uploadIds: uploadIdsForSot,
    neighbourhoods: neighbourhoodsInScript,
  });
  console.log(
    `[sb-v2:sot] uploadIds=${uploadIdsForSot.length} metrics=${sourceOfTruthMetrics.length}`,
  );

  // ── Wave 4 (propertyType lock) — build per-neighbourhood lock map ─────
  // Per spec: prevent Script Builder v2 scope drift where Claude pivots
  // from the cited propertyType (e.g. Saddle Ridge Row/Townhouse, MOI
  // 4.14) to a different type (Detached, MOI 8.5) just because the SoT
  // block exposed every per-type row. Precedence per neighbourhood:
  //   1. propertyType extracted from the citedFact's `viewerCaveat`
  //      (substring match — most specific types first so "Row/Townhouse"
  //      isn't shadowed by a future "Row" entry).
  //   2. `plan.propertyTypeFocus` (member-set on the plan).
  //   3. "All" — no lock, full per-type SoT exposure.
  // The lock map is consumed by `renderSourceOfTruthBlockWithLock`,
  // which filters non-citywide neighbourhoods to (lock-matching rows +
  // "All" rows) and appends an EXCLUDED marker so Claude knows the
  // omission was intentional.
  const propertyTypeByHood = buildPropertyTypeLock(
    citedFacts,
    plan.propertyTypeFocus ?? null,
  );
  console.log(
    `[sb-v2:lock] planFocus=${plan.propertyTypeFocus ?? "(none)"} hoods=${JSON.stringify(propertyTypeByHood)}`,
  );

  // ─────────────────────────────────────────────────────────────────────
  // Open the SSE stream and start generation
  // ─────────────────────────────────────────────────────────────────────

  const encoder = new TextEncoder();
  // Bound to the client's connection — when the EventSource closes or the
  // wizard component unmounts (StrictMode-safe per Step3IdeaCards.tsx),
  // req.signal aborts and we chain it into the Anthropic call so upstream
  // billing stops in real time.
  const clientSignal = req.signal;
  // Separate controller for our own internal aborts (e.g. terminal error
  // states where we want to stop the Anthropic stream without waiting for
  // the client to disconnect).
  const internalAbort = new AbortController();
  const onClientAbort = () => internalAbort.abort();
  clientSignal.addEventListener("abort", onClientAbort);

  // Token usage accumulator — billed in the terminal block regardless of
  // how the stream ends (success / validation failure / abort / error).
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Heartbeat — emits an SSE comment line every 2s while the stream is open.
  // SSE comments start with ":" and are ignored by EventSource clients, but
  // they force the Replit preview proxy (and nginx/cloudflare-style proxies
  // generally) to flush whatever they've buffered. Without this, all phase
  // events and the first ~chunk of tokens arrive in one final flush right
  // before `complete`, freezing the pipeline UI for 60-90s. Initialized to
  // null and assigned in start() so cancel() can clear it if the client
  // disconnects mid-stream.
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stopHeartbeat = () => {
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // TELEMETRY (TEMP — strip before final commit): timestamp every
      // emit/heartbeat/anthropic boundary so we can see, server-side,
      // whether phase events are being produced on time or whether
      // they're stalled in our own code. Pair with proxy/client logs
      // to isolate the buffering layer.
      const startTime = Date.now();
      const ms = () => Date.now() - startTime;
      const trace = (event: string, label: string) => {
        console.log(
          `[sb-v2:emit] t=${ms()}ms event=${event} label="${label.slice(0, 40)}"`,
        );
      };
      console.log(`[sb-v2:start] t=${ms()}ms user=${userId}`);

      heartbeat = setInterval(() => {
        if (clientSignal.aborted) {
          stopHeartbeat();
          return;
        }
        try {
          console.log(`[sb-v2:heartbeat] t=${ms()}ms`);
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          // Controller already closed — stop ticking.
          stopHeartbeat();
        }
      }, 2000);

      const emit = (event: string, data: unknown) => {
        if (clientSignal.aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Controller already closed — ignore.
        }
      };

      try {
        trace("phase", "Loading your facts and neighbourhood context...");
        emit("phase", {
          key: "load",
          label: "Loading your facts and neighbourhood context...",
        });

        // ─ Cached system prompt block (prompt-caching keeps it warm) ──
        const systemBlocks = [
          {
            type: "text" as const,
            text: SCRIPT_BUILDER_MODE_PROMPT,
            cache_control: { type: "ephemeral" as const },
          },
        ];

        let finalScript: string | null = null;
        let finalValidation: ScriptValidationResult | null = null;
        let finalAttempt = 0;
        let lastDraft = "";
        let lastErrors: ScriptViolation[] = [];
        // Wave 5 — carry the prior draft's validation metrics across the
        // retry boundary so `buildRetryUserMessage` can tell the model
        // whether it also needs to expand toward the 2500-word target
        // while re-anchoring the flagged stats.
        let lastDraftMetrics: ScriptValidationResult["metrics"] | null = null;

        for (let attempt = 0; attempt <= MAX_REPROMPTS; attempt++) {
          if (internalAbort.signal.aborted) break;

          // Phase: first attempt walks intro→body→hook; retries jump
          // straight to "fixing rule violations".
          if (attempt === 0) {
            trace("phase", "Drafting the 2-beat intro...");
            emit("phase", {
              key: "intro",
              label: "Drafting the 2-beat intro...",
            });
          } else {
            const reLabel = `Re-prompting to fix ${lastErrors.length} content-rule violation(s) (attempt ${attempt + 1}/${MAX_REPROMPTS + 1})...`;
            trace("phase", reLabel);
            emit("phase", {
              key: "reprompt",
              label: reLabel,
            });
          }

          const userMessage =
            attempt === 0
              ? buildInitialUserMessage({
                  plan: planContext,
                  facts: citedFacts,
                  marketConfig,
                  neighbourhoodContext,
                  sourceOfTruthMetrics,
                  propertyTypeByHood,
                  shootType,
                  assignedCampaign,
                  assignedBingeVideo,
                  regenerationBrief: body.regenerationBrief ?? null,
                })
              : buildRetryUserMessage({
                  plan: planContext,
                  previousDraft: lastDraft,
                  violations: lastErrors,
                  // Wave 5 — feed the prior draft's dialogue word count
                  // into the retry so the model knows whether to expand
                  // (under 2500) while it re-anchors flagged stats.
                  previousDialogueWordCount:
                    lastDraftMetrics?.dialogueWordCount ?? null,
                });

          // Mid-stream phase pulses — fire-and-forget timers that emit
          // "body" then "hook" labels while Claude is producing tokens.
          // They never block the stream and self-cancel on abort.
          const midStreamTimers: ReturnType<typeof setTimeout>[] = [];
          midStreamTimers.push(
            setTimeout(() => {
              trace("phase", "Building the data → psychology → clarity body...");
              emit("phase", {
                key: "body",
                label: "Building the data → psychology → clarity body...",
              });
            }, 12000),
          );
          midStreamTimers.push(
            setTimeout(() => {
              trace("phase", "Writing the next-video hook...");
              emit("phase", {
                key: "hook",
                label: "Writing the next-video hook...",
              });
            }, 30000),
          );

          let draft = "";
          // Track usage incrementally from stream events so an abort or
          // mid-stream error still leaves us with the best-known counts
          // to bill in the terminal block. Falling back to finalMessage()
          // is unreliable on abort — it throws — and would otherwise
          // leak partial-spend tokens past the cost cap.
          //
          // Anthropic emits:
          //   message_start  → message.usage.input_tokens (full input cost)
          //   message_delta  → usage.output_tokens (cumulative output)
          //   message_stop   → final
          let attemptInputTokens = 0;
          let attemptOutputTokens = 0;
          let firstTokenLogged = false;
          try {
            // Anthropic streaming API. `signal: internalAbort.signal`
            // ensures abort propagates upstream so we stop being billed
            // for tokens the client will never see.
            console.log(`[sb-v2:anthropic-start] t=${ms()}ms attempt=${attempt}`);
            const sdkStream = anthropic.messages.stream(
              {
                model: SONNET_MODEL,
                max_tokens: MAX_OUTPUT_TOKENS,
                system: systemBlocks,
                messages: [{ role: "user", content: userMessage }],
              },
              { signal: internalAbort.signal },
            );

            for await (const event of sdkStream) {
              if (internalAbort.signal.aborted) break;
              if (event.type === "message_start") {
                const u = (event.message?.usage ?? {}) as {
                  input_tokens?: number;
                  output_tokens?: number;
                };
                if (typeof u.input_tokens === "number") {
                  attemptInputTokens = u.input_tokens;
                }
                if (typeof u.output_tokens === "number") {
                  attemptOutputTokens = u.output_tokens;
                }
              } else if (event.type === "message_delta") {
                const u = (event.usage ?? {}) as {
                  output_tokens?: number;
                };
                if (typeof u.output_tokens === "number") {
                  // Anthropic emits cumulative output_tokens — replace,
                  // don't add.
                  attemptOutputTokens = u.output_tokens;
                }
              } else if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta"
              ) {
                const text = event.delta.text;
                if (!firstTokenLogged) {
                  console.log(
                    `[sb-v2:anthropic-first-token] t=${ms()}ms attempt=${attempt}`,
                  );
                  firstTokenLogged = true;
                }
                draft += text;
                emit("token", { text });
              }
            }
            console.log(
              `[sb-v2:anthropic-end] t=${ms()}ms attempt=${attempt} tokens=${attemptOutputTokens}`,
            );
          } catch (err) {
            console.log(
              `[sb-v2:anthropic-error] t=${ms()}ms attempt=${attempt} tokens=${attemptOutputTokens}`,
            );
            // Whatever happened, fold the best-known token counts into
            // the running totals BEFORE breaking — so an abort or upstream
            // error mid-stream still bills (requirement: logUsage runs on
            // every terminal path, even partial spend).
            totalInputTokens += attemptInputTokens;
            totalOutputTokens += attemptOutputTokens;
            for (const t of midStreamTimers) clearTimeout(t);
            // Client abort = quiet exit; anything else = emit error and stop.
            if (
              internalAbort.signal.aborted ||
              (err as Error).name === "AbortError"
            ) {
              break;
            }
            const msg = (err as { message?: string })?.message ?? String(err);
            console.error("[script-builder-v2] anthropic error:", msg);
            emit("error", {
              error: "claude_call_failed",
              message:
                "Script generation is unavailable right now. Try again in a moment.",
            });
            break;
          }
          // Successful stream completion — fold into running totals.
          totalInputTokens += attemptInputTokens;
          totalOutputTokens += attemptOutputTokens;
          for (const t of midStreamTimers) clearTimeout(t);

          if (internalAbort.signal.aborted) break;

          // Wave 6 — auto-fix mechanical rule violations before validation.
          // Some locked rules are mechanical substitutions (replace word X
          // with word Y). Running these as regex passes BEFORE the
          // validator gate saves retry budget for genuine violations
          // (fabrications, misattributions) and lets Claude focus on
          // content quality instead of word-level discipline.
          draft = autoFixMechanicalRules(draft);

          // Wave 11 — pre-validation soften pass for unanchored stats.
          // When Claude fabricates a stat (e.g. "6.2%" not in SoT), the
          // validator's unanchored_stat rule fires ERROR + retry loop,
          // which often fabricates a DIFFERENT plausible number, burns
          // the retry budget, and hard-blocks the member. This pass
          // mirrors the validator's anchored-check logic and rewrites
          // the surrounding phrase to directional language ("down
          // meaningfully" / "well above the citywide average") for
          // tokens the validator would flag — preserving data integrity
          // (no invented substitute number) while letting the script
          // ship. Real numbers from SoT / cited facts / profile text are
          // never touched. Tokens with no matching softening rule fall
          // through to the validator → retry loop → hard-block as
          // before, so the safety net is intact.
          const softenResult = autoSoftenUnanchoredStats(
            draft,
            sourceOfTruthMetrics,
            citedFacts.map((f) => ({ raw: f.metricValueString })),
            [
              ...Object.values(neighbourhoodContext ?? {}),
              ...extractAvatarNarrativeText(marketConfig.primaryAvatar),
            ],
          );
          draft = softenResult.script;
          if (softenResult.softenedCount > 0) {
            console.log(
              `[sb-v2:auto-soften] softened ${softenResult.softenedCount} unanchored stat(s): ${softenResult.softenedTokens.join(", ")}`,
            );
          }

          // ─ Server-side validation gate ──────────────────────────────
          trace("phase", "Validating content rules...");
          emit("phase", {
            key: "validate",
            label: "Validating content rules...",
          });
          const validation = validateScript(draft, {
            neighbourhoods: marketConfig.neighbourhoods,
            sourceOfTruth: sourceOfTruthMetrics,
            citedFacts: citedFacts.map((f) => ({ raw: f.metricValueString })),
            // Wave 5 follow-up — feed the FULL neighbourhood profile
            // text + the avatar's NARRATIVE fields into the stat
            // validator so demographic/lifestyle numbers Claude pulled
            // from those sources (median income, household size,
            // year-built ranges) are accepted as legitimate anchors
            // instead of flagged as fabrications. The SoT block can't
            // see profile prose, but the script body legitimately
            // reaches into it now that Fix 1 switched the context
            // loader to "full" mode.
            //
            // IMPORTANT: don't `JSON.stringify(primaryAvatar)` — that
            // leaks ID/UUID/timestamp digits into the whitelist. We
            // pull `summary` + string-leaf values out of `profile` so
            // only narrative content reaches the validator.
            profileText: [
              ...Object.values(neighbourhoodContext ?? {}),
              ...extractAvatarNarrativeText(marketConfig.primaryAvatar),
            ],
          });

          if (validation.ok) {
            finalScript = draft;
            finalValidation = validation;
            finalAttempt = attempt;
            break;
          }

          // Validation failed — retry if budget left, otherwise surface
          // the structured violations to the client and stop.
          lastDraft = draft;
          lastDraftMetrics = validation.metrics;
          lastErrors = validation.violations.filter(
            (v) => v.severity === "error",
          );
          if (attempt === MAX_REPROMPTS) {
            emit("error", {
              error: "validation_gate_failed",
              message: `Couldn't produce a script that passes the locked content rules after ${MAX_REPROMPTS + 1} attempts. ${lastErrors.length} error-severity violation(s) remain — see "violations" for details.`,
              violations: validation.violations,
              metrics: validation.metrics,
              attempt,
              draft,
            });
            break;
          }
          // Otherwise emit a "violation" event so the UI can show what's
          // being re-prompted, then loop.
          emit("violation", {
            attempt,
            violations: lastErrors,
            willRetry: true,
          });
        }

        // ─ Terminal success ────────────────────────────────────────────
        if (
          finalScript !== null &&
          finalValidation !== null &&
          !internalAbort.signal.aborted
        ) {
          // Bill before emitting `complete` so the spend the client sees
          // matches what `getCostCapStatus()` will return on next call.
          await logUsage(
            userId,
            "script_builder_v2",
            totalInputTokens,
            totalOutputTokens,
          );
          const capAfter = await getCostCapStatus(userId);
          emit("complete", {
            script: finalScript,
            attempt: finalAttempt,
            // Only warnings reach the client here — errors blocked save.
            warnings: finalValidation.violations.filter(
              (v) => v.severity === "warning",
            ),
            metrics: finalValidation.metrics,
            monthSpendUsd: capAfter.monthSpendUsd,
            capUsd: capAfter.capUsd,
            softWarning: capAfter.softWarning,
            planWarnings,
          });
        } else if (totalInputTokens || totalOutputTokens) {
          // Validation failed / client aborted / claude errored — bill
          // for tokens already consumed before closing.
          await logUsage(
            userId,
            "script_builder_v2",
            totalInputTokens,
            totalOutputTokens,
          );
        }
      } finally {
        stopHeartbeat();
        clientSignal.removeEventListener("abort", onClientAbort);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },

    cancel() {
      // Reader closed (client disconnect). Propagate to upstream Anthropic.
      stopHeartbeat();
      internalAbort.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      // Defensive: tells nginx/cloudflare-style proxies not to buffer.
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function jsonError(
  status: number,
  error: string,
  message?: string,
): Response {
  return new Response(
    JSON.stringify(message ? { error, message } : { error }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function toMonthYearUtc(d: Date | null | undefined): string {
  if (!d) return "";
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}`;
}

/**
 * Pull the six fields the Wave 2 wizard tucked into `researchNotes` as a
 * labelled Markdown blob (see Wave-2-Known-Issues.md #1). The blob always
 * starts with `## Wave 2 idea card` and uses stable labels — until Wave 5
 * promotes them to first-class columns, this is how Script Builder v2
 * recovers tactileType / subPersonas / framework / clarityPremise /
 * estimatedRuntime / whyItWorks for the cached prompt's user message.
 */
function parseResearchNotesBlob(notes: string): {
  clarityPremise: string | null;
  framework: string | null;
  tactileType: string | null;
  subPersonas: string[] | null;
  estimatedRuntime: string | null;
  whyItWorks: string | null;
} {
  const out = {
    clarityPremise: null as string | null,
    framework: null as string | null,
    tactileType: null as string | null,
    subPersonas: null as string[] | null,
    estimatedRuntime: null as string | null,
    whyItWorks: null as string | null,
  };
  if (!notes.includes("Wave 2 idea card")) return out;
  const grab = (label: string): string | null => {
    const re = new RegExp(
      `^\\*\\*${label}:\\*\\*\\s*(.+?)\\s*$`,
      "im",
    );
    const m = notes.match(re);
    return m ? m[1].trim() : null;
  };
  out.clarityPremise = grab("Clarity premise");
  out.framework = grab("Framework");
  out.tactileType = grab("Tactile type");
  out.estimatedRuntime = grab("Estimated runtime");
  out.whyItWorks = grab("Why it works");
  const subRaw = grab("Sub-personas");
  if (subRaw) {
    out.subPersonas = subRaw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// PropertyType lock helpers (Wave 4)
// ───────────────────────────────────────────────────────────────────────

// Ordered most-specific-first so a caveat like "Saddle Ridge Row/Townhouse"
// matches Row/Townhouse before falling through to a hypothetical future
// "Row" entry. Mirrors the values whitelisted in save-idea/route.ts.
const PROPERTY_TYPE_PATTERNS: Array<{ type: string; re: RegExp }> = [
  { type: "Row/Townhouse", re: /\brow\s*\/?\s*townhouse\b|\btownhouse\b|\brow\b/i },
  { type: "Semi-Detached", re: /\bsemi[-\s]?detached\b/i },
  { type: "Apartment", re: /\bapartment\b|\bcondo\b/i },
  { type: "Detached", re: /\bdetached\b/i },
];

function extractPropertyTypeFromCaveat(caveat: string | null): string | null {
  if (!caveat) return null;
  for (const { type, re } of PROPERTY_TYPE_PATTERNS) {
    if (re.test(caveat)) return type;
  }
  return null;
}

/**
 * Build the per-neighbourhood propertyType lock map consumed by
 * `renderSourceOfTruthBlockWithLock`. Precedence per neighbourhood:
 *   1. caveat-derived type from the first citedFact that mentions one
 *   2. plan.propertyTypeFocus (member-set on the plan)
 *   3. "All" — full per-type SoT exposure, no lock
 *
 * Caveat takes precedence over the plan-level focus because the cited
 * fact is the most specific signal — if the wizard linked a Row/Townhouse
 * stat, that's what the video is anchored on regardless of whether the
 * member also pinned "Detached" on the plan.
 */
function buildPropertyTypeLock(
  facts: CitedFact[],
  planFocus: string | null,
): Record<string, string> {
  // First pass: group caveat-derived types per hood (preserving citedFact
  // order so "first caveat wins" remains deterministic). We must scan ALL
  // facts for a hood before falling back to planFocus / "All" — otherwise
  // a leading fact with no caveat type would shadow a trailing fact whose
  // caveat clearly names the type and let drift back in.
  const caveatTypesByHood = new Map<string, string[]>();
  const seenHoods: string[] = [];
  for (const f of facts) {
    if (!f.neighbourhood) continue;
    if (!caveatTypesByHood.has(f.neighbourhood)) {
      caveatTypesByHood.set(f.neighbourhood, []);
      seenHoods.push(f.neighbourhood);
    }
    const t = extractPropertyTypeFromCaveat(f.caveat);
    if (t) caveatTypesByHood.get(f.neighbourhood)!.push(t);
  }

  const map: Record<string, string> = {};
  for (const hood of seenHoods) {
    const caveatTypes = caveatTypesByHood.get(hood) ?? [];
    const distinct = Array.from(new Set(caveatTypes));
    if (distinct.length > 1) {
      // Multiple cited facts in the same hood disagree on propertyType —
      // a video that anchors on multiple types for one neighbourhood is
      // ambiguous. Honour plan.propertyTypeFocus if it picks a side;
      // otherwise fall through to "All" so no per-type lock is applied
      // (the cited facts themselves still constrain the script). Log so
      // the conflict is visible in [sb-v2:lock].
      console.log(
        `[sb-v2:lock] conflicting caveat types for ${hood}: ${distinct.join(",")} — planFocus=${planFocus ?? "(none)"}`,
      );
      if (planFocus && distinct.includes(planFocus)) {
        map[hood] = planFocus;
      } else {
        map[hood] = planFocus ?? "All";
      }
      continue;
    }
    const firstCaveat = distinct[0] ?? null;
    map[hood] = firstCaveat ?? planFocus ?? "All";
  }
  return map;
}

// ───────────────────────────────────────────────────────────────────────
// User-message builders
// ───────────────────────────────────────────────────────────────────────

/**
 * Initial draft request. Packs the plan + cited facts + market config +
 * neighbourhood summaries into the user message. The cached system prompt
 * (`SCRIPT_BUILDER_MODE_PROMPT`) supplies all the voice / structure rules;
 * this message supplies the specifics for THIS script.
 *
 * The OUTPUT FORMAT block at the bottom restates the locked content rules
 * the server-side validation gate enforces — Claude that knows what's
 * being checked produces fewer re-prompt rounds.
 */
function buildInitialUserMessage(args: {
  plan: PlanContext;
  facts: CitedFact[];
  marketConfig: MarketConfigSummary;
  neighbourhoodContext: Record<string, string>;
  sourceOfTruthMetrics: SourceOfTruthMetric[];
  propertyTypeByHood: Record<string, string>;
  shootType: "talking_head" | "home_tour";
  assignedCampaign: AssignedCampaign | null;
  assignedBingeVideo: AssignedBingeVideo | null;
  regenerationBrief: RegenerationBrief | null;
}): string {
  const {
    plan,
    facts,
    marketConfig,
    neighbourhoodContext,
    sourceOfTruthMetrics,
    propertyTypeByHood,
    shootType,
    assignedCampaign,
    assignedBingeVideo,
    regenerationBrief,
  } = args;
  const lines: string[] = [];

  // ── PRIOR ATTEMPT — REVISION NOTES ──────────────────────────────────
  // Wave 3.5: when the client sends a regenerationBrief, prepend a
  // targeted-revision block AT THE TOP of the USER message. The cached
  // system prompt (SCRIPT_BUILDER_MODE_PROMPT) must NOT change between
  // generations — otherwise prompt caching breaks. All revision context
  // lives here, in the user-message-only branch.
  if (regenerationBrief) {
    const selected = Array.isArray(regenerationBrief.selectedSuggestions)
      ? regenerationBrief.selectedSuggestions.filter(
          (s) =>
            s &&
            typeof s.title === "string" &&
            typeof s.regenerationDirective === "string" &&
            s.regenerationDirective.trim().length > 0,
        )
      : [];
    const notes =
      typeof regenerationBrief.customNotes === "string"
        ? regenerationBrief.customNotes.trim()
        : "";
    const priorScript =
      typeof regenerationBrief.priorScript === "string"
        ? regenerationBrief.priorScript.trim()
        : "";

    if (selected.length > 0 || notes || priorScript) {
      lines.push("# PRIOR ATTEMPT — REVISION NOTES");
      lines.push("");
      lines.push(
        "The previous script for this idea is below. The member has asked for the following specific improvements in this regeneration:",
      );
      lines.push("");
      if (selected.length > 0) {
        for (const s of selected) {
          lines.push(`- **${s.title}**: ${s.regenerationDirective!.trim()}`);
        }
        lines.push("");
      }
      if (notes) {
        // Quote-escape so embedded `"` don't break the prompt's mental model.
        const safe = notes.replace(/"/g, '\\"');
        lines.push(`Member's custom note: "${safe}"`);
        lines.push("");
      }
      lines.push(
        "Generate a FRESH script that addresses these specific improvements while keeping the core thesis (cited facts, title promise, framework, structure). Do NOT just patch the prior script — rewrite it stronger and tighter. The improvements above are the priority; everything else in the existing context still applies.",
      );
      lines.push("");
      if (priorScript) {
        // Cap at ~24k chars so a pathological prior script doesn't
        // blow out the context budget. The script writer rewrites
        // from scratch — they only need the prior as reference.
        const capped =
          priorScript.length > 24000
            ? priorScript.slice(0, 24000) + "\n…[truncated]"
            : priorScript;
        lines.push("PRIOR SCRIPT FOR REFERENCE:");
        lines.push("```");
        lines.push(capped);
        lines.push("```");
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
  }

  lines.push(`Shoot type: ${shootType}`);
  lines.push(`Market: ${marketConfig.marketName}`);
  lines.push("");

  lines.push("## Idea card (what to script)");
  lines.push("");
  lines.push(`**Title:** ${plan.title}`);
  lines.push(
    `**Rotation slot:** ${plan.rotationSlot} (${ROTATION_SLOT_LABELS[plan.rotationSlot] ?? plan.rotationSlot})`,
  );
  lines.push(`**Title promise:** ${plan.titlePromise}`);
  if (plan.clarityPremise)
    lines.push(`**Clarity premise:** ${plan.clarityPremise}`);
  if (plan.framework) lines.push(`**Framework:** ${plan.framework}`);
  if (plan.tactileType) lines.push(`**Tactile type:** ${plan.tactileType}`);
  if (plan.estimatedRuntime)
    lines.push(`**Estimated runtime:** ${plan.estimatedRuntime}`);
  if (plan.visualPeak) lines.push(`**Visual peak:** ${plan.visualPeak}`);
  if (plan.thumbnailCallouts.length)
    lines.push(
      `**Thumbnail callouts:** ${plan.thumbnailCallouts.join(" | ")}`,
    );
  if (plan.subPersonas && plan.subPersonas.length)
    lines.push(
      `**Sub-personas to name in the body:** ${plan.subPersonas.join(", ")}`,
    );
  lines.push("");

  lines.push("## Cited facts (USE THESE — do NOT invent stats)");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(facts, null, 2));
  lines.push("```");
  lines.push("");

  // ── SOURCE-OF-TRUTH METRICS (Wave 1, deterministic) ──────────────────
  // These rows were computed directly from the member's CSV BEFORE the
  // Sonnet validator ran. They are the ground truth for any number that
  // appears in the script. The server-side `no_misattributed_stats`
  // validator cross-checks every numeric token in the draft against this
  // set; numbers attributed to outside sources (CREB, CMHC, etc.) that
  // actually match a SoT value within 2% surface as warnings to the
  // member. Render the section even when empty so Claude doesn't fill the
  // vacuum with invented stats.
  // Wave 4: per-neighbourhood propertyType lock. Non-citywide neighbourhoods
  // whose lock is set (caveat-derived OR plan.propertyTypeFocus) get filtered
  // to (lock-matching rows + "All" rows) and an EXCLUDED marker appended.
  // "All Neighbourhoods" rollup passes through unchanged.
  const sotBlock = renderSourceOfTruthBlockWithLock(
    sourceOfTruthMetrics,
    propertyTypeByHood,
  );
  const lockedHoods = Object.entries(propertyTypeByHood).filter(
    ([, v]) => v && v !== "All",
  );
  lines.push(
    "## SOURCE-OF-TRUTH METRICS (deterministic, computed from member's CSV — these are LAW)",
  );
  lines.push("");
  if (sotBlock) {
    lines.push(
      "Every numeric stat you write in the script body must match one of these values within 2% tolerance, and must be attributed to the member's own market analysis (NOT to CREB, CMHC, or any outside body). These are the deterministic aggregations from the member's uploaded MLS data — they are the channel's edge.",
    );
    if (lockedHoods.length > 0) {
      lines.push("");
      lines.push(
        "**PROPERTY-TYPE LOCK** — this video covers a specific property type per neighbourhood. Per-type rows for excluded types have been suppressed and replaced with an `EXCLUDED property types` marker. Writing about an excluded type is a HARD FAIL:",
      );
      for (const [hood, type] of lockedHoods) {
        lines.push(`- ${hood}: **${type}** only`);
      }
    }
    lines.push("");
    lines.push(sotBlock);
    lines.push("");
  } else {
    lines.push(
      "No deterministic aggregations were found for the cited neighbourhoods in this script. Use ONLY the numbers from the Cited facts block above; do not introduce stats from any other source.",
    );
    lines.push("");
  }

  // ── VIEWER AVATAR ─────────────────────────────────────────────────────
  // Promoted to its own section (separate from MarketConfig JSON) so Claude
  // treats the avatar as the SOURCE for psychology beats, not as background
  // reference. The connection-language phrase list in the system prompt is
  // scaffolding; the avatar is what makes those phrases land as recognition.
  //
  // Gating is intentionally strict: an empty default MarketConfig still
  // carries an object-shaped primaryAvatar AND the full preset subPersonas
  // array (all `enabled: false`), so a truthy check would render an empty
  // section and confuse Claude. Only render when (a) the avatar has a real
  // snapshot — non-empty `snappedAt` + at least one of `summary`/`profile`
  // — and/or (b) at least one sub-persona is enabled.
  const rawAvatar = marketConfig.primaryAvatar as
    | { snappedAt?: unknown; summary?: unknown; profile?: unknown }
    | null
    | undefined;
  const hasSubstantiveAvatar = !!(
    rawAvatar &&
    typeof rawAvatar === "object" &&
    typeof rawAvatar.snappedAt === "string" &&
    rawAvatar.snappedAt.length > 0 &&
    ((typeof rawAvatar.summary === "string" &&
      rawAvatar.summary.trim().length > 0) ||
      (rawAvatar.profile &&
        typeof rawAvatar.profile === "object" &&
        Object.keys(rawAvatar.profile as Record<string, unknown>).length > 0))
  );
  const rawPersonas = marketConfig.subPersonas;
  const enabledPersonas = Array.isArray(rawPersonas)
    ? (rawPersonas as Array<{ id?: unknown; label?: unknown; enabled?: unknown }>)
        .filter((p) => p && typeof p === "object" && p.enabled === true)
        .map((p) => ({
          id: typeof p.id === "string" ? p.id : undefined,
          label: typeof p.label === "string" ? p.label : undefined,
        }))
        .filter((p): p is { id: string; label: string } => !!p.id && !!p.label)
    : [];
  if (hasSubstantiveAvatar || enabledPersonas.length > 0) {
    lines.push("## VIEWER AVATAR — the source for psychology beats");
    lines.push("");
    lines.push(
      "This is the specific viewer this script is for. Use their stated situation, internal language, and decision pressures as the raw material for the 1-3 psychology beats. When you write a 'that's me' recognition moment, cite a specific detail from this avatar profile — NOT the generic phrase list from the system prompt. The system prompt's CONNECTION LANGUAGE phrases are scaffolding; what makes them land is filling them with content drawn from THIS avatar.",
    );
    lines.push("");
    lines.push(
      "Specifically: at each psychology beat, name something concrete from the avatar's situation (their stage of life, the specific decision they're stuck on, the language they use, the thing they keep doing at 11pm), and connect it to the data you just laid down. Avoid generic 'families like yours' — that's targeting, not recognition.",
    );
    lines.push("");
    if (hasSubstantiveAvatar) {
      lines.push("### Primary avatar");
      lines.push("```json");
      lines.push(JSON.stringify(marketConfig.primaryAvatar, null, 2));
      lines.push("```");
      lines.push("");
    }
    if (enabledPersonas.length > 0) {
      lines.push(
        "### Sub-personas the member has enabled (use as variations within the body where natural)",
      );
      lines.push("");
      for (const p of enabledPersonas) {
        lines.push(`- **${p.label}** (\`${p.id}\`)`);
      }
      lines.push("");
    }
  }

  // ── MEMBER VOICE OVERRIDES (Ship B) ────────────────────────────────────
  // Layer-2 override on top of the default voice register baked into
  // script-builder-mode-prompt.ts. Foundations members never have voiceGuide
  // populated (no upload UI). Done-With-You members may upload their own
  // voice guide here. The system-prompt rule (added near the top of the
  // voice-register section) tells Claude how to weigh this against the
  // default. HARD RULES (data integrity, no_why, no_abbrev, propertyType
  // lock, ARC structure, LM placement, stat anchoring) ALWAYS win.
  const voiceGuide =
    typeof marketConfig.voiceGuide === "string"
      ? marketConfig.voiceGuide.trim()
      : "";
  if (voiceGuide.length >= 500) {
    lines.push(
      "## MEMBER VOICE OVERRIDES — applies on top of default voice register",
    );
    lines.push("");
    lines.push(
      "This member has uploaded their own voice guide. It overrides the default voice register from the system prompt WHERE THE TWO CONFLICT on STYLISTIC concerns (opener patterns, signature phrases, sentence rhythm, tone register, audience-recognition language).",
    );
    lines.push("");
    lines.push(
      "HARD RULES from the system prompt still apply — these CANNOT be overridden by the voice guide:",
    );
    lines.push(
      "- Data integrity (no fabrication, no misattribution, sources must match)",
    );
    lines.push(
      "- Locked content rules (no_why in dialogue, no_avatar_pander base list, no_abbrev_in_dialogue, no_announced_credibility)",
    );
    lines.push("- propertyType lock per neighbourhood");
    lines.push("- ARC opening structure (Attention + Revelation)");
    lines.push(
      "- LM placement (LM 1/3 inside first body insight, LM 2/3 at ~45%, LM 3/3 in closing CTA)",
    );
    lines.push(
      "- Stat anchoring against AggregatedMetric + citedFacts + profile text",
    );
    lines.push("");
    lines.push(
      "Within those guardrails, use the voice guide below to shape HOW the script sounds. If the voice guide conflicts with a HARD RULE, the HARD RULE wins and the override on that specific point is silently dropped.",
    );
    lines.push("");
    lines.push("```markdown");
    lines.push(voiceGuide);
    lines.push("```");
    lines.push("");
  }

  lines.push("## Market context");
  lines.push("");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        marketName: marketConfig.marketName,
        keywordKit: marketConfig.keywordKit,
        neighbourhoods: marketConfig.neighbourhoods,
        moiThresholds: marketConfig.moiThresholds,
      },
      null,
      2,
    ),
  );
  lines.push("```");
  lines.push("");

  const neighbourhoodKeys = Object.keys(neighbourhoodContext);
  if (neighbourhoodKeys.length > 0) {
    lines.push("## Neighbourhood context (use for texture, do NOT contradict)");
    lines.push("");
    for (const name of neighbourhoodKeys) {
      lines.push(`### ${name}`);
      lines.push(neighbourhoodContext[name]);
      lines.push("");
    }
  }

  // ── ASSIGNED ASSETS ──────────────────────────────────────────────────
  // The member's planner picks for this video. The script writer MUST
  // use these verbatim — no generic substitutes — for the [LEAD MAGNET]
  // placements and the closing [CALLBACK] hook.
  lines.push("## ASSIGNED ASSETS");
  lines.push("");

  if (assignedCampaign) {
    const url =
      assignedCampaign.leadMagnetUrl ?? assignedCampaign.destinationUrl;
    lines.push(
      "**Lead magnet** — this is the SPECIFIC asset the member assigned to this video. The script has THREE lead-magnet placements: `[LEAD MAGNET 1/3]` (INSIDE the first body insight — one casual sentence with GIFT framing, NOT in the opening), `[LEAD MAGNET 2/3]` (at ~45% — the DEEP pitch using the fields below), `[LEAD MAGNET 3/3]` (in the CLOSING CTA beat at ~80% — this IS the LM 3/3 placement, no additional LM mention; one casual sentence anchored to what the video just delivered). The `pitchOneLiner` and `description` fields below are the source material for the DEEP pitch at LM 2/3. For LM 1/3 and LM 3/3, write short casual references to the asset by name — do NOT replay the full pitch. Do NOT invent a generic budget-calculator, report, or guide pitch from the name alone — the fields below tell you what this asset actually is and how the member pitches it.",
    );
    lines.push("");
    lines.push(`- **Name:** ${assignedCampaign.name}`);
    if (assignedCampaign.description) {
      lines.push(`- **What it is:** ${assignedCampaign.description}`);
    }
    if (assignedCampaign.pitchOneLiner) {
      lines.push(
        `- **One-line pitch (USE THIS VERBATIM or with minimal adaptation):** ${assignedCampaign.pitchOneLiner}`,
      );
    }
    if (assignedCampaign.audience) {
      lines.push(`- **Audience:** ${assignedCampaign.audience}`);
    }
    lines.push(`- **URL:** ${url}`);
    lines.push("");
    if (assignedCampaign.pitchOneLiner) {
      lines.push(
        "The **one-line pitch** above is the member's calibrated pitch language for THIS asset. Use it verbatim (or with minimal rewording) as the spine of the DEEP pitch at `[LEAD MAGNET 2/3]` (~45% through). For the casual mentions at `[LEAD MAGNET 1/3]` (INSIDE the first body insight, with GIFT framing — NOT in the opening) and `[LEAD MAGNET 3/3]` (in the CLOSING CTA beat at ~80% — this is the only LM placement in the closing, no additional LM mention), reference the asset by name in one sentence anchored to the surrounding content — do NOT replay the full pitch. Do NOT substitute generic pitch language about budget calculators, reports, or guides based on the name.",
      );
    } else if (assignedCampaign.description) {
      lines.push(
        "No calibrated one-line pitch was provided for this asset. Write each `[LEAD MAGNET]` pitch from the **What it is** description above — do NOT invent a pitch from the name alone (which leads to generic budget-calculator / report-style language that doesn't match the actual asset).",
      );
    } else {
      lines.push(
        "Only the name was provided for this asset — no description or calibrated pitch. Keep each `[LEAD MAGNET]` placement to a SHORT generic pitch tied to the name (e.g. \"a free " +
          assignedCampaign.name.toLowerCase() +
          ' I put together") and do NOT invent specific feature claims about what the asset contains.',
      );
    }
    lines.push("");
  } else {
    lines.push(
      "**Lead magnet:** _none assigned_ — keep each `[LEAD MAGNET 1/3]`, `[LEAD MAGNET 2/3]`, `[LEAD MAGNET 3/3]` placement to a short generic pitch (e.g. \"a free guide I put together\"). Do NOT invent a specific product name, and do NOT emit literal bracket-text such as `[LEAD MAGNET: your free guide]` in the script — the brackets are placeholders, not on-camera dialogue.",
    );
    lines.push("");
  }

  if (assignedBingeVideo) {
    lines.push(
      "**Next-video binge target** (use this in the closing `[CALLBACK]` hook — match the title and theme so the tease is specific):",
    );
    lines.push(`- Title: ${assignedBingeVideo.title}`);
    if (assignedBingeVideo.theme)
      lines.push(`- Theme: ${assignedBingeVideo.theme}`);
    if (assignedBingeVideo.youtubeVideoId) {
      lines.push(
        `- YouTube URL: https://youtu.be/${assignedBingeVideo.youtubeVideoId} (this video is live — you may suggest it as an end-screen card)`,
      );
    }
    lines.push("");
  } else {
    lines.push(
      "**Next-video binge target:** _none assigned_ — write the closing `[CALLBACK]` as a short tease tied to the body's theme. Do NOT invent a specific title, and do NOT write a generic \"check out the next video right here / over there\" close — name the *topic* you're teasing even if you don't have a title.",
    );
    lines.push("");
  }

  lines.push("## LOCKED CONTENT RULES (server-side enforced)");
  lines.push("");
  lines.push(
    "The following are checked by the server AFTER you finish. Failures trigger a re-prompt loop — get them right on the first pass:",
  );
  lines.push("");
  lines.push(
    "1. **No `why` in spoken dialogue.** Titles + `[VISUAL: ...]` tags are exempt. Use: \"the reason\", \"what's causing this\", \"what's behind this\", \"here's what's happening\", \"the mechanism\", \"what's driving this\", \"what's actually going on\".",
  );
  lines.push(
    "2. **No avatar-pander phrases:** \"for people like you\", \"families in your situation\", \"I see you\", \"you're not alone\", \"let me be direct with you here\", \"I want you to sit with that\". The identity construction *\"people like us\"* IS approved and encouraged.",
  );
  lines.push(
    "3. **No abbreviations in dialogue:** never `MOI`, `SP/LP`, or `DOM` in the spoken body. Always the full phrase (\"months of inventory\", \"sale-to-list ratio\", \"days on market\"). Abbreviations remain allowed inside `[VISUAL: ...]` tags and data overlays.",
  );
  lines.push(
    "4. **Numerals on the page:** `$750,000` / `49.4%` / `0.45 months of inventory` — write the script with numerals, not spelled-out numbers.",
  );
  lines.push(
    "5. **Hyper-local floor:** at least 1 anchored detail (neighbourhood / $ / % / MOI / year-month) per ~120 words of body dialogue.",
  );
  lines.push("6. **Canadian spelling throughout** (neighbourhood, colour, centre, analyse).");
  lines.push("");

  lines.push("## OUTPUT");
  lines.push("");
  lines.push(
    "Produce the FULL talking-head script in the format the system prompt specifies (ARC opening: Attention + Revelation only — NO Connection beat, NO lead magnet in opening, ONE sideways credibility drop from the approved list inside Revelation, then DATA → PSYCHOLOGY → CLARITY body with `[LEAD MAGNET 1/3]` inside the FIRST body insight as a gift, `[LEAD MAGNET 2/3]` deep pitch at ~45%, `[LEAD MAGNET 3/3]` at ~80% / in the CLOSING CTA beat, then next-video hook), with `[VISUAL: ...]` tags throughout. Body must be ≥ 2,200 dialogue words. Cite every fact from the JSON above by weaving the metric value into dialogue at least once. Title-body contract: the first ~30 seconds (~150 words) must pay off the **Title promise** verbatim or near-verbatim.",
  );
  lines.push("");
  lines.push(
    "Begin with the title line as `# Title: <title>` so the parser knows where the body starts.",
  );

  return lines.join("\n");
}

/**
 * Per-violation concrete fix hint for the retry prompt. The system prompt
 * already lists generic replacements; this surfaces a sentence-shaped
 * rewrite anchored to the actual offending snippet so Claude can edit in
 * place instead of re-deriving the rule.
 */
function suggestRetryFix(v: ScriptViolation): string {
  if (v.rule === "unanchored_stat") {
    // Wave 5 — fabricated stat. Tell the model exactly what its three
    // legal options are (mirrors the system-prompt rule). Replacement
    // value can't be inferred here without re-extracting tokens; the
    // model has the SoT block + cited facts in its system message and
    // can pick the right anchor itself.
    return [
      `this number isn't in your Source-of-truth metrics block or the`,
      `cited-facts block. Either (a) replace it with the real value from`,
      `the data, (b) rewrite the sentence with directional language`,
      `("meaningfully above the citywide average", "most listings aren't`,
      `closing", "more sellers walking away than completing"), or (c)`,
      `remove the claim if it was load-bearing only for narrative. DO`,
      `NOT invent a replacement number.`,
    ].join(" ");
  }
  if (v.rule === "no_misattributed_stats") {
    // Wave 5 — member's own stat attributed to CREB/CMHC/BoC. Tell the
    // model how to re-attribute without dropping the number.
    return [
      `this number is your own deterministic aggregation but the`,
      `sentence credits an outside source (CREB / CMHC / BoC / etc.).`,
      `Keep the number; rewrite the attribution to the member's own`,
      `market analysis — "from the data we ran this month," "what our`,
      `team's seeing in the numbers," "we pulled this from MLS," "our`,
      `analysis shows."`,
    ].join(" ");
  }
  if (v.rule === "no_why" && v.snippet) {
    const rewritten = v.snippet
      // "the reason why" → "the reason" (kill the redundant why first)
      .replace(/\bthe reason why\b/gi, "the reason")
      // "here's why" / "that's why" / "and here's why" → "here's what's behind" / "what's happening"
      .replace(/\bhere'?s why\b/gi, "here's what's behind")
      .replace(/\bthat'?s why\b/gi, "here's what's happening with")
      // generic standalone "why" → "what's behind"
      .replace(/\bwhy\b/gi, "what's behind");
    return (
      `rewrite without "why". Suggested rewrite: \`${rewritten}\`. ` +
      'Or pick another replacement from the system prompt — ' +
      '"the reason", "what\'s causing this", "here\'s what\'s happening", ' +
      '"what\'s driving this", "what\'s actually going on".'
    );
  }
  if (v.rule === "no_avatar_pander") {
    return (
      "remove the avatar-segment phrase and rewrite the sentence to speak " +
      "to the viewer as a peer, not as a targeted segment. Example: " +
      '*"for people like you, this matters"* → *"this matters — and here\'s the moment we\'re all in."*'
    );
  }
  if (v.rule === "min_dialogue_length") {
    // Wave 8 Fix 2 — body fell below the 2,200-word floor. Force expansion
    // using real profile content, not filler.
    return [
      "expand the body to clear 2,200 dialogue words using the FULL",
      "neighbourhood profile content already in your system prompt — add",
      "named anchors, specific data points, editorial reactions, and a",
      "back-half synthesis paragraph. DO NOT pad with filler, restated",
      "thesis, or generic framing. DO NOT invent stats — every new number",
      "must come from the Source-of-truth metrics or cited-facts block.",
    ].join(" ");
  }
  if (v.rule === "no_announced_credibility") {
    // Wave 8 Fix 3 — opening announced credibility instead of dropping it
    // sideways. Point the model back at the approved-list patterns.
    return [
      "rewrite the Revelation beat so credibility lands SIDEWAYS, woven",
      "into the explanation. Replace this sentence with exactly one of the",
      "approved sideways drops:",
      '"Our team helps a family move every [X] hours" (real number from',
      'MarketConfig.teamCredentials if available, else "every few days"),',
      '"Weekly since June 2020, every video, every Monday, no skips",',
      '"What I\'ve learned in helping thousands of families through this',
      'market is...", or "After helping [X] families move through this',
      'exact pattern, here\'s what I know...". Never the first sentence,',
      "never a self-introduction, never paired with a name.",
    ].join(" ");
  }
  if (v.rule === "people_like_us_in_lm") {
    // Wave 8 Fix 4 — high-impact identity phrase inside an LM window.
    return [
      'move "people like us" out of the lead-magnet placement entirely.',
      "It's a high-impact identity move that loses power when used inside",
      "conversion pitches. Either (a) relocate it to a content beat (data",
      "peak, clarity moment) at least 100 characters away from any",
      "`[LEAD MAGNET …]` tag, or (b) remove it from the script. Use it",
      "AT MOST once per script, never inside or adjacent to an LM tag.",
    ].join(" ");
  }
  return v.message;
}

/**
 * Retry prompt. Sent when validateScript() returns error-severity
 * violations and we have retries left. Names each violation precisely
 * (rule, message, snippet, line) so Claude can do a targeted fix rather
 * than a wholesale rewrite.
 */
function buildRetryUserMessage(args: {
  plan: PlanContext;
  previousDraft: string;
  violations: ScriptViolation[];
  /**
   * Wave 5 — dialogue word count of the previous draft. When the prior
   * draft fell short of the 2500-word target, the retry message asks
   * the model to expand using real neighbourhood context (NOT fabricated
   * stats) while it fixes the flagged violations.
   */
  previousDialogueWordCount?: number | null;
}): string {
  const { plan, previousDraft, violations, previousDialogueWordCount } = args;
  const lines: string[] = [];

  // Wave 5 — distinguish data-integrity violations (the gate that just
  // got promoted to ERROR) from the other locked rules so the model
  // gets a clear "stop fabricating" signal up front instead of buried
  // inside the per-line fix list.
  const statViolations = violations.filter(
    (v) => v.rule === "unanchored_stat" || v.rule === "no_misattributed_stats",
  );
  const shortOfTarget =
    typeof previousDialogueWordCount === "number" &&
    previousDialogueWordCount < 2500;

  lines.push(
    `Your previous draft failed ${violations.length} server-side content-rule check(s). The rest of the prior script was good — keep its structure, voice, citations, and visual tags. ONLY fix the specific lines named below.`,
  );

  if (statViolations.length > 0) {
    lines.push("");
    lines.push("## DATA INTEGRITY GATE — unsourced or misattributed stats");
    lines.push("");
    lines.push(
      `Your previous draft contained ${statViolations.length} unsourced or misattributed stat(s) that triggered the data integrity gate. These are HARD FAILS — the channel's edge is precision, not vibes. Regenerate the FULL script. Replace each flagged stat with either:`,
    );
    lines.push("");
    lines.push(
      "(a) the real value from `## Source-of-truth metrics` or the cited facts block, OR",
    );
    lines.push(
      '(b) directional language ("most listings", "meaningfully above the citywide average", "more sellers walk away than complete the sale") if no real value applies, OR',
    );
    lines.push(
      "(c) remove the claim entirely if it was load-bearing only for narrative.",
    );
    lines.push("");
    lines.push(
      "DO NOT invent a replacement number. DO NOT swap one fabricated threshold for another (e.g. \"above 50%\" → \"above 40%\"). Use real values or directional language.",
    );
    if (shortOfTarget) {
      lines.push("");
      lines.push(
        `Your previous draft was ${previousDialogueWordCount} dialogue words — short of the 2500-word target. Expand by adding REAL neighbourhood context from the FULL profiles in your system message (demographics, housing stock, lifestyle, recent developments). DO NOT introduce new fabricated stats to hit the word count.`,
      );
    }
  } else if (shortOfTarget) {
    lines.push("");
    lines.push(
      `Note: previous draft was ${previousDialogueWordCount} dialogue words — short of the 2500-word target. While you fix the flagged lines, also expand the neighbourhood sections using real profile content (demographics, housing stock, lifestyle, recent developments). No fabricated stats.`,
    );
  }

  // Wave 5 follow-up — hard-stop guidance for the two rules Claude
  // keeps tripping across retries (no_why, no_abbrev_in_dialogue).
  // Counting per-rule occurrences makes the message concrete instead of
  // generic, so the model can see how many fixes it still has to do.
  const whyCount = violations.filter((v) => v.rule === "no_why").length;
  if (whyCount > 0) {
    lines.push("");
    lines.push("**no_why violations — HARD STOP.**");
    lines.push("");
    lines.push(
      `Your previous draft used the word "why" ${whyCount} time(s) in dialogue. This is a HARD FAIL on this channel. Every instance of "why" must be rewritten using one of:`,
    );
    lines.push("- \"the reason\"");
    lines.push("- \"what's causing this\"");
    lines.push("- \"what's behind this\"");
    lines.push("- \"here's what's happening\"");
    lines.push("- \"the mechanism\"");
    lines.push("- \"what's driving this\"");
    lines.push("- \"what's actually going on\"");
    lines.push("");
    lines.push(
      'DO NOT use "why" anywhere in spoken dialogue, not even as a transition or rhetorical question. Titles can use "why" freely; only the body is checked.',
    );
  }

  const abbrevHits = violations.filter(
    (v) => v.rule === "no_abbrev_in_dialogue",
  );
  if (abbrevHits.length > 0) {
    // Extract the offending abbreviations from messages so the model
    // gets back the exact strings it used. Messages look like:
    //   Found banned dialogue abbreviation "MOI". …
    const offenders = Array.from(
      new Set(
        abbrevHits
          .map((v) => v.message.match(/abbreviation "([^"]+)"/)?.[1])
          .filter((s): s is string => Boolean(s)),
      ),
    );
    const list = offenders.length > 0 ? offenders.join(", ") : "MOI / DOM / SP/LP";
    lines.push("");
    lines.push("**no_abbrev_in_dialogue violations — HARD STOP.**");
    lines.push("");
    lines.push(
      `Your previous draft used ${list} in spoken dialogue. Abbreviations MOI, DOM, PSF, SP/LP, SP-LP must be spelled out fully in dialogue (months of inventory, days on market, price per square foot, sales-to-list-price ratio).`,
    );
    lines.push("");
    lines.push(
      "Abbreviations remain allowed ONLY inside [VISUAL: ...] tags and on-screen overlays.",
    );
  }
  lines.push("");
  lines.push("## PRIOR ATTEMPT VIOLATIONS — fix THESE specific lines");
  lines.push("");
  for (const v of violations) {
    const loc = v.line ? `Line ${v.line}` : "Unlocated line";
    const snip = v.snippet
      ? v.snippet.replace(/`/g, "'")
      : "(snippet unavailable)";
    lines.push(`### ${loc} — [${v.rule}]`);
    lines.push("");
    lines.push(`Offending text: \`${snip}\``);
    lines.push("");
    const fix = suggestRetryFix(v);
    lines.push(`Fix: ${fix}`);
    lines.push("");
  }
  lines.push(
    "Re-generate the script with these specific fixes applied. Do not rewrite sections that weren't flagged. Re-emit the FULL script (the streaming pipeline needs the whole thing), but the only substantive edits should be on the lines above.",
  );
  lines.push("");
  lines.push("## Title promise to preserve");
  lines.push("");
  lines.push(`> ${plan.titlePromise}`);
  lines.push("");
  lines.push("## Your previous draft (for reference)");
  lines.push("");
  lines.push("```");
  lines.push(previousDraft);
  lines.push("```");
  lines.push("");
  lines.push(
    "Re-emit the corrected FULL script. Begin with `# Title: <title>` as before.",
  );

  return lines.join("\n");
}

/**
 * Wave 5 follow-up (hardened) — extract NARRATIVE text from the
 * primary-avatar payload for the stat validator's profile-sourced
 * whitelist. We deliberately avoid `JSON.stringify(avatar)` because
 * the avatar object carries IDs, UUIDs, timestamps, version markers,
 * and other numeric metadata that would over-broaden the whitelist
 * and let fabricated stats slip through.
 *
 * Two layers of filtering:
 *   1. KEY-based: when walking the profile object, skip any field
 *      whose key looks like metadata (id / uuid / *At timestamp /
 *      version / source / hash / etc.).
 *   2. VALUE-based: skip leaf strings that look like a UUID, ISO
 *      timestamp, or pure long-digit identifier — these are the
 *      shapes that carry incidental digits with no narrative value.
 *
 * Only `summary` (string) plus the surviving string leaves of
 * `profile` (recursive) reach the validator.
 */
const AVATAR_METADATA_KEY_RE =
  /^(?:id|_?id|uuid|hash|version|source|snappedAt|createdAt|updatedAt|.*At|.*Id|.*Uuid)$/i;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const PURE_LONG_DIGIT_RE = /^\d{6,}$/;

function looksLikeMetadataValue(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return true;
  if (UUID_RE.test(trimmed)) return true;
  if (ISO_TIMESTAMP_RE.test(trimmed)) return true;
  if (PURE_LONG_DIGIT_RE.test(trimmed)) return true;
  return false;
}

function extractAvatarNarrativeText(avatar: unknown): string[] {
  const out: string[] = [];
  if (!avatar || typeof avatar !== "object") {
    if (typeof avatar === "string") out.push(avatar);
    return out;
  }
  const a = avatar as Record<string, unknown>;
  if (typeof a.summary === "string" && !looksLikeMetadataValue(a.summary)) {
    out.push(a.summary);
  }
  const profile = a.profile;
  if (profile && typeof profile === "object") {
    const walk = (node: unknown) => {
      if (typeof node === "string") {
        if (!looksLikeMetadataValue(node)) out.push(node);
      } else if (Array.isArray(node)) {
        for (const x of node) walk(x);
      } else if (node && typeof node === "object") {
        for (const [key, v] of Object.entries(
          node as Record<string, unknown>,
        )) {
          if (AVATAR_METADATA_KEY_RE.test(key)) continue;
          walk(v);
        }
      }
    };
    walk(profile);
  }
  return out;
}
