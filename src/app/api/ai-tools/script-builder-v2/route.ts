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
 *   data: {"key": "intro", "label": "Drafting the 3-beat intro..."}
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
  validateScript,
  type ScriptViolation,
  type ScriptValidationResult,
} from "@/lib/script-content-rules";
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

interface RequestBody {
  planId?: string;
  shootType?: "talking_head" | "home_tour";
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
      select: { name: true, destinationUrl: true, leadMagnetUrl: true },
    });
    if (campaign) {
      assignedCampaign = {
        name: campaign.name,
        destinationUrl: campaign.destinationUrl,
        leadMagnetUrl: campaign.leadMagnetUrl,
      };
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
  if (!marketConfig) {
    return jsonError(
      409,
      "no_market_config",
      "Configure your market (avatar, sub-personas, MOI thresholds) before writing a script.",
    );
  }

  // ── Load NeighbourhoodProfile summaries for the cited neighbourhoods ─
  const neighbourhoodsInScript = Array.from(
    new Set(citedFacts.map((f) => f.neighbourhood).filter(Boolean)),
  );
  const neighbourhoodContext = await getNeighbourhoodContext(
    userId,
    neighbourhoodsInScript,
    "summary",
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
      heartbeat = setInterval(() => {
        if (clientSignal.aborted) {
          stopHeartbeat();
          return;
        }
        try {
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

        for (let attempt = 0; attempt <= MAX_REPROMPTS; attempt++) {
          if (internalAbort.signal.aborted) break;

          // Phase: first attempt walks intro→body→hook; retries jump
          // straight to "fixing rule violations".
          if (attempt === 0) {
            emit("phase", {
              key: "intro",
              label: "Drafting the 3-beat intro...",
            });
          } else {
            emit("phase", {
              key: "reprompt",
              label: `Re-prompting to fix ${lastErrors.length} content-rule violation(s) (attempt ${attempt + 1}/${MAX_REPROMPTS + 1})...`,
            });
          }

          const userMessage =
            attempt === 0
              ? buildInitialUserMessage({
                  plan: planContext,
                  facts: citedFacts,
                  marketConfig,
                  neighbourhoodContext,
                  shootType,
                  assignedCampaign,
                  assignedBingeVideo,
                })
              : buildRetryUserMessage({
                  plan: planContext,
                  previousDraft: lastDraft,
                  violations: lastErrors,
                });

          // Mid-stream phase pulses — fire-and-forget timers that emit
          // "body" then "hook" labels while Claude is producing tokens.
          // They never block the stream and self-cancel on abort.
          const midStreamTimers: ReturnType<typeof setTimeout>[] = [];
          midStreamTimers.push(
            setTimeout(() => {
              emit("phase", {
                key: "body",
                label: "Building the data → psychology → clarity body...",
              });
            }, 12000),
          );
          midStreamTimers.push(
            setTimeout(() => {
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
          try {
            // Anthropic streaming API. `signal: internalAbort.signal`
            // ensures abort propagates upstream so we stop being billed
            // for tokens the client will never see.
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
                draft += text;
                emit("token", { text });
              }
            }
          } catch (err) {
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

          // ─ Server-side validation gate ──────────────────────────────
          emit("phase", {
            key: "validate",
            label: "Validating content rules...",
          });
          const validation = validateScript(draft, {
            neighbourhoods: marketConfig.neighbourhoods,
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
  shootType: "talking_head" | "home_tour";
  assignedCampaign: AssignedCampaign | null;
  assignedBingeVideo: AssignedBingeVideo | null;
}): string {
  const {
    plan,
    facts,
    marketConfig,
    neighbourhoodContext,
    shootType,
    assignedCampaign,
    assignedBingeVideo,
  } = args;
  const lines: string[] = [];

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

  lines.push("## Member's MarketConfig");
  lines.push("");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        marketName: marketConfig.marketName,
        primaryAvatar: marketConfig.primaryAvatar,
        subPersonas: marketConfig.subPersonas,
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
      "**Lead magnet** (use this verbatim in all `[LEAD MAGNET 1/3]`, `[LEAD MAGNET 2/3]`, `[LEAD MAGNET 3/3]` placements — do NOT invent a generic substitute):",
    );
    lines.push(`- Name: ${assignedCampaign.name}`);
    lines.push(`- URL: ${url}`);
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
    "Produce the FULL talking-head script in the format the system prompt specifies (3-beat intro → DATA → PSYCHOLOGY → CLARITY body → next-video hook), with `[VISUAL: ...]` tags throughout. Cite every fact from the JSON above by weaving the metric value into dialogue at least once. Title-body contract: the first ~30 seconds (~150 words) must pay off the **Title promise** verbatim or near-verbatim.",
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
}): string {
  const { plan, previousDraft, violations } = args;
  const lines: string[] = [];

  lines.push(
    `Your previous draft failed ${violations.length} server-side content-rule check(s). The rest of the prior script was good — keep its structure, voice, citations, and visual tags. ONLY fix the specific lines named below.`,
  );
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
