"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MarketDataState = "none" | "processing" | "ready" | "failed";
// Wave 6a — the separate background AI story pass. Parity-inert: defaults to
// "none" (no sub-note), which is the only value the API returns with the
// instant-cutover flag OFF.
type MarketStoriesState = "none" | "generating" | "ready" | "failed";

interface Checklist {
  profile: boolean;
  marketData: MarketDataState;
  marketStories?: MarketStoriesState;
  neighbourhood: boolean;
  firstIdea: boolean;
  scripted: boolean;
  scheduled: boolean;
}

type ItemState = "done" | "processing" | "todo";

interface ChecklistItem {
  key: string;
  label: string;
  state: ItemState;
  /** Sub-status shown on the right (e.g. "Validating…"). */
  note?: string;
  /** CTA — present only when the item is actionable by the member. */
  cta?: { label: string; href: string };
}

/**
 * Dashboard setup checklist.
 *
 * Sprint 1 made the wizard's slow steps (CSV validation, neighbourhood
 * research) non-blocking, so they finish AFTER onboarding completes. This card
 * is where those async tails — plus the first idea → script → schedule loop —
 * live visibly, off the critical path.
 *
 * Shows once the wizard is finished (profile done) and hides automatically when
 * every item is complete. Dismissible per-session, but it returns on reload
 * until the member finishes setup.
 */
export default function OnboardingChecklist() {
  const [data, setData] = useState<Checklist | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/member/onboarding/checklist");
        if (!res.ok) return;
        const json: Checklist = await res.json();
        if (!cancelled) setData(json);
      } catch {
        /* ignore — card simply won't render */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    // Poll so "Validating…" flips to "Ready ✓" without a manual refresh.
    const id = window.setInterval(load, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!loaded || !data || dismissed) return null;
  // Only relevant after the wizard is finished — the OnboardingBanner covers
  // the not-yet-complete case.
  if (!data.profile) return null;

  const items: ChecklistItem[] = [
    { key: "profile", label: "Set up your profile", state: "done" },
    {
      key: "marketData",
      label: "Upload your market data",
      state:
        data.marketData === "ready"
          ? "done"
          : data.marketData === "processing"
            ? "processing"
            : "todo",
      note:
        data.marketData === "processing"
          ? "Validating…"
          : data.marketData === "failed"
            ? "Upload failed"
            : data.marketStories === "generating"
              ? "Numbers ready · story ideas crunching…"
              : undefined,
      cta:
        data.marketData === "none" || data.marketData === "failed"
          ? {
              label: data.marketData === "failed" ? "Try again" : "Add it",
              href: "/member/market-data/setup",
            }
          : undefined,
    },
    {
      key: "neighbourhood",
      label: "Add your neighbourhood research",
      state: data.neighbourhood ? "done" : "todo",
      cta: data.neighbourhood
        ? undefined
        : { label: "Add it", href: "/member/knowledge-base" },
    },
    {
      key: "firstIdea",
      label: "Pick your first idea",
      state: data.firstIdea ? "done" : "todo",
      cta: data.firstIdea
        ? undefined
        : { label: "Pick one", href: "/member/content-planner" },
    },
    {
      key: "scripted",
      label: "Script it",
      state: data.scripted ? "done" : "todo",
      cta: data.scripted
        ? undefined
        : { label: "Write it", href: "/member/content-planner" },
    },
    {
      key: "scheduled",
      label: "Schedule it in the Content Planner",
      state: data.scheduled ? "done" : "todo",
      cta: data.scheduled
        ? undefined
        : { label: "Schedule", href: "/member/content-planner" },
    },
  ];

  // Hide the card entirely once every item is complete.
  const allDone = items.every((i) => i.state === "done");
  if (allDone) return null;

  const doneCount = items.filter((i) => i.state === "done").length;
  // The single highlighted next action: first incomplete item that the member
  // can act on right now (skips "Validating…", which is just waiting).
  const nextActionable = items.find((i) => i.state === "todo" && i.cta);

  return (
    <div className="rounded-xl border border-[var(--abv-border)] bg-[var(--abv-card)] px-6 py-5 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--abv-text)]">
            Finish setting up your system
          </p>
          <p className="mt-0.5 text-sm text-[var(--abv-text-secondary)]">
            {doneCount} of {items.length} done
            {data.marketData === "processing"
              ? " · your market data is crunching in the background"
              : ""}
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss setup checklist"
          className="shrink-0 rounded-full p-1 text-[var(--abv-text-secondary)] hover:text-[var(--abv-text)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((item) => {
          const isNext = nextActionable?.key === item.key;
          return (
            <li
              key={item.key}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex items-center gap-2.5">
                <StateIcon state={item.state} />
                <span
                  className={
                    item.state === "done"
                      ? "text-[var(--abv-text-secondary)] line-through"
                      : "text-[var(--abv-text)]"
                  }
                >
                  {item.label}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {item.note && (
                  <span className="text-xs font-medium text-[var(--abv-text-secondary)]">
                    {item.note}
                  </span>
                )}
                {item.cta && (
                  <Link
                    href={item.cta.href}
                    className={[
                      "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold",
                      isNext
                        ? "bg-[var(--abv-azure)] text-white"
                        : "border border-[var(--abv-border)] text-[var(--abv-text)] hover:bg-[var(--abv-bg)]",
                    ].join(" ")}
                  >
                    {item.cta.label}
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StateIcon({ state }: { state: ItemState }) {
  if (state === "done") {
    return (
      <span
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--abv-azure)] text-white"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="h-2.5 w-2.5"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    );
  }
  if (state === "processing") {
    return (
      <span
        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--abv-border)] border-t-[var(--abv-azure)]"
        aria-hidden
      />
    );
  }
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-[var(--abv-text-secondary)]"
      aria-hidden
    />
  );
}
