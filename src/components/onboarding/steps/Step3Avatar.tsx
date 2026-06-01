"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StepFooter, StepHeader, WhyBlock, type StepProps } from "./_shared";

interface AvatarInfo {
  hasAvatar: boolean;
  name?: string | null;
  summary?: string | null;
}

/**
 * Step 3 — Avatar. Two paths:
 *   - Already populated (from Avatar Architect or a previous wizard run):
 *     preview + "Looks good" / "Edit avatar" (opens Architect in a new tab).
 *   - Not populated: minimal 5-field inline form that writes to
 *     MarketConfig.primaryAvatar via the existing config PUT endpoint.
 */
export default function Step3Avatar({ onContinue, onSkip }: StepProps) {
  const [info, setInfo] = useState<AvatarInfo | null>(null);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState("");
  const [summary, setSummary] = useState("");
  const [pressures, setPressures] = useState("");
  const [language, setLanguage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "/api/member/market-data/config/avatar-source",
        );
        const data = res.ok ? await res.json() : { hasAvatar: false };
        if (!cancelled) setInfo(data);
      } catch {
        if (!cancelled) setInfo({ hasAvatar: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveInline() {
    setError(null);
    if (!profile.trim() || !summary.trim()) {
      setError("Profile paragraph and summary sentence are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/member/market-data/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          primaryAvatar: {
            source: "onboarding-wizard",
            snappedAt: new Date().toISOString(),
            name: name.trim() || null,
            summary: summary.trim(),
            profile: {
              narrative: profile.trim(),
              decisionPressures: pressures.trim() || null,
              internalLanguage: language.trim() || null,
            },
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not save avatar.");
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
        label="Step 2 of 6 — Who's on the other side of the camera"
        title="Who's on the other side of the camera"
        subtitle="The single person you're talking to."
      />
      <WhyBlock>
        Generic videos die. Specific videos win. The more we know about the
        one viewer you imagine — their situation, what they&rsquo;re working
        through, the language they use — the more your scripts will make them
        feel seen. Without this, scripts fall back to generic patter that
        doesn&rsquo;t land.
      </WhyBlock>

      {info === null ? (
        <p className="text-sm text-gray-500">Checking your avatar…</p>
      ) : info.hasAvatar ? (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 p-5">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            We have your avatar
            {info.name ? `: ${info.name}` : ""}
          </p>
          {info.summary && (
            <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300 line-clamp-3">
              {info.summary.length > 220
                ? `${info.summary.slice(0, 220)}…`
                : info.summary}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onContinue()}
              className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white dark:bg-white dark:text-gray-900"
            >
              Looks good
            </button>
            <Link
              href="/member/content-tools/avatar-architect"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-gray-300 dark:border-gray-700 px-5 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Edit avatar
            </Link>
          </div>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveInline();
          }}
        >
          <label className="block">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Internal name (never appears in scripts)
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              placeholder='e.g., "Move-up Megan"'
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              One-paragraph profile *
            </span>
            <textarea
              required
              rows={4}
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              placeholder="Dual-income family in their late 30s, two kids approaching teen years, currently in their first home, eyeing a move up to a 4-bed in a better catchment…"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              One-sentence summary *
            </span>
            <input
              required
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              placeholder="A move-up family timing the jump from their starter home into a forever home."
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Dominant decision pressures
            </span>
            <textarea
              rows={2}
              value={pressures}
              onChange={(e) => setPressures(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              placeholder="School catchment timing, rate uncertainty, equity in current home, spouse alignment…"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Internal language they use
            </span>
            <textarea
              rows={2}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              placeholder={`"forever home", "stretch budget", "good bones", "we just don't want to overpay"…`}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <StepFooter
            time="5 minutes"
            primaryBusy={saving}
            primaryDisabled={saving}
            onPrimary={() => void saveInline()}
            onSkip={onSkip}
            primaryLabel="Save and continue"
          />
        </form>
      )}

      {info?.hasAvatar && (
        <div className="mt-6 border-t border-gray-200 dark:border-gray-800 pt-4 text-right">
          <button
            type="button"
            onClick={() => onSkip()}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Save and finish later
          </button>
        </div>
      )}
    </div>
  );
}
