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
  type Step5CompletePayload,
} from "@/components/ai-tools/script-builder-v2/Step5GenerateStream";

type Stage = "pick_shoot_type" | "streaming" | "approve";

interface Props {
  planSummary: Step4PlanSummary;
  backHref: string;
}

interface SaveError {
  message: string;
  code?: string;
}

export function ScriptWizardClient({ planSummary, backHref }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("pick_shoot_type");
  const [shootType, setShootType] = useState<ShootType>("talking_head");
  const [result, setResult] = useState<Step5CompletePayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);

  if (stage === "pick_shoot_type") {
    return (
      <Step4ShootType
        plan={planSummary}
        backHref={backHref}
        onConfirm={(st) => {
          setShootType(st);
          setStage("streaming");
        }}
      />
    );
  }

  if (stage === "streaming") {
    return (
      <Step5GenerateStream
        planId={planSummary.id}
        shootType={shootType}
        onBack={() => setStage("pick_shoot_type")}
        onComplete={(payload) => {
          setResult(payload);
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
      </div>

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
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Approve & save to plan"}
        </button>
      </div>
    </div>
  );
}
