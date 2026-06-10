"use client";

/**
 * Wave 4 — "Drafts in progress" panel for the top of /member/my-work.
 *
 * Shows up to 3 Content Engine wizard drafts the member started but didn't
 * finish, with one-tap Resume / Discard. Hidden entirely when there are
 * zero drafts so empty users don't see a useless section header.
 *
 * Sub-sections:
 *   - "Recent" — anything updated in the last 7 days
 *   - "Stale (more than 7 days old)" — collapsible visual de-emphasis
 *
 * Amber "Expires soon" chip when an entry has < 48h to its 14-day TTL.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClockIcon, TrashIcon } from "@heroicons/react/24/outline";

interface Draft {
  id: string;
  currentStep: string;
  propertyTypeFocus: string | null;
  storyLeadId: string | null;
  rotationSlot: string | null;
  validatedIdea: string | null;
  pickedKey: string | null;
  expiresAt: string;
  updatedAt: string;
  createdAt: string;
}

const STEP_LABEL: Record<string, string> = {
  "1": "Mode picker",
  "2a": "Browsing Story Leads",
  "2b": "Validating an idea",
  "2c": "Picking a theme",
  "3": "Reviewing idea cards",
  "4": "Saving an idea",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export function DraftsInProgressSection() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/member/my-work/drafts")
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((d: { drafts?: Draft[] }) => {
        if (!cancelled) setDrafts(d.drafts ?? []);
      })
      .catch(() => {
        if (!cancelled) setDrafts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function discard(id: string) {
    setBusyId(id);
    try {
      // Wave 4 beta (Finding 11+13) — DELETE the SPECIFIC draft, not
      // the user's whole drafts table. Per-id route enforces ownership.
      await fetch(
        `/api/member/content-planner/wizard/draft/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      setDrafts((cur) => (cur ?? []).filter((d) => d.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  // Don't render anything (not even a loading skeleton) until we know there
  // ARE drafts — empty users shouldn't see a flashing section.
  if (!drafts || drafts.length === 0) return null;

  const now = Date.now();
  const recent = drafts.filter((d) => now - new Date(d.updatedAt).getTime() <= SEVEN_DAYS_MS);
  const stale = drafts.filter((d) => now - new Date(d.updatedAt).getTime() > SEVEN_DAYS_MS);

  return (
    <section className="rounded-xl border border-[var(--abv-text)]/10 dark:border-white/10 bg-white dark:bg-[#1a1a1a] p-5">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--abv-text)] dark:text-white">
          Drafts in progress
        </h2>
        <span className="text-xs text-[var(--abv-text)]/50 dark:text-white/40">
          {drafts.length} draft{drafts.length === 1 ? "" : "s"} · auto-expires after 14 days
        </span>
      </header>

      {recent.length > 0 && (
        <ul className="space-y-2">
          {recent.map((d) => (
            <DraftRow
              key={d.id}
              draft={d}
              busy={busyId === d.id}
              onDiscard={() => discard(d.id)}
            />
          ))}
        </ul>
      )}

      {stale.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-xs font-medium text-[var(--abv-text)]/60 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white">
            Stale ({stale.length}) — more than 7 days old
          </summary>
          <ul className="mt-2 space-y-2 opacity-70">
            {stale.map((d) => (
              <DraftRow
                key={d.id}
                draft={d}
                busy={busyId === d.id}
                onDiscard={() => discard(d.id)}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function DraftRow({
  draft,
  busy,
  onDiscard,
}: {
  draft: Draft;
  busy: boolean;
  onDiscard: () => void;
}) {
  const stepLabel = STEP_LABEL[draft.currentStep] ?? `Step ${draft.currentStep}`;
  const expiresInMs = new Date(draft.expiresAt).getTime() - Date.now();
  const expiresSoon = expiresInMs > 0 && expiresInMs < FORTY_EIGHT_HOURS_MS;
  const expiresInHours = Math.max(1, Math.round(expiresInMs / (60 * 60 * 1000)));
  const updatedLabel = new Date(draft.updatedAt).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });

  const resumeHref = buildResumeHref(draft);

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-[#2a2a2a] p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            In progress
          </span>
          {expiresSoon && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              <ClockIcon className="h-3 w-3" />
              Expires in {expiresInHours}h
            </span>
          )}
          {draft.propertyTypeFocus && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-[var(--abv-azure-tint)] text-[var(--abv-ink)] dark:text-white">
              🔒 {draft.propertyTypeFocus}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-sm font-medium text-[var(--abv-text)] dark:text-[#e2e8f0]">
          Content Engine wizard — {stepLabel}
        </p>
        <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40">
          Last edit {updatedLabel}
          {draft.rotationSlot && ` · Theme: ${draft.rotationSlot.replace(/_/g, " ")}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={resumeHref}
          className="rounded-md bg-[var(--abv-azure)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          Resume
        </Link>
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          aria-label="Discard draft"
          className="rounded-md border border-gray-200 dark:border-[#2a2a2a] p-1.5 text-[var(--abv-text)]/50 hover:text-red-600 dark:text-white/40 dark:hover:text-red-400 disabled:opacity-50"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function buildResumeHref(d: Draft): string {
  const params = new URLSearchParams({ step: d.currentStep });
  if (d.propertyTypeFocus) params.set("propertyTypeFocus", d.propertyTypeFocus);
  if (d.storyLeadId) params.set("storyLeadId", d.storyLeadId);
  if (d.rotationSlot) params.set("rotationSlot", d.rotationSlot);
  if (d.validatedIdea) params.set("validatedIdea", d.validatedIdea);
  if (d.pickedKey) params.set("picked", d.pickedKey);
  // Wave 4 beta (Finding 12) — pass the draft id so WizardDraftShell
  // adopts THIS draft for autosaves instead of creating a new one.
  params.set("draftId", d.id);
  return `/member/content-planner/wizard?${params.toString()}`;
}
