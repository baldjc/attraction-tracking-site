"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiThinking } from "@/lib/use-ai-thinking";
import {
  renderResearchBrief,
  estimatedResearchMinutes,
} from "@/lib/neighbourhood-research-brief";

interface NeighbourhoodCard {
  neighbourhood: string;
  hasProfile: boolean;
  previewSummary: string | null;
  lastUpdatedAt: string | null;
}

interface RecentUpload {
  id: string;
  sourceFileName: string | null;
  toolUsed: string | null;
  profileCount: number;
  parsedAt: string | null;
  uploadedAt: string;
  parseCostUsd: number | null;
  unmatchedSections: Array<{ rawHeading: string; content: string }>;
}

interface Props {
  marketName: string;
  mlsSource: string;
  neighbourhoods: string[];
  cards: NeighbourhoodCard[];
  recentUploads: RecentUpload[];
}

export default function KnowledgeBaseClient({
  marketName,
  mlsSource,
  neighbourhoods,
  cards,
  recentUploads,
}: Props) {
  const router = useRouter();
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);
  const [search, setSearch] = useState("");

  const existingVocabLower = useMemo(
    () => new Set(neighbourhoods.map((n) => n.trim().toLowerCase())),
    [neighbourhoods],
  );

  type DiscoveredState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
        status: "ready";
        discovered: string[];
        monthsCovered: number;
        selected: Set<string>;
      }
    | { status: "saving"; selected: Set<string> }
    | { status: "saved"; addedCount: number; totalCount: number };
  const [discovered, setDiscovered] = useState<DiscoveredState>({
    status: "idle",
  });

  async function onLoadDiscovered() {
    setDiscovered({ status: "loading" });
    try {
      const res = await fetch(
        "/api/member/knowledge-base/discovered-neighbourhoods",
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load.");
      const discoveredList: string[] = Array.isArray(data.discovered)
        ? data.discovered
        : [];
      const newOnes = discoveredList.filter(
        (n) => !existingVocabLower.has(n.trim().toLowerCase()),
      );
      setDiscovered({
        status: "ready",
        discovered: discoveredList,
        monthsCovered: Number(data.monthsCovered) || 0,
        selected: new Set(newOnes),
      });
    } catch (e) {
      setDiscovered({ status: "error", message: (e as Error).message });
    }
  }

  function toggleDiscovered(name: string) {
    setDiscovered((s) => {
      if (s.status !== "ready") return s;
      const next = new Set(s.selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { ...s, selected: next };
    });
  }

  async function onSaveDiscovered() {
    if (discovered.status !== "ready") return;
    const selected = discovered.selected;
    setDiscovered({ status: "saving", selected });
    try {
      const res = await fetch(
        "/api/member/knowledge-base/discovered-neighbourhoods",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ neighbourhoods: Array.from(selected) }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setDiscovered({
        status: "saved",
        addedCount: Number(data.addedCount) || 0,
        totalCount: Number(data.totalCount) || 0,
      });
      router.refresh();
    } catch (e) {
      setDiscovered({ status: "error", message: (e as Error).message });
    }
  }

  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [toolUsed, setToolUsed] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    profilesUpserted: string[];
    unmatchedSections: Array<{ rawHeading: string; content: string }>;
    costUsd: number;
  } | null>(null);

  const thinking = useAiThinking({
    mode: "phase",
    fallbackPhases: [
      "Reading your research document…",
      "Splitting by neighbourhood…",
      "Generating script-ready summaries…",
      "Saving profiles…",
    ],
    fallbackIntervalMs: 5000,
  });

  const brief = useMemo(
    () =>
      renderResearchBrief({
        marketName,
        mlsSource,
        neighbourhoods,
        spelling: "Canadian",
      }),
    [marketName, mlsSource, neighbourhoods],
  );

  const wordCount = useMemo(
    () => brief.trim().split(/\s+/).length.toLocaleString(),
    [brief],
  );

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => c.neighbourhood.toLowerCase().includes(q));
  }, [cards, search]);

  async function onCopyBrief() {
    try {
      await navigator.clipboard.writeText(brief);
      setBriefCopied(true);
      setTimeout(() => setBriefCopied(false), 2500);
    } catch {
      setBriefCopied(false);
    }
  }

  async function onUpload() {
    setUploadError(null);
    setUploadResult(null);

    const hasText = pastedText.trim().length > 0;
    const hasFile = !!file;
    if (!hasText && !hasFile) {
      setUploadError("Paste your research text or choose a file.");
      return;
    }

    const fd = new FormData();
    if (hasFile) fd.append("file", file!);
    if (hasText) fd.append("text", pastedText);
    if (toolUsed.trim()) fd.append("toolUsed", toolUsed.trim());

    thinking.start();
    try {
      const res = await fetch("/api/member/knowledge-base/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Upload failed.");
      }
      setUploadResult({
        profilesUpserted: data.profilesUpserted ?? [],
        unmatchedSections: data.unmatchedSections ?? [],
        costUsd: data.costUsd ?? 0,
      });
      setPastedText("");
      setFile(null);
      setToolUsed("");
      router.refresh();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      thinking.stop();
    }
  }

  return (
    <>
      {/* Auto-populate vocab from validated MarketFact rows */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Auto-populate from your validated data
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Pull the distinct neighbourhoods already found in your validated MLS
          uploads and merge them into your vocab — no retyping required.
        </p>

        {discovered.status === "idle" && (
          <div className="mt-4">
            <button
              type="button"
              onClick={onLoadDiscovered}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              Find neighbourhoods in my data
            </button>
          </div>
        )}

        {discovered.status === "loading" && (
          <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Scanning your validated facts…
          </div>
        )}

        {discovered.status === "error" && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {discovered.message}
            <div className="mt-2">
              <button
                type="button"
                onClick={onLoadDiscovered}
                className="text-xs underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {(discovered.status === "ready" || discovered.status === "saving") && (
          <div className="mt-4 space-y-3">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Found{" "}
              <strong>
                {(discovered.status === "ready"
                  ? discovered.discovered.length
                  : 0)}{" "}
              </strong>
              distinct neighbourhoods
              {discovered.status === "ready" && discovered.monthsCovered > 0 && (
                <>
                  {" "}across your last{" "}
                  <strong>{discovered.monthsCovered}</strong>{" "}
                  {discovered.monthsCovered === 1 ? "month" : "months"} of
                  validated uploads
                </>
              )}
              . Deselect any you don't want in your vocab.
            </div>

            {discovered.status === "ready" &&
            discovered.discovered.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-300 p-4 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No neighbourhoods found yet. Upload and validate some MLS data
                first.
              </div>
            ) : (
              <ul className="max-h-72 overflow-auto rounded-md border border-gray-200 p-2 dark:border-gray-800">
                {(discovered.status === "ready"
                  ? discovered.discovered
                  : []
                ).map((name) => {
                  const isExisting = existingVocabLower.has(
                    name.trim().toLowerCase(),
                  );
                  const checked = discovered.selected.has(name);
                  return (
                    <li
                      key={name}
                      className="flex items-center justify-between gap-2 px-2 py-1 text-sm"
                    >
                      <label className="flex flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={discovered.status === "saving"}
                          onChange={() => toggleDiscovered(name)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-800 dark:text-gray-200">
                          {name}
                        </span>
                      </label>
                      {isExisting && (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          already in vocab
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDiscovered({ status: "idle" })}
                disabled={discovered.status === "saving"}
                className="text-sm text-gray-600 hover:underline disabled:opacity-50 dark:text-gray-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveDiscovered}
                disabled={
                  discovered.status === "saving" ||
                  (discovered.status === "ready" &&
                    discovered.discovered.length === 0)
                }
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {discovered.status === "saving"
                  ? "Saving…"
                  : `Add ${discovered.status === "ready" ? discovered.selected.size : 0} to vocab`}
              </button>
            </div>
          </div>
        )}

        {discovered.status === "saved" && (
          <div className="mt-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
            Added <strong>{discovered.addedCount}</strong> new{" "}
            {discovered.addedCount === 1 ? "neighbourhood" : "neighbourhoods"}.
            Your vocab now has <strong>{discovered.totalCount}</strong> total.
            <button
              type="button"
              onClick={() => setDiscovered({ status: "idle" })}
              className="ml-3 text-xs underline hover:no-underline"
            >
              Done
            </button>
          </div>
        )}
      </section>

      {/* Section A — Research Brief */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          1. Get your research brief
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Paste this into ChatGPT Deep Research, Claude (with web search),
          Perplexity, or another AI research tool. The brief is calibrated for
          your market and neighbourhood list. Run the AI's response back here
          when ready.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onCopyBrief}
            disabled={neighbourhoods.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {briefCopied ? "Copied!" : "Copy Research Brief"}
          </button>
          <button
            type="button"
            onClick={() => setBriefOpen((v) => !v)}
            className="text-sm text-gray-600 hover:underline dark:text-gray-400"
          >
            {briefOpen ? "Hide preview" : "Show preview"}
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ~{wordCount} words · est. research time{" "}
            {estimatedResearchMinutes(neighbourhoods.length)}
          </span>
        </div>

        {neighbourhoods.length === 0 && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            Add at least one neighbourhood to your{" "}
            <Link
              href="/member/market-data/setup"
              className="underline hover:no-underline"
            >
              Market Data setup
            </Link>{" "}
            before generating the brief.
          </div>
        )}

        {briefOpen && (
          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
            {brief}
          </pre>
        )}
      </section>

      {/* Section B — Upload */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          2. Upload research results
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Paste the AI's full response, or upload it as a .md, .txt, .docx, or
          .pdf file. We'll split it into per-neighbourhood profiles.
        </p>

        {thinking.isThinking ? (
          <div className="mt-4">
            <AiThinking mode="phase" phaseLabel={thinking.phaseLabel} />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Paste markdown
              </span>
              <textarea
                rows={6}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste the research document here…"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  …or upload a file
                </span>
                <input
                  type="file"
                  accept=".md,.txt,.docx,.pdf,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  AI tool used (optional)
                </span>
                <input
                  type="text"
                  value={toolUsed}
                  onChange={(e) => setToolUsed(e.target.value)}
                  placeholder="e.g. ChatGPT Deep Research"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onUpload}
                disabled={!pastedText.trim() && !file}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Process upload
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {uploadError}
          </div>
        )}

        {uploadResult && (
          <div className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
            <div className="font-medium">
              Saved {uploadResult.profilesUpserted.length}{" "}
              {uploadResult.profilesUpserted.length === 1
                ? "profile"
                : "profiles"}{" "}
              · cost ${uploadResult.costUsd.toFixed(3)}
            </div>
            {uploadResult.profilesUpserted.length > 0 && (
              <div className="mt-1 text-xs">
                Updated: {uploadResult.profilesUpserted.join(", ")}
              </div>
            )}
            {uploadResult.unmatchedSections.length > 0 && (
              <div className="mt-2 text-xs">
                ⚠ {uploadResult.unmatchedSections.length} section
                {uploadResult.unmatchedSections.length === 1 ? "" : "s"} didn't
                match any allowed neighbourhood. Headings:{" "}
                {uploadResult.unmatchedSections
                  .map((s) => `"${s.rawHeading}"`)
                  .join(", ")}
                . Add them to your Market Data vocabulary if they belong, then
                re-upload.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Section C — Profiles grid */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            3. Your neighbourhood profiles
          </h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search neighbourhoods…"
            className="w-48 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        {cards.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Add neighbourhoods to your Market Data setup to see them here.
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No matches for "{search}".
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCards.map((card) => (
              <li key={card.neighbourhood}>
                <Link
                  href={`/member/knowledge-base/${encodeURIComponent(
                    card.neighbourhood,
                  )}`}
                  className="block h-full rounded-lg border border-gray-200 bg-white p-4 transition hover:border-blue-400 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-500"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">
                      {card.neighbourhood}
                    </h3>
                    <span
                      className="text-xs"
                      title={card.hasProfile ? "Has profile" : "No profile yet"}
                    >
                      {card.hasProfile ? "✅" : "⚪"}
                    </span>
                  </div>
                  {card.previewSummary ? (
                    <p className="mt-2 line-clamp-3 text-xs text-gray-600 dark:text-gray-400">
                      {card.previewSummary}
                      {card.previewSummary.length >= 80 ? "…" : ""}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs italic text-gray-400 dark:text-gray-600">
                      No profile yet — upload research above.
                    </p>
                  )}
                  {card.lastUpdatedAt && (
                    <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-600">
                      Updated{" "}
                      {new Date(card.lastUpdatedAt).toLocaleDateString()}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent uploads (compact) */}
      {recentUploads.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Recent uploads
          </h2>
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 text-xs dark:divide-gray-800 dark:border-gray-800">
            {recentUploads.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-gray-700 dark:text-gray-300">
                  {u.sourceFileName ?? "Pasted text"}
                  {u.toolUsed ? ` · ${u.toolUsed}` : ""}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {u.profileCount}{" "}
                  {u.profileCount === 1 ? "profile" : "profiles"}
                  {u.parseCostUsd != null
                    ? ` · $${u.parseCostUsd.toFixed(3)}`
                    : ""}
                  {u.unmatchedSections.length > 0
                    ? ` · ${u.unmatchedSections.length} unmatched`
                    : ""}
                  {" · "}
                  {new Date(u.uploadedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
