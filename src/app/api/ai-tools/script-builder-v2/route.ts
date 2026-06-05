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
import { resolveUserFromSession } from "@/lib/session-utils";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getCostCapStatus, logUsage } from "@/lib/ai-tool-cost";
import prisma from "@/lib/prisma";
import {
  EARLY_PLAN_STATUSES,
  PUBLISHED_PLAN_STATUSES,
} from "@/lib/binge-target";
import { getSourceOfTruthMetrics } from "@/lib/aggregated-metrics";
import { loadMarketConfigSummary } from "@/lib/content-engine-context";
import { getNeighbourhoodContext } from "@/lib/get-neighbourhood-context";
import { enrichPlanWithRelatedFacts } from "@/lib/script-plan-enrichment";
import {
  METRIC_NAME_LABELS,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import {
  classifyAnthropicError,
  type ScriptError,
} from "@/lib/script-builder-errors";
import { evaluateScriptPreflight } from "@/lib/script-preflight";
import {
  buildScript,
  buildPropertyTypeLock,
  type CitedFact,
  type PlanContext,
  type AssignedCampaign,
  type AssignedBingeVideo,
  type RegenerationBrief,
} from "@/lib/tools/scriptBuilder";

export const runtime = "nodejs";
export const maxDuration = 300; // ~5 min for a 12-16 min script + re-prompts

// The Script Builder core (prompts, generate→validate→retry loop, tuning
// constants) now lives in `@/lib/tools/scriptBuilder` as a pure, headlessly
// testable function. This route owns only the HTTP/SSE shell: auth, feature
// flags, cost cap, Prisma loads, and mapping `buildScript`'s result onto SSE
// frames. Types (CitedFact / PlanContext / AssignedCampaign /
// AssignedBingeVideo / RegenerationBrief) are imported from there.

interface RequestBody {
  planId?: string;
  shootType?: "talking_head" | "home_tour";
  regenerationBrief?: RegenerationBrief;
}

// Binge-target status sets (EARLY_PLAN_STATUSES / PUBLISHED_PLAN_STATUSES)
// now live in @/lib/binge-target so the save-script route shares the exact
// same "usable?" definition.

// ───────────────────────────────────────────────────────────────────────
// POST handler
// ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth + feature flag (HTTP errors before opening the stream) ──────
  // Impersonation-aware: an admin/editor impersonating a member must read and
  // bill against the MEMBER's id (plan ownership + cost cap), not their own.
  const resolved = await resolveUserFromSession();
  if (!resolved) return jsonError(401, "Unauthorized");
  const userId = resolved.id;
  const userRole = resolved.role;

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_script_builder_v2) return jsonError(404, "Not enabled");

  // ── Cost cap (hard block before any Claude work) ─────────────────────
  const cap = await getCostCapStatus(userId);
  if (cap.hardBlocked) {
    return jsonError(
      402,
      "monthly_cost_cap_reached",
      `You've hit your $${cap.capUsd.toFixed(2)} monthly AI budget. It resets on the 1st of next month.`,
      { category: "cost_cap_hit" },
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
    where: { id: body.planId, userId, deletedAt: null },
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

  let linkedFactIds: string[] = Array.isArray(plan.linkedFactIds)
    ? (plan.linkedFactIds as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];

  // Layer-1 auto-enrichment (defensive — the wizard page runs this first, but
  // direct API callers and stale navigations must get the same treatment).
  // Pulls in-scope headline-safe facts to lift 1–2-fact plans over the gate
  // without widening scope. Best-effort: a failure here must not block a plan
  // that already has facts, so we fall back to the existing links.
  try {
    const enriched = await enrichPlanWithRelatedFacts({
      userId,
      planId: plan.id,
      persist: true,
    });
    if (enriched.added.length > 0) {
      linkedFactIds = [...linkedFactIds, ...enriched.added.map((a) => a.id)];
    }
  } catch (err) {
    console.error("[script-builder-v2] enrichment failed", err);
  }

  // Gate behaviour change: only a TRUE zero-fact plan is blocked here (it has
  // no anchor at all). 1–2-fact plans are allowed through with a Low Support
  // banner surfaced in the wizard — the script is still anchorable, just thin.
  if (linkedFactIds.length < 1) {
    return jsonError(
      409,
      "insufficient_linked_facts",
      "This plan has no linked facts — link facts to it or run a data search before building a script.",
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
    where: { ...EXCLUDE_LEGACY_FAILURE_RATE, id: { in: linkedFactIds }, userId },
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
  if (factRows.length < 1) {
    return jsonError(
      409,
      "cited_facts_not_found",
      `None of the plan's ${linkedFactIds.length} linked facts are still in your facts library — they may have been deleted. Re-run the wizard to relink, or run a data search to add facts.`,
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

  // ── Pre-flight fact-sufficiency (Part D — before ANY Anthropic call) ──
  // Categorically-unsatisfiable plans (e.g. a Neighbourhood Fact video whose
  // only linked facts are city-wide aggregates) fail here with an actionable
  // `insufficient_facts` instead of burning ~5 min of generation + retries on
  // a script that can't pass. Conservative by design — it never blocks the
  // 1–2-fact "Low Support" population the wizard intentionally lets through.
  const preflight = evaluateScriptPreflight({
    rotationSlot: plan.rotationSlot as RotationSlotKey,
    facts: citedFacts.map((f) => ({ neighbourhood: f.neighbourhood })),
  });
  if (!preflight.ok) {
    return jsonError(422, "insufficient_facts", preflight.message, {
      category: "insufficient_facts",
      details: {
        modeName: preflight.modeName,
        needed: preflight.needed,
        have: preflight.have,
        uncovered: preflight.uncovered,
      },
    });
  }

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
      where: { id: plan.bingeVideoId, userId, deletedAt: null },
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
      "Plan has no binge target assigned — the script will close with a generic CTA (no next-video tease). Assign a binge target in the planner to reference a specific next video.",
    );
  }

  // Binge guard inputs (fed to the prompt's BINGE TARGET block + the
  // `binge_target_match` validator). `configured` is true ONLY when a usable
  // (existing, non-idea-stage) target resolved above; otherwise the script
  // must NOT reference any "next video" (fabrication guard).
  const bingeTargetConfigured = assignedBingeVideo !== null;
  const bingeTargetTitle = assignedBingeVideo?.title ?? null;

  // ── Load MarketConfig (avatar, sub-personas, MOI thresholds, ...) ────
  const marketConfig = await loadMarketConfigSummary(userId);
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

  // ── B1 — presenter identity (strict, resolved-member-only) ───────────
  // Read the member's OWN name; never fall back to a hardcoded presenter.
  // `resolveUserFromSession` already returns the impersonated member's id, so
  // an admin impersonating a member correctly scripts as that member.
  const memberRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });
  const memberFullName = memberRecord?.fullName?.trim() || null;
  // Other members' full names — input to the validator's cross-member leak
  // guard. Only multi-token names are kept (the validator also requires this)
  // to avoid flagging common first names that appear in ordinary dialogue.
  const otherMembers = await prisma.user.findMany({
    where: { id: { not: userId }, fullName: { not: null } },
    select: { fullName: true },
  });
  const forbiddenIdentities = otherMembers
    .map((u) => (u.fullName ?? "").trim())
    .filter((n) => n.length > 0 && n.split(/\s+/).length >= 2);
  // Onboarding nudge — surfaced alongside the script when creds are unset.
  const teamCred = marketConfig.teamCredibility;
  const hasTeamCredibility = !!(
    teamCred &&
    (teamCred.yearsInBusiness != null ||
      teamCred.familiesHelped != null ||
      teamCred.annualTransactionCount != null ||
      (teamCred.notes != null && teamCred.notes.trim().length > 0))
  );
  if (!hasTeamCredibility) {
    planWarnings.push(
      "Add your team credibility numbers in onboarding (Step 5: years in business, families helped, annual transactions) so scripts can include a credibility moment. Until then, scripts won't state any credentials — and never borrow another presenter's.",
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
      const t0 = Date.now();
      const ms = () => Date.now() - t0;
      const trace = (event: string, label: string) => {
        console.log(
          `[sb-v2:emit] t=${ms()}ms event=${event} label="${label.slice(0, 40)}"`,
        );
      };
      console.log(`[sb-v2 telemetry] +0ms stream-start user=${userId}`);
      console.log(`[sb-v2:start] t=${ms()}ms user=${userId}`);

      heartbeat = setInterval(() => {
        if (clientSignal.aborted) {
          stopHeartbeat();
          return;
        }
        try {
          console.log(`[sb-v2 telemetry] +${ms()}ms heartbeat enqueueing`);
          console.log(`[sb-v2:heartbeat] t=${ms()}ms`);
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          console.log(`[sb-v2 telemetry] +${ms()}ms heartbeat enqueued`);
        } catch {
          // Controller already closed — stop ticking.
          stopHeartbeat();
        }
      }, 2000);

      const emit = (event: string, data: unknown) => {
        if (clientSignal.aborted) return;
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        const frame = encoder.encode(payload);
        const frameBytes = frame.byteLength;
        const key =
          data && typeof data === "object" && data !== null && "key" in data
            ? String((data as { key?: unknown }).key ?? "—")
            : "—";
        console.log(
          `[sb-v2 telemetry] +${ms()}ms emit event=${event} key=${key} bytes=${frameBytes} (pre-enqueue)`,
        );
        try {
          controller.enqueue(frame);
          console.log(
            `[sb-v2 telemetry] +${ms()}ms emit event=${event} key=${key} bytes=${frameBytes} (post-enqueue)`,
          );
        } catch {
          // Controller already closed — ignore.
          console.log(
            `[sb-v2 telemetry] +${ms()}ms emit event=${event} key=${key} bytes=${frameBytes} (enqueue-failed: controller closed)`,
          );
        }
      };

      // Terminal structured error frame. Every in-stream failure path routes
      // through here so the client always receives a categorized `error` event
      // (category + message + details) instead of a silent close.
      const emitScriptError = (
        scriptError: ScriptError,
        extra?: Record<string, unknown>,
      ) => {
        console.log(
          `[sb-v2 telemetry] +${ms()}ms TERMINAL event=error category=${scriptError.category}`,
        );
        emit("error", {
          category: scriptError.category,
          error: scriptError.category,
          message: scriptError.message,
          ...(scriptError.details ? { details: scriptError.details } : {}),
          ...(extra ?? {}),
        });
      };

      try {
        const result = await buildScript({
          planContext,
          citedFacts,
          marketConfig,
          neighbourhoodContext,
          sourceOfTruthMetrics,
          propertyTypeByHood,
          shootType,
          assignedCampaign,
          assignedBingeVideo,
          regenerationBrief: body.regenerationBrief ?? null,
          memberFullName,
          forbiddenIdentities,
          bingeTargetConfigured,
          bingeTargetTitle,
          signal: internalAbort.signal,
          callbacks: {
            onPhase: (key, label) => {
              trace("phase", label);
              emit("phase", { key, label });
            },
            onToken: (text) => emit("token", { text }),
            onViolation: (info) => emit("violation", info),
          },
        });

        // Fold the core's token usage into the route accumulator so every
        // terminal path bills exactly the tokens consumed (success, validation
        // failure, anthropic error, or client abort).
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;

        if (result.aborted) {
          // Client disconnected mid-stream — bill quietly, emit nothing.
          if (totalInputTokens || totalOutputTokens) {
            await logUsage(
              userId,
              "script_builder_v2",
              totalInputTokens,
              totalOutputTokens,
            );
          }
        } else if (result.error) {
          // Terminal categorized failure (validator_max_retries / anthropic_*)
          // — emit the structured error frame, THEN bill for partial spend.
          emitScriptError(result.error, result.errorExtra);
          if (totalInputTokens || totalOutputTokens) {
            await logUsage(
              userId,
              "script_builder_v2",
              totalInputTokens,
              totalOutputTokens,
            );
          }
        } else if (result.ok) {
          // Bill BEFORE emitting `complete` so the spend the client sees
          // matches what `getCostCapStatus()` returns on the next call.
          await logUsage(
            userId,
            "script_builder_v2",
            totalInputTokens,
            totalOutputTokens,
          );
          const capAfter = await getCostCapStatus(userId);
          console.log(`[sb-v2 telemetry] +${ms()}ms TERMINAL event=complete`);
          emit("complete", {
            script: result.script,
            attempt: result.attempt,
            // Only warnings reach the client here — errors blocked save.
            warnings: result.warnings,
            metrics: result.metrics,
            monthSpendUsd: capAfter.monthSpendUsd,
            capUsd: capAfter.capUsd,
            softWarning: capAfter.softWarning,
            planWarnings,
          });
        }
      } catch (err) {
        // Safety net: any exception outside the Anthropic-specific catch
        // (e.g. validateScript, autoFix passes, logUsage, getCostCapStatus)
        // would otherwise close the stream with no terminal frame, leaving
        // the client to fall back to the generic "connection closed" error.
        // Classify and emit one last categorized frame before the finally
        // closes the controller.
        if (!internalAbort.signal.aborted) {
          const scriptError = classifyAnthropicError(err);
          const msg = (err as { message?: string })?.message ?? String(err);
          console.error(
            `[script-builder-v2] uncaught stream error (category=${scriptError.category}${
              scriptError.details?.ticketId
                ? ` ticket=${scriptError.details.ticketId}`
                : ""
            }):`,
            msg,
          );
          emitScriptError(scriptError);
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
      console.log(
        `[sb-v2 telemetry] cancel() called — client disconnected (reader closed)`,
      );
      stopHeartbeat();
      internalAbort.abort();
    },
  });

  const responseHeaders = {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    // Defensive: tells nginx/cloudflare-style proxies not to buffer.
    "x-accel-buffering": "no",
    connection: "keep-alive",
  };
  console.log(
    `[sb-v2 telemetry] response constructed, headers: ${JSON.stringify(responseHeaders)}`,
  );
  return new Response(stream, {
    status: 200,
    headers: responseHeaders,
  });
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function jsonError(
  status: number,
  error: string,
  message?: string,
  extra?: Record<string, unknown>,
): Response {
  const body: Record<string, unknown> = { error };
  if (message) body.message = message;
  if (extra) Object.assign(body, extra);
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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
