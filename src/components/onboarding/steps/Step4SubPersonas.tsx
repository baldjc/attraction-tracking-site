"use client";

import { useEffect, useState } from "react";
import { StepFooter, StepHeader, WhyBlock, type StepProps } from "./_shared";

const OPTIONS = [
  "First-time buyer",
  "Relocator (from another province/country)",
  "Move-up family",
  "Move-down / downsizer",
  "Investor",
  "Empty-nester",
  "Snowbird",
  "Newcomer to Canada",
  "Multi-generational household",
];

/**
 * Step 4 — Sub-personas. Picks 3-4 from a preset list. Saves to
 * MarketConfig.subPersonas as an array of strings via the config PATCH.
 */
export default function Step4SubPersonas({ onContinue, onSkip, stepLabel }: StepProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from existing config if available.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/member/market-data/config");
        if (!res.ok) return;
        const data = await res.json();
        const existing = data?.config?.subPersonas;
        if (!cancelled && Array.isArray(existing)) {
          const names = existing
            .map((p: unknown) =>
              typeof p === "string" ? p : (p as { label?: string })?.label,
            )
            .filter((s): s is string => !!s && OPTIONS.includes(s));
          setSelected(new Set(names));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(option: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(option)) {
        next.delete(option);
      } else if (next.size < 4) {
        next.add(option);
      }
      return next;
    });
  }

  const inRange = selected.size >= 3 && selected.size <= 4;

  async function save() {
    setError(null);
    if (!inRange) {
      setError("Pick between 3 and 4 sub-personas.");
      return;
    }
    setSaving(true);
    try {
      const payload = Array.from(selected).map((label) => ({ label }));
      const res = await fetch("/api/member/market-data/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subPersonas: payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not save sub-personas.");
      }
      await onContinue();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <StepHeader
        label={stepLabel ? `${stepLabel} — Who else watches` : "Who else watches"}
        title="Who else watches"
        subtitle="The people who aren't your main viewer but still show up."
      />
      <WhyBlock>
        Your main avatar is the spine. Sub-personas are the texture. Together
        they let scripts speak to one person while naming three or four.
        Without them, you sound like you&rsquo;re only talking to one slice of
        your audience.
      </WhyBlock>

      <p className="text-sm text-gray-700 dark:text-gray-300">
        Pick <strong>3-4</strong> secondary viewer types from the list.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const checked = selected.has(opt);
          const disabled = !checked && selected.size >= 4;
          return (
            <label
              key={opt}
              className={[
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
                checked
                  ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                  : "border-gray-200 bg-white text-gray-800 hover:border-gray-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:border-gray-600",
                disabled ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(opt)}
              />
              <span className="mt-0.5">{checked ? "✓" : "○"}</span>
              <span>{opt}</span>
            </label>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        {selected.size} of 3-4 selected
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <StepFooter
        time="2 minutes"
        primaryDisabled={!inRange || saving}
        primaryBusy={saving}
        onPrimary={() => void save()}
        onSkip={onSkip}
      />
    </div>
  );
}
