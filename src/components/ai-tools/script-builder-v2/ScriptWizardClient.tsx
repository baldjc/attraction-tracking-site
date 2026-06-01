"use client";

/**
 * Wave 3 — Script Builder v2 wizard client wrapper.
 *
 * Owns the multi-step flow state that the server page can't:
 *   - Step 4 (shoot type pick) → user confirms Talking Head
 *   - Step 5 (streaming generate) → user receives final script
 *   - Approve & Save → POST /api/member/content-plans/[id]/save-script
 *
 * All server-side gates (auth, flag, ownership, lineage) ran in the
 * parent page; this component trusts the planSummary it was handed.
 * The save endpoint re-runs everything as defense in depth.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Step4ShootType,
  type Step4PlanSummary,
  type ShootType,
} from "@/components/ai-tools/script-builder-v2/Step4ShootType";
import {
  Step5GenerateStream,
  SmartRegeneratePanel,
  type Step5CompletePayload,
  type RegenerationBrief,
} from "@/components/ai-tools/script-builder-v2/Step5GenerateStream";

type Stage = "pick_shoot_type" | "streaming" | "approve";

interface Props {
  planSummary: Step4PlanSummary;
  backHref: string;
  /**
   * Low Support state — the plan cleared the gate (≥1 fact) but is below the
   * recommended 3. Non-blocking: we still let the member generate, but surface
   * a banner so they know the script will be thinly anchored.
   */
  lowSupport?: boolean;
}

function LowSupportBanner({
  planId,
  count,
}: {
  planId: string;
  count: number;
}) {
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/15 dark:text-amber-200">
      <p className="font-semibold">Low Support — {count} linked fact{count === 1 ? "" : "s"}</p>
      <p className="mt-1">
        This plan is below the recommended 3 facts, so the script will be thinly
        anchored. You can still build it now, or{" "}
        <a
          href={`/member/content-planner/${planId}`}
          className="font-medium underline hover:no-underline"
        >
          link more facts first
        </a>{" "}
        for a stronger script.
      </p>
    </div>
  );
}

interface SaveError {
  message: string;
  code?: string;
}

export function ScriptWizardClient({
  planSummary,
  backHref,
  lowSupport = false,
}: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("pick_shoot_type");
  const [shootType, setShootType] = useState<ShootType>("talking_head");
  const [result, setResult] = useState<Step5CompletePayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  /**
   * Wave 3.5 — Smart Regenerate. When the member submits the panel
   * below the approved script, we stash the brief here, clear the
   * current result, and bounce back to the streaming stage. Step5's
   * effect dep list includes `regenerationBrief`, so the new prop
   * triggers a fresh stream that POSTs the brief along with the
   * standard request body. Cleared back to null when a new
   * generation completes so the next round's panel starts empty.
   */
  const [regenerationBrief, setRegenerationBrief] =
    useState<RegenerationBrief | null>(null);

  if (stage === "pick_shoot_type") {
    return (
      <>
        {lowSupport && (
          <LowSupportBanner
            planId={planSummary.id}
            count={planSummary.linkedFactCount}
          />
        )}
        <Step4ShootType
          plan={planSummary}
          backHref={backHref}
          onConfirm={(st) => {
            setShootType(st);
            setStage("streaming");
          }}
        />
      </>
    );
  }

  if (stage === "streaming") {
    return (
      <Step5GenerateStream
        planId={planSummary.id}
        shootType={shootType}
        regenerationBrief={regenerationBrief}
        onBack={() => {
          setRegenerationBrief(null);
          setStage("pick_shoot_type");
        }}
        onComplete={(payload) => {
          setResult(payload);
          // Clear the brief now that it's been consumed — the next
          // round of the regenerate panel should start with a fresh
          // empty selection / textarea state.
          setRegenerationBrief(null);
          setStage("approve");
        }}
      />
    );
  }

  // stage === "approve" — result is guaranteed non-null because the only
  // path into "approve" runs through Step5's onComplete.
  if (!result) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-300">
        Lost the generated script — please re-generate.
        <button
          type="button"
          onClick={() => setStage("streaming")}
          className="ml-3 text-blue-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/member/content-plans/${planSummary.id}/save-script`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script: result.script,
            // Informational only — the streaming route already billed
            // tokens; the save endpoint won't double-bill.
            tokenUsage: undefined,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        redirectUrl?: string;
      };
      if (!res.ok) {
        setSaveError({
          message:
            data.message ||
            data.error ||
            `Save failed (${res.status}) — try regenerating.`,
          code: data.error,
        });
        setSaving(false);
        return;
      }
      router.push(
        data.redirectUrl ||
          `/member/content-planner?plan=${planSummary.id}`,
      );
    } catch (err) {
      setSaveError({
        message:
          err instanceof Error
            ? err.message
            : "Network error saving the script — try again.",
      });
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-700/50 dark:bg-green-900/20 dark:text-green-200">
        Script generated and validated. Review below, then save to attach
        it to <strong>{planSummary.title}</strong>.
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Generated script
        </h2>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-900 dark:text-gray-100">
{result.script}
        </pre>
        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {result.metrics.dialogueWordCount} dialogue words ·{" "}
          {result.metrics.anchoredDetailCount} anchored details ·{" "}
          {result.metrics.anchoredDetailsPer120Words.toFixed(2)} per 120 words ·{" "}
          attempt {result.attempt + 1}
        </div>
        {result.warnings.length > 0 && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
            <strong>Soft warnings ({result.warnings.length}):</strong>
            <ul className="ml-4 mt-1 list-disc space-y-0.5">
              {result.warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}
        {result.planWarnings && result.planWarnings.length > 0 && (
          <div className="mt-3 rounded border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-700/50 dark:bg-sky-900/20 dark:text-sky-100">
            <strong>Planner assignments:</strong>
            <ul className="ml-4 mt-1 list-disc space-y-0.5">
              {result.planWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Wave 3.5 — Smart Regenerate. Surfacing it in the approve view
          (not inside Step5's DoneView) is intentional: Step5 unmounts
          as soon as onComplete fires, so the panel needs to live on
          the stage that actually persists after generation. */}
      <SmartRegeneratePanel
        planId={planSummary.id}
        script={result.script}
        onRegenerate={(brief) => {
          setRegenerationBrief(brief);
          setResult(null);
          setSaveError(null);
          setStage("streaming");
        }}
      />

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-300">
          {saveError.message}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setSaveError(null);
            setStage("streaming");
          }}
          disabled={saving}
          className="text-sm text-gray-600 hover:underline disabled:opacity-50 dark:text-gray-400"
        >
          ← Regenerate
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-[var(--abv-ink)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform duration-150 active:scale-[0.98] hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Approve & save to plan"}
        </button>
      </div>
    </div>
  );
}
