"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StepFooter, StepHeader, WhyBlock, type StepProps } from "./_shared";

interface TeamForm {
  years: string;
  families: string;
  transactions: string;
  size: string;
  notes: string;
}

const EMPTY: TeamForm = {
  years: "",
  families: "",
  transactions: "",
  size: "",
  notes: "",
};

function autoLineFor(transactions: number | null) {
  if (!transactions || transactions <= 0) return null;
  const hours = Math.round(8760 / transactions);
  return `Our team helps a family move every ${hours} hours.`;
}

/**
 * Step 5 — Team credentials with auto-calc.
 *
 * The signature-stat callout teaches the "a family every N hours" line. As the
 * member types into "Last full year's transactions", we live-preview the
 * computed line below the field AND auto-fill the credibility notes textarea —
 * but only while the textarea is empty or still contains the auto-generated
 * line untouched. Once the member edits the textarea manually we flip
 * `notesUserEdited` and never overwrite again.
 */
export default function Step5TeamCredentials({ onContinue, onSkip }: StepProps) {
  const [form, setForm] = useState<TeamForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracks the last auto-generated line we wrote into the textarea. Used to
  // detect "user has edited" — if textarea is empty OR equals lastAuto, the
  // member hasn't customized yet and we can keep auto-overwriting.
  const lastAutoRef = useRef<string | null>(null);
  const [notesUserEdited, setNotesUserEdited] = useState(false);

  // Pre-fill from existing config.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/member/market-data/config");
        if (!res.ok) return;
        const data = await res.json();
        const cfg = data?.config;
        if (!cancelled && cfg) {
          setForm({
            years: cfg.teamYearsInBusiness?.toString() ?? "",
            families: cfg.teamFamiliesHelped?.toString() ?? "",
            transactions: cfg.teamAnnualTransactionCount?.toString() ?? "",
            size: cfg.teamSize?.toString() ?? "",
            notes: cfg.teamCredibilityNotes ?? "",
          });
          if (cfg.teamCredibilityNotes) setNotesUserEdited(true);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const transactionsNum = useMemo(() => {
    const n = Number.parseInt(form.transactions, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [form.transactions]);

  const livePreview = autoLineFor(transactionsNum);

  // Auto-fill credibility notes from transactions count, but only while the
  // member hasn't typed anything custom in there.
  useEffect(() => {
    if (notesUserEdited) return;
    if (!livePreview) return;
    setForm((prev) => {
      // Empty OR still matches the last auto-line we wrote → safe to overwrite.
      if (prev.notes && prev.notes !== lastAutoRef.current) return prev;
      lastAutoRef.current = livePreview;
      return { ...prev, notes: livePreview };
    });
  }, [livePreview, notesUserEdited]);

  function onNotesChange(value: string) {
    setForm((p) => ({ ...p, notes: value }));
    // Anything that diverges from the last auto-generated string counts as a
    // user edit. From here on we stop auto-overwriting on transactions changes.
    if (value !== lastAutoRef.current) setNotesUserEdited(true);
  }

  function parseIntOrNull(v: string): number | null {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/member/market-data/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamYearsInBusiness: parseIntOrNull(form.years),
          teamFamiliesHelped: parseIntOrNull(form.families),
          teamAnnualTransactionCount: parseIntOrNull(form.transactions),
          teamSize: parseIntOrNull(form.size),
          teamCredibilityNotes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not save team credentials.");
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
        label="Step 4 of 6 — What makes you credible"
        title="What makes you credible"
        subtitle="The numbers your scripts will use, verbatim, in every video."
      />
      <WhyBlock>
        We&rsquo;ve seen scripts invent stats like &ldquo;after helping 4,000
        families&rdquo; when the real number is different. Fill these in and
        we&rsquo;ll use your actual numbers in every script&rsquo;s credibility
        moment, never made-up ones.
      </WhyBlock>

      {/* Signature stat callout */}
      <div className="my-5 rounded-xl border-2 border-purple-200 dark:border-purple-900/40 bg-purple-50 dark:bg-purple-950/20 p-5">
        <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">
          The one stat that lands hardest: how often your team helps a family
          move.
        </p>
        <p className="mt-2 text-sm text-purple-900 dark:text-purple-300">
          We&rsquo;ve watched audiences sit up for{" "}
          <em>&ldquo;we help a family move every 27 hours&rdquo;</em> — it
          makes the work feel real and ongoing in a way &ldquo;we did 320
          transactions last year&rdquo; doesn&rsquo;t.
        </p>
        <p className="mt-3 text-xs font-mono text-purple-800 dark:text-purple-300">
          Hours in a year (8,760) ÷ Last year&rsquo;s transactions = a family
          every [N] hours.
        </p>
        <ul className="mt-2 text-xs text-purple-800 dark:text-purple-300 space-y-0.5">
          <li>320 transactions → 8,760 ÷ 320 = <strong>every 27 hours</strong></li>
          <li>180 transactions → 8,760 ÷ 180 = <strong>every 49 hours</strong></li>
        </ul>
      </div>

      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <NumField
          label="Years in business"
          value={form.years}
          onChange={(v) => setForm((p) => ({ ...p, years: v }))}
        />
        <NumField
          label="Total families helped, lifetime"
          value={form.families}
          onChange={(v) => setForm((p) => ({ ...p, families: v }))}
        />
        <div>
          <NumField
            label="Last full year's transactions"
            value={form.transactions}
            onChange={(v) => setForm((p) => ({ ...p, transactions: v }))}
          />
          {livePreview && (
            <p className="mt-1 text-xs font-medium text-purple-700 dark:text-purple-400">
              = a family every {Math.round(8760 / (transactionsNum ?? 1))}{" "}
              hours
            </p>
          )}
        </div>
        <NumField
          label="Team size"
          value={form.size}
          onChange={(v) => setForm((p) => ({ ...p, size: v }))}
        />
        <label className="block sm:col-span-2">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Credibility lines (max 6)
          </span>
          <textarea
            rows={6}
            value={form.notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            placeholder="One credibility line per row. Auto-fills from your transactions count above — edit anything that's off."
          />
          <p className="mt-1 text-[11px] text-gray-500">
            Fill in what you have. The script writer uses what&rsquo;s here.
            Empty fields fall back to directional language.
          </p>
        </label>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <StepFooter
        time="3 minutes"
        primaryBusy={saving}
        onPrimary={() => void save()}
        onSkip={onSkip}
      />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
        {label}
      </span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
      />
    </label>
  );
}
