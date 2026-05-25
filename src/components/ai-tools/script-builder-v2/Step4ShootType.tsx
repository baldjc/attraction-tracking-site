"use client";

/**
 * Wave 3 — Script Builder v2 wizard, Step 4: Shoot type confirm.
 *
 * Last step before the streaming generator (Step 5). Shows a compact
 * summary of the ContentPlan that's about to be turned into a script,
 * then asks the user to confirm the shoot type. Wave 3 ships Talking
 * Head only; Home Tour is rendered as a disabled "Coming in Wave 4"
 * card so the IA is visible but unselectable.
 *
 * Pure presentational — no fetches, no streaming, no side effects.
 * The parent wizard owns plan loading and the handoff to Step 5.
 *
 * Server-side, /api/ai-tools/script-builder-v2 rejects any shoot type
 * other than "talking_head" with `unsupported_shoot_type` (HTTP 400 —
 * the route guards before the stream opens). This card mirrors that
 * constraint client-side so the user never picks something the server
 * will reject.
 */
import Link from "next/link";
import { useState } from "react";
import { ROTATION_SLOT_LABELS } from "@/lib/content-engine-validation";

export type ShootType = "talking_head" | "home_tour";

export interface Step4PlanSummary {
  id: string;
  title: string;
  rotationSlot: string;
  titlePromise: string;
  visualPeak: string | null;
  thumbnailCallouts: string[];
  linkedFactCount: number;
  estimatedRuntime: string | null;
}

interface Props {
  plan: Step4PlanSummary;
  /** Where the "← Back" link goes (typically Step 3 of the v2 wizard). */
  backHref: string;
  /**
   * Fired when the user clicks Continue. The parent advances to Step 5
   * and opens the SSE stream with this shoot type.
   */
  onConfirm: (shootType: ShootType) => void;
  /**
   * Disables the Continue button while the parent is transitioning to
   * Step 5 (e.g. pre-flight cost-cap check, opening EventSource).
   * Optional — defaults to false.
   */
  submitting?: boolean;
}

export function Step4ShootType({
  plan,
  backHref,
  onConfirm,
  submitting = false,
}: Props) {
  const [selected, setSelected] = useState<ShootType>("talking_head");
  const rotationLabel =
    ROTATION_SLOT_LABELS[
      plan.rotationSlot as keyof typeof ROTATION_SLOT_LABELS
    ] ?? plan.rotationSlot;

  return (
    <div className="space-y-6">
      {/* ── Plan summary card ─────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Scripting this plan
        </p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {plan.title}
          </h2>
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {rotationLabel}
          </span>
        </div>
        <p className="mt-2 text-sm italic text-gray-600 dark:text-gray-400">
          {plan.titlePromise}
        </p>

        {plan.visualPeak && (
          <SummaryField label="Visual peak">{plan.visualPeak}</SummaryField>
        )}
        {plan.estimatedRuntime && (
          <SummaryField label="Estimated runtime">
            {plan.estimatedRuntime}
          </SummaryField>
        )}

        {plan.thumbnailCallouts.length > 0 && (
          <>
            <p className="mt-4 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Thumbnail callouts
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {plan.thumbnailCallouts.map((t, i) => (
                <span
                  key={i}
                  className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200"
                >
                  {t}
                </span>
              ))}
            </div>
          </>
        )}

        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          {plan.linkedFactCount} linked fact{plan.linkedFactCount === 1 ? "" : "s"} will
          be cited verbatim in the script.
        </p>
      </div>

      {/* ── Shoot type picker ─────────────────────────────────────── */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          How are you shooting this?
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          The shoot type changes how the script's beats, pacing, and B-roll
          callouts are written.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ShootTypeCard
            value="talking_head"
            selected={selected === "talking_head"}
            disabled={false}
            onSelect={setSelected}
            icon="🎙️"
            title="Talking Head"
            description="On-camera to your audience. FACT → CLARITY arc with a 3-beat intro, data → psychology → clarity body, and a next-video hook."
          />
          <ShootTypeCard
            value="home_tour"
            selected={false}
            disabled
            onSelect={setSelected}
            icon="🏠"
            title="Home Tour"
            description="Walk-through commentary tied to specific listings."
            badge="Coming in Wave 4"
          />
        </div>
      </div>

      {/* ── Footer actions ────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-gray-200 pt-6 dark:border-gray-700">
        <Link
          href={backHref}
          className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ← Back
        </Link>
        <button
          type="button"
          onClick={() => onConfirm(selected)}
          disabled={submitting}
          className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Continue → write the script"}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────

function SummaryField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300">{children}</p>
    </div>
  );
}

function ShootTypeCard({
  value,
  selected,
  disabled,
  onSelect,
  icon,
  title,
  description,
  badge,
}: {
  value: ShootType;
  selected: boolean;
  disabled: boolean;
  onSelect: (v: ShootType) => void;
  icon: string;
  title: string;
  description: string;
  badge?: string;
}) {
  const base =
    "group flex flex-col rounded-lg border p-5 text-left transition";
  const enabledStyles = selected
    ? "border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-950/30"
    : "border-gray-200 bg-white hover:border-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500";
  const disabledStyles =
    "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed dark:border-gray-700 dark:bg-gray-900/40";

  return (
    <button
      type="button"
      onClick={() => !disabled && onSelect(value)}
      disabled={disabled}
      aria-pressed={selected}
      className={`${base} ${disabled ? disabledStyles : enabledStyles}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-2xl">{icon}</div>
        {badge && (
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            {badge}
          </span>
        )}
        {!badge && selected && (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Selected
          </span>
        )}
      </div>
      <h4 className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h4>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {description}
      </p>
    </button>
  );
}
