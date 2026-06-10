"use client";

// "How we calculate your stats" — member-facing metric methodology settings.
//
// Lets a member pick how their derived market stats are framed via three named
// presets (Default / Strict / Smoothed) or a Custom panel of five choices, with
// live preview numbers computed from their most-recent upload (no AI, no
// recompute on switch — every variant's number is fetched once). Saving only
// records the choice; a footer disclosure offers an explicit, cost-estimated
// "re-validate my last 3 months" action to apply it retroactively.
//
// The member layout mounts no ToastProvider, so the default export wraps the
// inner component in its own provider.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";
import { ToastProvider, useToast } from "@/components/ToastProvider";
import { formatActionImpactPercent } from "@/lib/cost-display";
import {
  DEFAULT_METHODOLOGY,
  PRESETS,
  SAMPLE_FLOORS,
  detectPreset,
  settingsEqual,
  type MemberMethodologySettings,
  type PresetName,
  type MoiVariant,
  type DomVariant,
  type FailureRateVariant,
  type SalePriceVariant,
  type SampleSizeVariant,
} from "@/lib/member-metric-settings";
import type { MethodologyPreview } from "@/lib/methodology-preview";

// ── Display copy ──────────────────────────────────────────────────────────────

const PRESET_LABELS: Record<Exclude<PresetName, "custom">, string> = {
  default: "Default",
  strict: "Strict",
  smoothed: "Smoothed",
};

const PRESET_BLURBS: Record<Exclude<PresetName, "custom">, string> = {
  default: "Our standard, balanced calculations. Recommended for most members.",
  strict: "Tighter sample floors and the most conservative framing of each metric.",
  smoothed: "Trailing averages and broader samples to even out month-to-month noise.",
};

const MOI_LABELS: Record<MoiVariant, string> = {
  active_plus_pending_single: "Active + Pending listings (single month)",
  active_only_single: "Active listings only (single month)",
  active_plus_pending_rolling3: "Active + Pending vs. 3-month average sales",
};

const DOM_LABELS: Record<DomVariant, string> = {
  average: "Average days on market",
  median: "Median days on market",
  both: "Show both median and average",
};

const FAILURE_LABELS: Record<FailureRateVariant, string> = {
  all_off_market: "All off-market listings (expired + withdrawn + terminated)",
  expired_only: "Expired listings only",
  expired_plus_withdrawn: "Expired + withdrawn listings",
  disabled: "Don't calculate failure rate",
};

const SALE_PRICE_LABELS: Record<SalePriceVariant, string> = {
  median: "Median sale price",
  average: "Average sale price",
  benchmark: "Benchmark / HPI price (falls back to median when unavailable)",
};

const SAMPLE_LABELS: Record<SampleSizeVariant, string> = {
  conservative: "Conservative",
  permissive: "Permissive",
  strict: "Strict",
};

// ── Number formatting ─────────────────────────────────────────────────────────

const months = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} mo`);
const days = (v: number | null) => (v == null ? "—" : `${Math.round(v)} days`);
const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);
const usd = (v: number | null) =>
  v == null
    ? "—"
    : `$${Math.round(v).toLocaleString("en-US")}`;

// ── Small building blocks ─────────────────────────────────────────────────────

function RadioCard({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-[#111a26]">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h4>
      <p className="mt-0.5 mb-3 text-xs text-gray-500 dark:text-gray-400">{help}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function RadioRow({
  name,
  checked,
  onChange,
  label,
  preview,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  preview?: string;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 cursor-pointer border transition-colors ${
        checked
          ? "border-[var(--abv-azure)] bg-[var(--abv-azure)]/10"
          : "border-transparent hover:bg-gray-50 dark:hover:bg-white/5"
      }`}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          className="accent-[var(--abv-azure)] shrink-0"
        />
        <span className="text-sm text-gray-700 dark:text-gray-200 truncate">
          {label}
        </span>
      </span>
      {preview != null && (
        <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100 shrink-0">
          {preview}
        </span>
      )}
    </label>
  );
}

// ── Inner component ───────────────────────────────────────────────────────────

interface RevalidateEstimate {
  hasUploads: boolean;
  uploadCount: number;
  factCount: number;
  estimateUsd: number;
  remainingUsd: number;
  capUsd: number;
  monthSpendUsd: number;
  overBudget: boolean;
  unlimited?: boolean;
}

function MethodologySettingsInner() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<MemberMethodologySettings>(DEFAULT_METHODOLOGY);
  const [draft, setDraft] = useState<MemberMethodologySettings>(DEFAULT_METHODOLOGY);
  const [preview, setPreview] = useState<MethodologyPreview | null>(null);
  const [hasUpload, setHasUpload] = useState(true);
  const [estimate, setEstimate] = useState<RevalidateEstimate | null>(null);
  const [saving, setSaving] = useState(false);
  const [revalidating, setRevalidating] = useState(false);

  const loadEstimate = useCallback(async () => {
    try {
      const res = await fetch("/api/member/methodology-revalidate");
      if (res.ok) setEstimate((await res.json()) as RevalidateEstimate);
    } catch {
      /* non-fatal: the button just stays in its default state */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sRes, pRes] = await Promise.all([
          fetch("/api/member/methodology-settings"),
          fetch("/api/member/methodology-preview"),
        ]);
        if (cancelled) return;
        if (sRes.ok) {
          const data = (await sRes.json()) as { settings: MemberMethodologySettings };
          setSaved(data.settings);
          setDraft(data.settings);
        }
        if (pRes.status === 204) {
          setHasUpload(false);
        } else if (pRes.ok) {
          setPreview((await pRes.json()) as MethodologyPreview);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    void loadEstimate();
    return () => {
      cancelled = true;
    };
  }, [loadEstimate]);

  const activePreset = useMemo(() => detectPreset(draft), [draft]);
  const dirty = useMemo(() => !settingsEqual(draft, saved), [draft, saved]);

  const set = <K extends keyof MemberMethodologySettings>(
    key: K,
    value: MemberMethodologySettings[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const applyPreset = (name: Exclude<PresetName, "custom">) =>
    setDraft({ ...PRESETS[name] });

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/member/methodology-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { settings: MemberMethodologySettings };
      setSaved(data.settings);
      setDraft(data.settings);
      toast.success("Methodology saved. New uploads will use it automatically.");
      void loadEstimate();
    } catch {
      toast.error("Couldn't save your methodology. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setDraft({ ...DEFAULT_METHODOLOGY });

  const handleRevalidate = async () => {
    setRevalidating(true);
    try {
      const res = await fetch("/api/member/methodology-revalidate", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202 && data.ok) {
        toast.success(
          `Re-validating your last ${data.queued} upload${data.queued === 1 ? "" : "s"} under the new methodology. This runs in the background.`,
        );
        void loadEstimate();
      } else if (data.reason === "no_uploads") {
        toast.info(data.message ?? "No uploads to re-validate yet.");
      } else if (res.status === 402) {
        toast.error(data.message ?? "Re-validation would exceed your monthly budget.");
      } else {
        toast.error("Re-validation couldn't be started. Please try again.");
      }
    } catch {
      toast.error("Re-validation couldn't be started. Please try again.");
    } finally {
      setRevalidating(false);
    }
  };

  const revalDisabled =
    revalidating || !estimate || !estimate.hasUploads || estimate.overBudget;
  const revalTooltip = !estimate
    ? "Checking your re-validation budget…"
    : !estimate.hasUploads
      ? "You have no validated uploads to re-validate yet."
      : estimate.overBudget
        ? `Re-validating ~${estimate.factCount} facts (${formatActionImpactPercent(estimate.estimateUsd, estimate.capUsd)} of your monthly allowance) would exceed what's left this month.`
        : estimate.unlimited
          ? `Re-runs your last ${estimate.uploadCount} upload${estimate.uploadCount === 1 ? "" : "s"} (~${estimate.factCount} facts). Unlimited usage on your plan.`
          : `Re-runs your last ${estimate.uploadCount} upload${estimate.uploadCount === 1 ? "" : "s"} (~${estimate.factCount} facts, ${formatActionImpactPercent(estimate.estimateUsd, estimate.capUsd)} of your monthly allowance).`;

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0f1722] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            How we calculate your stats
          </h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Choose how your derived market metrics are computed.{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Currently: {activePreset === "custom" ? "Custom" : PRESET_LABELS[activePreset]}
            </span>
          </p>
        </div>
        {open ? (
          <ChevronUpIcon className="w-5 h-5 text-gray-400 shrink-0" />
        ) : (
          <ChevronDownIcon className="w-5 h-5 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-5 pb-6 border-t border-gray-100 dark:border-gray-800 pt-5 space-y-6">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : (
            <>
              {!hasUpload && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                  Upload a market report to see live preview numbers for each
                  option. You can still choose your methodology now — it applies to
                  your next upload automatically.
                </div>
              )}

              {/* Preset comparison */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Quick presets
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["default", "strict", "smoothed"] as const).map((name) => {
                    const isActive = activePreset === name;
                    return (
                      <div
                        key={name}
                        className={`rounded-xl border p-4 flex flex-col ${
                          isActive
                            ? "border-[var(--abv-azure)] bg-[var(--abv-azure)]/5"
                            : "border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {PRESET_LABELS[name]}
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--abv-azure)]">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="mt-1 mb-3 text-xs text-gray-500 dark:text-gray-400 flex-1">
                          {PRESET_BLURBS[name]}
                        </p>
                        <Button
                          variant={isActive ? "accent" : "outline"}
                          size="sm"
                          onClick={() => applyPreset(name)}
                          disabled={isActive}
                        >
                          {isActive ? "Selected" : "Select"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom panel */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Customize{" "}
                  {activePreset === "custom" && (
                    <span className="text-xs font-normal text-[var(--abv-azure)]">
                      (Custom)
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Numbers show what each option produces for your most recent
                  upload. Changing any choice switches you to a Custom setup.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <RadioCard
                    title="Months of inventory"
                    help="How we measure supply vs. demand."
                  >
                    {(Object.keys(MOI_LABELS) as MoiVariant[]).map((v) => (
                      <RadioRow
                        key={v}
                        name="moi"
                        checked={draft.moiVariant === v}
                        onChange={() => set("moiVariant", v)}
                        label={MOI_LABELS[v]}
                        preview={preview ? months(preview.moi[v]) : undefined}
                      />
                    ))}
                  </RadioCard>

                  <RadioCard
                    title="Days on market"
                    help="How we summarize time-to-sell."
                  >
                    {(Object.keys(DOM_LABELS) as DomVariant[]).map((v) => (
                      <RadioRow
                        key={v}
                        name="dom"
                        checked={draft.domVariant === v}
                        onChange={() => set("domVariant", v)}
                        label={DOM_LABELS[v]}
                        preview={
                          !preview
                            ? undefined
                            : v === "both"
                              ? `${days(preview.dom.median)} / ${days(preview.dom.average)}`
                              : days(preview.dom[v])
                        }
                      />
                    ))}
                  </RadioCard>

                  <RadioCard
                    title="Listing failure rate"
                    help="Share of listings that come off-market without selling."
                  >
                    {(Object.keys(FAILURE_LABELS) as FailureRateVariant[]).map((v) => (
                      <RadioRow
                        key={v}
                        name="failure"
                        checked={draft.failureRateVariant === v}
                        onChange={() => set("failureRateVariant", v)}
                        label={FAILURE_LABELS[v]}
                        preview={
                          !preview || v === "disabled"
                            ? undefined
                            : pct(preview.failureRate[v])
                        }
                      />
                    ))}
                  </RadioCard>

                  <RadioCard
                    title="Sale price"
                    help="Which price measure headlines your stats."
                  >
                    {(Object.keys(SALE_PRICE_LABELS) as SalePriceVariant[]).map((v) => (
                      <RadioRow
                        key={v}
                        name="salePrice"
                        checked={draft.salePriceVariant === v}
                        onChange={() => set("salePriceVariant", v)}
                        label={SALE_PRICE_LABELS[v]}
                        preview={preview ? usd(preview.salePrice[v]) : undefined}
                      />
                    ))}
                  </RadioCard>

                  <RadioCard
                    title="Sample size floor"
                    help="How many sales a neighbourhood needs before we headline its stats."
                  >
                    {(Object.keys(SAMPLE_LABELS) as SampleSizeVariant[]).map((v) => {
                      const floor = SAMPLE_FLOORS[v];
                      return (
                        <RadioRow
                          key={v}
                          name="sampleSize"
                          checked={draft.sampleSizeVariant === v}
                          onChange={() => set("sampleSizeVariant", v)}
                          label={`${SAMPLE_LABELS[v]} (≥${floor.sold} sales)`}
                          preview={
                            preview
                              ? `${preview.sampleSize[v]} hood${preview.sampleSize[v] === 1 ? "" : "s"}`
                              : undefined
                          }
                        />
                      );
                    })}
                  </RadioCard>
                </div>
              </div>

              {/* Save / Reset */}
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleSave} disabled={!dirty || saving}>
                  {saving ? "Saving…" : "Save methodology"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleReset}
                  disabled={settingsEqual(draft, DEFAULT_METHODOLOGY)}
                >
                  Reset to Default
                </Button>
                {dirty && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Unsaved changes
                  </span>
                )}
              </div>

              {/* Footer disclosure + re-validate */}
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  What changes when you save
                </h4>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Saving updates how <strong>future</strong> uploads are calculated
                  and how scripts cite your stats. Reports you&apos;ve already
                  validated keep their current numbers until you re-validate them.
                </p>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <span title={revalTooltip} className="inline-flex">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRevalidate}
                      disabled={revalDisabled}
                    >
                      <ArrowPathIcon
                        className={`w-4 h-4 ${revalidating ? "animate-spin" : ""}`}
                      />
                      {revalidating ? "Starting…" : "Re-validate my last 3 months"}
                    </Button>
                  </span>
                  {estimate?.hasUploads && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ~{estimate.factCount} facts ·{" "}
                      {estimate.unlimited
                        ? "Unlimited usage on your plan"
                        : `${formatActionImpactPercent(estimate.estimateUsd, estimate.capUsd)} of allowance`}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function MethodologySettings() {
  return (
    <ToastProvider>
      <MethodologySettingsInner />
    </ToastProvider>
  );
}
