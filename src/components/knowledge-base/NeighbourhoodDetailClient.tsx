"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { renderResearchBrief } from "@/lib/neighbourhood-research-brief";

interface InitialProfile {
  content: string;
  summary: string | null;
  sourceFile: string | null;
  lastUpdatedAt: string;
}

interface Props {
  marketName: string;
  mlsSource: string;
  neighbourhood: string;
  initial: InitialProfile | null;
}

export default function NeighbourhoodDetailClient({
  marketName,
  mlsSource,
  neighbourhood,
  initial,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initial?.content ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(
    initial?.lastUpdatedAt ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reResearchCopied, setReResearchCopied] = useState(false);

  const focusedBrief = useMemo(
    () =>
      renderResearchBrief({
        marketName,
        mlsSource,
        neighbourhoods: [neighbourhood],
        spelling: "Canadian",
      }),
    [marketName, mlsSource, neighbourhood],
  );

  async function onSave() {
    setError(null);
    if (!content.trim()) {
      setError("Profile content cannot be empty.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/member/knowledge-base/profile/${encodeURIComponent(neighbourhood)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content, summary }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed.");
      setSavedAt(data.lastUpdatedAt);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (
      !confirm(
        `Delete the profile for "${neighbourhood}"? You can re-upload research to restore it.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/member/knowledge-base/profile/${encodeURIComponent(neighbourhood)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed.");
      router.push("/member/knowledge-base");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function onCopyReResearch() {
    try {
      await navigator.clipboard.writeText(focusedBrief);
      setReResearchCopied(true);
      setTimeout(() => setReResearchCopied(false), 2500);
    } catch {
      setReResearchCopied(false);
    }
  }

  if (!initial) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
          No profile uploaded yet for {neighbourhood}.
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-base font-medium text-gray-900 dark:text-gray-100">
            Generate a focused research brief
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Copy the brief below into your preferred AI research tool to
            produce just this one profile, then upload the result on the main
            Knowledge Base page.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onCopyReResearch}
              className="rounded-full bg-[var(--abv-ink)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform duration-150 active:scale-[0.98] hover:bg-[#2a2a2a]"
            >
              {reResearchCopied ? "Copied!" : "Copy focused brief"}
            </button>
          </div>
          <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
            {focusedBrief}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onCopyReResearch}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {reResearchCopied ? "Copied!" : "Re-research this one"}
        </button>
        {savedAt && (
          <span className="text-xs text-gray-500 dark:text-gray-500">
            Updated {new Date(savedAt).toLocaleString()}
          </span>
        )}
        {initial.sourceFile && (
          <span className="text-xs text-gray-500 dark:text-gray-500">
            · from {initial.sourceFile}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Summary panel — what gets passed to Script Builder */}
      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Script-ready summary
          </h2>
          <span className="text-[11px] text-gray-500 dark:text-gray-500">
            Used by Script Builder
          </span>
        </div>
        {editing ? (
          <textarea
            rows={6}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="200-word distillation Claude generated. You can refine it."
            className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
            {summary || (
              <span className="italic text-gray-400 dark:text-gray-600">
                No summary saved.
              </span>
            )}
          </p>
        )}
      </section>

      {/* Full content */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Full profile
        </h2>
        {editing ? (
          <textarea
            rows={24}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        ) : (
          <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
            {content}
          </pre>
        )}

        {editing && (
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setContent(initial.content);
                setSummary(initial.summary ?? "");
                setError(null);
              }}
              disabled={busy}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className="rounded-full bg-[var(--abv-ink)] px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-transform duration-150 active:scale-[0.98] hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
