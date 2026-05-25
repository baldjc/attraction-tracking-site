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
}

const PIPELINE_LABELS = {
  load: "Load context",
  draft: "Draft script",
  validate: "Validate content rules",
} as const;

function buildPipeline(
  load: PipelineStep["status"],
  draft: PipelineStep["status"],
  validate: PipelineStep["status"],
): PipelineStep[] {
  return [
    { key: "load", label: PIPELINE_LABELS.load, status: load },
    { key: "draft", label: PIPELINE_LABELS.draft, status: draft },
    { key: "validate", label: PIPELINE_LABELS.validate, status: validate },
  ];
}

const INITIAL_PIPELINE: PipelineStep[] = buildPipeline(
  "pending",
  "pending",
  "pending",
);

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
      return buildPipeline("active", "pending", "pending");
    case "intro":
    case "body":
    case "hook":
    case "reprompt":
      return buildPipeline("complete", "active", "pending");
    case "validate":
      return buildPipeline("complete", "complete", "active");
    default:
      return null;
  }
}

export function Step5GenerateStream({
  planId,
  shootType,
  onBack,
  onComplete,
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
    setPhaseLabel("Connecting to the script generator…");
    thinking.resetSteps(INITIAL_PIPELINE);
    thinking.start();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        const resp = await fetch("/api/ai-tools/script-builder-v2", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
          },
          body: JSON.stringify({ planId, shootType }),
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
        const handleFrame = (frame: string): "continue" | "done" => {
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
          } else if (evt === "complete") {
            // ── Terminal success ──────────────────────────────
            // Write state BEFORE stop() (architect rule: terminal
            // writes precede the indicator hand-off).
            const payload = data as Step5CompletePayload;
            thinking.updateStep("validate", "complete");
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
            if (handleFrame(frame) === "done") return;
          }
        }
        // Stream closed without a terminal event. Could be:
        //   - StrictMode cleanup aborted us (next mount owns the UI)
        //   - User clicked Stop (handled in handleStop — state set there)
        //   - Server closed early without emitting complete/error
        // Only the last case needs us to surface anything here.
        if (!ctrl.signal.aborted) {
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
        setError({ kind: "network", message: (e as Error).message });
        thinking.stop();
      }
    })();

    return () => {
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, shootType]);

  const handleStop = useCallback(() => {
    // User-initiated cancellation — distinct from the cleanup-path
    // abort because we DO want to update the UI here.
    const c = abortRef.current;
    if (!c || c.signal.aborted) return;
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

  // ── Render: done (parent owns Approve & Save in commit 6) ─────
  if (done) {
    return <DoneView done={done} onBack={onBack} />;
  }

  // ── Render: live streaming ────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <AiThinking mode="pipeline" steps={thinking.steps} />
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          {phaseLabel}
        </p>
        {repromptCount > 0 && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Re-prompt {repromptCount}/2 in flight — earlier draft hit a
            content-rule check; the model is rewriting from scratch.
          </p>
        )}
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          A full 12–16 min script takes ~60–120 seconds to stream. Don&apos;t
          navigate away.
        </p>
      </div>

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
        {/* Approve & Save lands in commit 6 — parent wizard owns it. */}
      </div>
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
