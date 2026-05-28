"use client";

/**
 * Wave 3 — Script Builder v2 wizard, Step 5: Generate + stream.
 *
 * Opens a single fetch POST to /api/ai-tools/script-builder-v2 (NOT
 * EventSource — that's GET-only) and parses the SSE byte stream
 * manually: TextDecoder for chunked UTF-8, split on "\n\n" for frames,
 * per-line "event:" / "data:" prefix parsing, JSON-parse the joined
 * data lines. The single AbortController is the source of truth for
 * cancellation — aborting it cancels both the fetch AND the in-flight
 * reader.read() in one step.
 *
 * Pattern crib from Step3IdeaCards.tsx:
 *   - AbortController is the cancellation source of truth; no
 *     `cancelled` flag in a finally block (that was the spinner bug).
 *   - thinking.start() runs synchronously on mount so StrictMode's
 *     mount → cleanup → mount sequence never leaves a blank dead
 *     period.
 *   - thinking.stop() is called on TERMINAL branches only (done /
 *     error / user-stopped). The abort path means "I'm being replaced
 *     by a remount that already called start() and owns the indicator
 *     now" — stopping there would race the new mount and hide the
 *     spinner.
 *   - Terminal-state writes (setDone / onComplete / updateStep)
 *     happen BEFORE thinking.stop() so the UI hand-off is atomic.
 *   - Phase event handler REPLACES state (resetSteps / updateStep) —
 *     never accumulates — so a remount under StrictMode starts clean
 *     instead of double-stepping the pipeline.
 *
 * Pipeline mapping. The route emits six phase keys, mapped onto a
 * three-step pipeline so the user sees the high-level shape:
 *
 *   load                    → step "load" active
 *   intro / body / hook     → step "load" complete, step "draft" active
 *   reprompt                → step "draft" active (re-prompt label)
 *   validate                → step "draft" complete, step "validate" active
 *   complete                → step "validate" complete
 *
 * The granular per-phase label from the server is shown beneath the
 * pipeline as a sub-line so the user gets both the macro shape and
 * the micro update.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AiThinking, type PipelineStep } from "@/components/ai/AiThinking";
import { useAiThinking } from "@/lib/use-ai-thinking";
import type { ShootType } from "./Step4ShootType";
import type { ScriptViolation } from "@/lib/script-content-rules";

interface ScriptMetrics {
  dialogueWordCount: number;
  anchoredDetailCount: number;
  anchoredDetailsPer120Words: number;
}

export interface Step5CompletePayload {
  script: string;
  attempt: number;
  warnings: ScriptViolation[];
  metrics: ScriptMetrics;
  monthSpendUsd: number;
  capUsd: number;
  softWarning: boolean;
  planWarnings?: string[];
}

/**
 * Wave 3.5 — Smart Regenerate. The 5 fixed categories (ordered) that
 * `/api/ai-tools/script-builder-v2/suggest-improvements` returns.
 */
const SUGGESTION_CATEGORIES = [
  "data_depth",
  "specificity",
  "audience_reach",
  "storytelling",
  "cta_engagement",
] as const;
type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

const SUGGESTION_CATEGORY_META: Record<
  SuggestionCategory,
  { icon: string; label: string }
> = {
  data_depth: { icon: "🎯", label: "Data depth" },
  specificity: { icon: "📍", label: "Specificity" },
  audience_reach: { icon: "👥", label: "Audience reach" },
  storytelling: { icon: "✍️", label: "Storytelling" },
  cta_engagement: { icon: "🎬", label: "CTA & engagement" },
};

interface Suggestion {
  id: string;
  category: SuggestionCategory;
  title: string;
  description: string;
  regenerationDirective: string;
}

interface SuggestImprovementsResponse {
  suggestions: Suggestion[];
  metrics: {
    factsUsed: number;
    factsAvailable: number;
    subPersonasMentioned: string[];
    subPersonasMissing: string[];
    knowledgeBaseProfilesAvailable: number;
    knowledgeBaseProfilesReferenced: number;
    hasLeadMagnet: boolean;
    hasBingeTarget: boolean;
  };
  cost: number;
}

export interface RegenerationBrief {
  selectedSuggestions: Array<{
    category: SuggestionCategory;
    title: string;
    regenerationDirective: string;
  }>;
  customNotes: string;
  priorScript: string;
}

interface StreamError {
  kind: "http" | "stream" | "network";
  status?: number;
  error?: string;
  message?: string;
  violations?: ScriptViolation[];
  metrics?: ScriptMetrics;
}

interface Props {
  planId: string;
  shootType: ShootType;
  onBack: () => void;
  /**
   * Called with the final payload when generation completes
   * successfully (validation pass after ≤3 attempts). The parent
   * wizard decides what to do next (commit 6 will wire an
   * "Approve & Save" CTA that POSTs to a save endpoint).
   */
  onComplete: (result: Step5CompletePayload) => void;
  /**
   * Wave 3.5 — Smart Regenerate. When non-null, the streaming POST
   * body includes the brief and the server prepends a PRIOR ATTEMPT
   * block to the user message. Null on the first generation so the
   * body is byte-identical to Wave 3 (regression-safe). The reference
   * is part of the effect deps, so swapping it triggers a fresh run.
   */
  regenerationBrief?: RegenerationBrief | null;
}

const PIPELINE_LABELS = {
  load: "Load context",
  intro: "Draft intro",
  body: "Build body",
  hook: "Sharpen hook",
  validate: "Validate",
} as const;

function buildPipeline(
  load: PipelineStep["status"],
  intro: PipelineStep["status"],
  body: PipelineStep["status"],
  hook: PipelineStep["status"],
  validate: PipelineStep["status"],
): PipelineStep[] {
  return [
    { key: "load", label: PIPELINE_LABELS.load, status: load },
    { key: "intro", label: PIPELINE_LABELS.intro, status: intro },
    { key: "body", label: PIPELINE_LABELS.body, status: body },
    { key: "hook", label: PIPELINE_LABELS.hook, status: hook },
    { key: "validate", label: PIPELINE_LABELS.validate, status: validate },
  ];
}

/**
 * The very first paint shows step "load" as ACTIVE — not pending. This is
 * the defensive UX layer: regardless of whether the first server `phase`
 * event reaches the client (Replit proxy / Turbopack sometimes buffers the
 * leading SSE bytes), the user sees motion the moment they click Generate.
 * When a real `phase` event arrives, `phaseKeyToPipeline()` overrides this.
 */
const INITIAL_PIPELINE: PipelineStep[] = buildPipeline(
  "active",
  "pending",
  "pending",
  "pending",
  "pending",
);

/**
 * Time-keyed rotating activity labels. Used as the fallback when the
 * server hasn't sent a `phase` event yet, OR when the server stalls between
 * events for > 12s. Non-uniform intervals — they match the rough wall-clock
 * shape of a successful generation so the visible label tracks reality even
 * when no server events arrive.
 */
const ROTATION_LABELS: ReadonlyArray<{ atMs: number; label: string }> = [
  { atMs: 0, label: "Loading your validated facts…" },
  { atMs: 8_000, label: "Pulling neighbourhood context…" },
  { atMs: 16_000, label: "Drafting the 3-beat intro…" },
  { atMs: 32_000, label: "Building data → psychology → clarity…" },
  { atMs: 56_000, label: "Writing the next-video hook…" },
  { atMs: 80_000, label: "Validating content rules…" },
];

function rotationLabelAt(elapsedMs: number): string {
  let pick = ROTATION_LABELS[0].label;
  for (const entry of ROTATION_LABELS) {
    if (elapsedMs >= entry.atMs) pick = entry.label;
    else break;
  }
  return pick;
}

/**
 * Defensive client-side circle advancement. Mirrors the wall-clock shape of
 * a typical generation so the pipeline circles stop lying when no server
 * `phase` events arrive (Replit proxy / Turbopack sometimes buffers SSE):
 *
 *   0–16s    load=active
 *   16–40s   intro=active   (load complete)
 *   40–70s   body=active    (load,intro complete)
 *   70–90s   hook=active    (load,intro,body complete)
 *   90s+     validate=active (load,intro,body,hook complete)
 *
 * When a real server `phase` event lands, `phaseKeyToPipeline()` REPLACES
 * this client-timed state (server is authoritative).
 */
function rotationPipelineAt(elapsedMs: number): PipelineStep[] {
  if (elapsedMs < 16_000) return phaseKeyToPipeline("load")!;
  if (elapsedMs < 40_000) return phaseKeyToPipeline("intro")!;
  if (elapsedMs < 70_000) return phaseKeyToPipeline("body")!;
  if (elapsedMs < 90_000) return phaseKeyToPipeline("hook")!;
  return phaseKeyToPipeline("validate")!;
}

/** All five circles complete — used on the terminal `complete` event. */
const ALL_COMPLETE_PIPELINE: PipelineStep[] = buildPipeline(
  "complete",
  "complete",
  "complete",
  "complete",
  "complete",
);

const SERVER_STALL_RESCUE_MS = 12_000;

/**
 * Map a server phase key → the COMPLETE pipeline state for that key.
 *
 * Returning the full state (and applying via `resetSteps`) is a true
 * REPLACE, never an accumulate — which matters on `reprompt`. The
 * server emits `validate` → `reprompt` when an attempt fails the
 * content-rule gate; without a full reset, `validate=active` would
 * stick across the next draft attempt and the pipeline would lie.
 */
function phaseKeyToPipeline(key: string): PipelineStep[] | null {
  switch (key) {
    case "load":
      return buildPipeline("active", "pending", "pending", "pending", "pending");
    case "intro":
      return buildPipeline("complete", "active", "pending", "pending", "pending");
    case "body":
      return buildPipeline("complete", "complete", "active", "pending", "pending");
    case "hook":
      return buildPipeline("complete", "complete", "complete", "active", "pending");
    case "reprompt":
      // Re-prompt restarts the drafting phase from intro. Full REPLACE so
      // a previously-active "validate" doesn't stick across the retry.
      return buildPipeline("complete", "active", "pending", "pending", "pending");
    case "validate":
      return buildPipeline("complete", "complete", "complete", "complete", "active");
    default:
      return null;
  }
}

export function Step5GenerateStream({
  planId,
  shootType,
  onBack,
  onComplete,
  regenerationBrief = null,
}: Props) {
  const thinking = useAiThinking({
    mode: "pipeline",
    initialSteps: INITIAL_PIPELINE,
  });
  const [phaseLabel, setPhaseLabel] = useState<string>(
    "Connecting to the script generator…",
  );
  const [livePreview, setLivePreview] = useState<string>("");
  const [done, setDone] = useState<Step5CompletePayload | null>(null);
  const [error, setError] = useState<StreamError | null>(null);
  const [userStopped, setUserStopped] = useState(false);
  /**
   * Live-region announcement counter. Re-prompts bump this so screen
   * readers hear that a retry kicked off; the visible UI shows the
   * count next to the pipeline.
   */
  const [repromptCount, setRepromptCount] = useState(0);

  // Ref so the user-cancel button can abort from outside the effect.
  // Under StrictMode the second mount overwrites this with its own
  // controller — exactly what we want, the new mount owns cancellation.
  const abortRef = useRef<AbortController | null>(null);
  // Exposed by the effect so handleStop (outside the closure) can tear
  // down the rotation + stall-rescue timers. Without this, a user-clicked
  // Stop would leave both timers ticking until the component finally
  // unmounts, mutating phaseLabel in the meantime.
  const clearTimersRef = useRef<(() => void) | null>(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Reset all local state synchronously so a StrictMode remount
    // (or any future re-run) starts clean — the phase handler must
    // REPLACE, not accumulate.
    setLivePreview("");
    setDone(null);
    setError(null);
    setUserStopped(false);
    setRepromptCount(0);
    // Seed the visible label with the first rotation entry (not a generic
    // "Connecting…") so the user sees a meaningful, in-progress activity
    // on the very first paint, even if no SSE bytes have arrived yet.
    setPhaseLabel(rotationLabelAt(0));
    thinking.resetSteps(rotationPipelineAt(0));
    thinking.start();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // ── Defensive client-side rotation ───────────────────────────
    // Two timers cooperating:
    //   rotationTimer    — ticks every 1s, updates phaseLabel from the
    //                      ROTATION_LABELS schedule based on elapsed ms.
    //                      Always running unless a fresh server phase
    //                      event has overridden it within the rescue
    //                      window.
    //   stallRescueTimer — armed every time a server phase event arrives.
    //                      If no new server phase event fires within
    //                      SERVER_STALL_RESCUE_MS, we restart the
    //                      rotation so the UI keeps moving.
    //
    // Both are wired so that on terminal events (complete / error /
    // abort / user stop) they get cleared exactly once via `clearAll`.
    const startedAt = Date.now();
    let rotationTimer: ReturnType<typeof setInterval> | null = null;
    let stallRescueTimer: ReturnType<typeof setTimeout> | null = null;

    // Track which rotation window we last applied so we only call
    // resetSteps on actual window changes. Mirrors the 5-stage shape in
    // `rotationPipelineAt` (load / intro / body / hook / validate).
    // useAiThinking.resetSteps is an unconditional setSteps, so without
    // this guard we'd cause a fresh re-render every 1s tick.
    type WindowKey = "load" | "intro" | "body" | "hook" | "validate";
    let lastWindowKey: WindowKey | null = null;
    const windowKeyAt = (elapsedMs: number): WindowKey => {
      if (elapsedMs < 16_000) return "load";
      if (elapsedMs < 40_000) return "intro";
      if (elapsedMs < 70_000) return "body";
      if (elapsedMs < 90_000) return "hook";
      return "validate";
    };
    const startRotation = () => {
      if (rotationTimer !== null) return;
      rotationTimer = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        setPhaseLabel(rotationLabelAt(elapsed));
        // Advance pipeline circles client-side so the visual matches the
        // rotating label. A real server `phase` event still overrides via
        // `phaseKeyToPipeline` in the event handler (server is
        // authoritative); we just stop being stuck on the first circle
        // while the server is silent.
        const wk = windowKeyAt(elapsed);
        if (wk !== lastWindowKey) {
          lastWindowKey = wk;
          thinking.resetSteps(rotationPipelineAt(elapsed));
        }
      }, 1000);
    };
    const stopRotation = () => {
      if (rotationTimer !== null) {
        clearInterval(rotationTimer);
        rotationTimer = null;
      }
    };
    const armStallRescue = () => {
      if (stallRescueTimer !== null) clearTimeout(stallRescueTimer);
      stallRescueTimer = setTimeout(() => {
        // Server went quiet for too long — bring the rotation back so
        // the visible label keeps moving until the next event (or end).
        startRotation();
      }, SERVER_STALL_RESCUE_MS);
    };
    const clearAll = () => {
      stopRotation();
      if (stallRescueTimer !== null) {
        clearTimeout(stallRescueTimer);
        stallRescueTimer = null;
      }
    };
    clearTimersRef.current = clearAll;
    startRotation();

    (async () => {
      try {
        // Wave 3.5: attach the regenerationBrief prop if present.
        // Null on the first generation so the body is byte-identical
        // to Wave 3 — regression-safe.
        const resp = await fetch("/api/ai-tools/script-builder-v2", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
          },
          body: JSON.stringify(
            regenerationBrief
              ? { planId, shootType, regenerationBrief }
              : { planId, shootType },
          ),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;

        // ── Pre-stream HTTP error path ────────────────────────────
        // Cost cap (402), auth (401), missing plan/lineage (404/409)
        // all bail out BEFORE the SSE stream opens. Surface them as
        // a clean error card — no partial pipeline state to unwind.
        if (!resp.ok || !resp.body) {
          let payload: { error?: string; message?: string } = {};
          try {
            payload = await resp.json();
          } catch {
            // Body wasn't JSON — keep payload empty.
          }
          if (ctrl.signal.aborted) return;
          clearAll();
          setError({
            kind: "http",
            status: resp.status,
            error: payload.error,
            message: payload.message,
          });
          thinking.stop();
          return;
        }

        // ── SSE stream consumer ──────────────────────────────────
        const reader = resp.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buf = "";
        let liveTokens = "";

        // Inline frame handler — keeps the parser/dispatch tight and
        // lets us `return` on the terminal events without unwinding
        // multiple loop levels with labelled breaks.
        //
        // Returns "done" for terminal events, "yield" for phase /
        // violation / reprompt events whose state changes the user
        // needs to SEE before the next frame mutates them, and
        // "continue" for token frames (cheap, append-only — yielding
        // on each would slow the live-preview update to a crawl).
        const handleFrame = (frame: string): "continue" | "yield" | "done" => {
          let evt = "message";
          const dataLines: string[] = [];
          for (const rawLine of frame.split("\n")) {
            const line = rawLine.replace(/\r$/, "");
            if (line.startsWith(":")) continue; // SSE comment / keep-alive
            if (line.startsWith("event:")) {
              evt = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              // Per SSE spec, the leading space after "data:" is
              // optional and should be stripped exactly once.
              const v = line.slice(5);
              dataLines.push(v.startsWith(" ") ? v.slice(1) : v);
            }
            // id: / retry: lines are ignored — not used by this route.
          }
          if (dataLines.length === 0) return "continue";
          let data: unknown;
          try {
            data = JSON.parse(dataLines.join("\n"));
          } catch {
            return "continue";
          }

          if (evt === "phase") {
            const d = data as { key?: string; label?: string };
            // Server label wins — kill the client rotation and arm a
            // watchdog so we restart it if the server then goes quiet.
            stopRotation();
            armStallRescue();
            if (typeof d.label === "string") setPhaseLabel(d.label);
            if (typeof d.key === "string") {
              const next = phaseKeyToPipeline(d.key);
              if (next) {
                // Full REPLACE — never accumulate. Critical on
                // `reprompt` where the previous attempt had moved
                // through `validate`; a partial update would leave
                // `validate=active` stuck through the next draft.
                thinking.resetSteps(next);
              }
              if (d.key === "reprompt") {
                setRepromptCount((c) => c + 1);
                // Drop the live preview — the next attempt is going
                // to stream a fresh draft; otherwise the user sees
                // them concatenated and panics.
                liveTokens = "";
                setLivePreview("");
              }
            }
            return "yield";
          } else if (evt === "token") {
            const d = data as { text?: string };
            if (typeof d.text === "string") {
              liveTokens += d.text;
              setLivePreview(liveTokens);
            }
          } else if (evt === "violation") {
            // Server already announces "reprompt" as the next phase;
            // nothing extra to render here. Keeping the branch so
            // future UI (e.g. inline rule chips) has a hook.
            return "yield";
          } else if (evt === "complete") {
            // ── Terminal success ──────────────────────────────
            // Write state BEFORE stop() (architect rule: terminal
            // writes precede the indicator hand-off). Flip ALL
            // three circles to complete — earlier we only flipped
            // `validate`, which left `load`/`draft` stuck on
            // whatever the last phase event said (often `active`
            // mid-draft if the server fast-pathed the final phase).
            const payload = data as Step5CompletePayload;
            clearAll();
            thinking.resetSteps(ALL_COMPLETE_PIPELINE);
            setDone(payload);
            thinking.stop();
            onCompleteRef.current(payload);
            return "done";
          } else if (evt === "error") {
            const d = data as {
              error?: string;
              message?: string;
              violations?: ScriptViolation[];
              metrics?: ScriptMetrics;
            };
            clearAll();
            setError({
              kind: "stream",
              error: d.error,
              message: d.message,
              violations: d.violations,
              metrics: d.metrics,
            });
            thinking.stop();
            return "done";
          }
          return "continue";
        };

        // Aborting the fetch above propagates into reader.read() —
        // we don't need a separate reader.cancel() in the cleanup
        // path. The single AbortController unwinds both ends.
        //
        // SSE frame delimiter per spec is one blank line, which the
        // wire can encode as either `\n\n` or `\r\n\r\n` (or any
        // mix). Normalising CRLF → LF in the buffer up-front lets
        // the rest of the parser stay simple, and CRLF that straddles
        // a chunk boundary (a stray `\r` at the tail) just sits in
        // `buf` until the next chunk completes it.
        while (true) {
          if (ctrl.signal.aborted) break;
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buf += decoder.decode(value, { stream: true });
          buf = buf.replace(/\r\n/g, "\n");
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (!frame) continue;
            if (ctrl.signal.aborted) return;
            const result = handleFrame(frame);
            if (result === "done") return;
            // Yield to the browser after every PHASE-CHANGING frame
            // (phase / violation) so React can commit the queued state
            // before the next frame overwrites it.
            //
            // Replit's preview proxy (and Next dev's Turbopack pipeline)
            // sometimes buffer SSE responses and hand the client every
            // frame in one `reader.read()` payload. Without a yield, the
            // synchronous frame loop fires every `setPhaseLabel` /
            // `thinking.resetSteps` call inside a single microtask;
            // React 18 batches them all and only the FINAL state paints
            // — which is the `complete` event. The pipeline circles and
            // status text never appear to update mid-stream even though
            // every event arrived.
            //
            // A 0ms timeout (a macrotask, not a microtask) gives React
            // a chance to flush the commit phase before the next setter
            // runs. Token frames don't yield — they append to liveTokens
            // and would slow live-preview throughput to a crawl. When
            // frames really do arrive one-per-chunk over the wire (the
            // happy path), the yield is a ~0.1ms no-op; on a buffered
            // chunk with 4-6 phase emits, the user sees the pipeline
            // actually progress instead of jumping straight to done.
            if (result === "yield") {
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
              if (ctrl.signal.aborted) return;
            }
          }
        }
        // Stream closed without a terminal event. Could be:
        //   - StrictMode cleanup aborted us (next mount owns the UI)
        //   - User clicked Stop (handled in handleStop — state set there)
        //   - Server closed early without emitting complete/error
        // Only the last case needs us to surface anything here.
        if (!ctrl.signal.aborted) {
          clearAll();
          setError({
            kind: "stream",
            error: "stream_closed_early",
            message:
              "The script generator closed the connection before finishing. Try again.",
          });
          thinking.stop();
        }
      } catch (e) {
        // AbortError on the fetch or reader = clean cancellation;
        // do NOT touch UI state (architect rule: cleanup never
        // races with the next mount's start()).
        if (ctrl.signal.aborted || (e as Error).name === "AbortError") return;
        clearAll();
        setError({ kind: "network", message: (e as Error).message });
        thinking.stop();
      }
    })();

    return () => {
      clearAll();
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, shootType, regenerationBrief]);

  const handleStop = useCallback(() => {
    // User-initiated cancellation — distinct from the cleanup-path
    // abort because we DO want to update the UI here. Tear down the
    // rotation + stall-rescue timers BEFORE abort so they don't tick
    // one more frame and overwrite phaseLabel after the stop view
    // takes over.
    const c = abortRef.current;
    if (!c || c.signal.aborted) return;
    clearTimersRef.current?.();
    c.abort();
    setUserStopped(true);
    thinking.stop();
  }, [thinking]);

  // ── Render: error ─────────────────────────────────────────────
  if (error) return <ErrorView error={error} onBack={onBack} />;

  // ── Render: user stopped ──────────────────────────────────────
  if (userStopped && !done) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Generation stopped.
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          You stopped the script before it finished. You weren&apos;t billed
          for tokens beyond what had already streamed.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Render: done (parent owns Approve & Save + Smart Regenerate) ─
  if (done) {
    return <DoneView done={done} onBack={onBack} />;
  }

  // ── Render: live streaming ────────────────────────────────────
  // The streaming branch is reached when !done && !error && !userStopped,
  // i.e. exactly when the indeterminate progress bar should be visible —
  // no separate guard needed here.
  return (
    <div className="space-y-5">
      <AiThinking
        mode="pipeline"
        stages={thinking.steps}
        detailLine={phaseLabel}
      />
      {repromptCount > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Re-prompt {repromptCount}/2 in flight — earlier draft hit a
          content-rule check; the model is rewriting from scratch.
        </p>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        A full 12–16 min script takes ~60–120 seconds to stream. Don&apos;t
        navigate away.
      </p>

      {livePreview.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-700">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Live draft
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {livePreview.length.toLocaleString()} chars
            </p>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed text-gray-800 dark:text-gray-200">
            {livePreview}
          </pre>
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleStop}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Stop
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────

function DoneView({
  done,
  onBack,
}: {
  done: Step5CompletePayload;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/30">
        <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
          Script ready
          {done.attempt > 0 &&
            ` (passed on attempt ${done.attempt + 1} after ${done.attempt} re-prompt${done.attempt === 1 ? "" : "s"})`}
          .
        </p>
        <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
          {done.metrics.dialogueWordCount.toLocaleString()} dialogue words ·{" "}
          {done.metrics.anchoredDetailCount} anchored details (
          {done.metrics.anchoredDetailsPer120Words.toFixed(2)} per 120 words)
          {" · "}${done.monthSpendUsd.toFixed(2)} of ${done.capUsd.toFixed(2)}
          {" "}month-to-date.
        </p>
        {done.softWarning && (
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            You&apos;ve crossed your soft-warning cost threshold. The hard cap
            still has room.
          </p>
        )}
      </div>

      {done.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
            Soft warnings ({done.warnings.length})
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-900 dark:text-amber-100">
            {done.warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono">{w.rule}</span> — {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {done.planWarnings && done.planWarnings.length > 0 && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 p-4 dark:border-sky-700 dark:bg-sky-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-200">
            Planner assignments
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-sky-900 dark:text-sky-100">
            {done.planWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-700">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Draft script
          </p>
        </div>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed text-gray-800 dark:text-gray-200">
          {done.script}
        </pre>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ← Back
        </button>
        {/* Approve & Save + Smart Regenerate live in the parent wizard. */}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Wave 3.5 — Smart Regenerate panel
// ───────────────────────────────────────────────────────────────────────

/**
 * Renders below the generated script in the done state. On mount,
 * fires `POST /api/ai-tools/script-builder-v2/suggest-improvements`
 * (background fetch, AbortController, terminal-state cleanup matching
 * Step3IdeaCards) and surfaces 5 categorized improvement suggestions.
 *
 * Member multi-selects suggestions + types optional free-form notes,
 * then clicks "Regenerate with notes" — which calls onRegenerate(brief)
 * on the parent, triggering a fresh streaming generation with the
 * brief attached. The parent's regenerationNonce bump unmounts this
 * panel (done state clears) and the streaming UI takes over again.
 *
 * AbortController pattern (per feedback_cancelled_flag_finally_race.md):
 *   - The cleanup function aborts the controller, full stop.
 *   - No `cancelled` flag gates terminal state writes — the catch
 *     branch's `ctrl.signal.aborted` check is the source of truth.
 *   - State writes happen BEFORE the indicator stops so the UI
 *     hand-off is atomic.
 */
export function SmartRegeneratePanel({
  planId,
  script,
  onRegenerate,
}: {
  planId: string;
  script: string;
  onRegenerate: (brief: RegenerationBrief) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setSelectedIds(new Set());
    setExpandedId(null);

    (async () => {
      try {
        const resp = await fetch(
          "/api/ai-tools/script-builder-v2/suggest-improvements",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ planId, script }),
            signal: ctrl.signal,
          },
        );
        if (ctrl.signal.aborted) return;
        if (!resp.ok) {
          let msg = "Couldn't load improvement suggestions.";
          try {
            const j = (await resp.json()) as { message?: string; error?: string };
            msg = j.message ?? j.error ?? msg;
          } catch {
            // body wasn't JSON
          }
          if (ctrl.signal.aborted) return;
          setError(msg);
          setLoading(false);
          return;
        }
        const data = (await resp.json()) as SuggestImprovementsResponse;
        if (ctrl.signal.aborted) return;
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        setLoading(false);
      } catch (e) {
        if (ctrl.signal.aborted || (e as Error).name === "AbortError") return;
        setError((e as Error).message ?? "Network error.");
        setLoading(false);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [planId, script]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const trimmedNotes = notes.trim();
  const notesTooShort =
    trimmedNotes.length > 0 && trimmedNotes.length < 10;
  const notesTooLong = trimmedNotes.length > 500;
  const canRegenerate =
    (selectedIds.size > 0 || (trimmedNotes.length >= 10 && !notesTooLong)) &&
    !notesTooShort &&
    !notesTooLong;

  const handleClick = useCallback(() => {
    if (!canRegenerate) return;
    const selected = suggestions
      .filter((s) => selectedIds.has(s.id))
      .map((s) => ({
        category: s.category,
        title: s.title,
        regenerationDirective: s.regenerationDirective,
      }));
    onRegenerate({
      selectedSuggestions: selected,
      customNotes: trimmedNotes,
      priorScript: script,
    });
  }, [canRegenerate, onRegenerate, script, selectedIds, suggestions, trimmedNotes]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        Improve this script
      </p>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
        Pick targeted improvements + add notes, then regenerate. The new
        draft will address your selections specifically — not just re-roll
        with the same prompt.
      </p>

      {loading && (
        <p className="mt-4 text-sm italic text-gray-600 dark:text-gray-400">
          Analysing your script for improvement opportunities…
        </p>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-700 dark:text-red-300">
          {error} You can still add a free-form note below and regenerate.
        </p>
      )}

      {!loading && !error && suggestions.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {suggestions.map((s) => {
            const isSelected = selectedIds.has(s.id);
            const isExpanded = expandedId === s.id;
            const meta = SUGGESTION_CATEGORY_META[s.category];
            return (
              <div
                key={s.id}
                className={`rounded-md border text-left transition-colors ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30"
                    : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40"
                }`}
              >
                <div className="flex items-start gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    className="flex-1 text-left"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {meta.icon} {meta.label}
                    </p>
                    <p
                      className={`mt-1 text-sm font-medium ${
                        isSelected
                          ? "text-emerald-900 dark:text-emerald-100"
                          : "text-gray-900 dark:text-gray-100"
                      }`}
                    >
                      {s.title}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId((cur) => (cur === s.id ? null : s.id))
                    }
                    aria-label={isExpanded ? "Hide details" : "Show details"}
                    className="rounded-full px-2 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  >
                    ⓘ
                  </button>
                </div>
                {isExpanded && (
                  <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-300">
                    {s.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5">
        <label
          htmlFor="smart-regen-notes"
          className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400"
        >
          Other notes (optional)
        </label>
        <textarea
          id="smart-regen-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. 'make the intro punchier', 'remove the grocery store metaphor', 'add a relocator angle in section 2'"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {trimmedNotes.length}/500 characters
          {notesTooShort && (
            <span className="ml-2 text-amber-700 dark:text-amber-300">
              Add at least 10 characters or clear the field.
            </span>
          )}
          {notesTooLong && (
            <span className="ml-2 text-red-700 dark:text-red-300">
              Trim below 500 characters.
            </span>
          )}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {!canRegenerate && !notesTooShort && !notesTooLong && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Select at least one suggestion or add a note to regenerate.
          </p>
        )}
        <button
          type="button"
          disabled={!canRegenerate}
          onClick={handleClick}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white dark:disabled:bg-gray-700 dark:disabled:text-gray-500"
        >
          Regenerate with notes
        </button>
      </div>

      <p className="mt-2 text-right text-[11px] text-gray-500 dark:text-gray-400">
        Each regeneration ≈ $0.30–0.50 in AI cost. Suggestions ≈ $0.05.
      </p>
    </div>
  );
}

function ErrorView({
  error,
  onBack,
}: {
  error: StreamError;
  onBack: () => void;
}) {
  const isCostCap =
    error.kind === "http" &&
    (error.status === 402 || error.error === "monthly_cost_cap_reached");
  const isValidationGate =
    error.kind === "stream" && error.error === "validation_gate_failed";

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-6 dark:border-red-700 dark:bg-red-950/40">
      <p className="text-sm font-medium text-red-900 dark:text-red-100">
        {isCostCap
          ? "Monthly AI budget reached"
          : isValidationGate
            ? "Couldn't pass content rules"
            : "Couldn't generate the script"}
      </p>
      <p className="mt-2 text-sm text-red-800 dark:text-red-200">
        {error.message ?? error.error ?? "Unknown error."}
      </p>

      {isValidationGate && error.violations && error.violations.length > 0 && (
        <details className="mt-3 text-xs text-red-900 dark:text-red-100">
          <summary className="cursor-pointer font-semibold">
            {error.violations.length} rule violation(s)
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {error.violations.map((v, i) => (
              <li key={i}>
                <span className="font-mono">{v.rule}</span> ({v.severity}) —{" "}
                {v.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-800 hover:bg-red-100 dark:border-red-700 dark:text-red-100 dark:hover:bg-red-900/40"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
