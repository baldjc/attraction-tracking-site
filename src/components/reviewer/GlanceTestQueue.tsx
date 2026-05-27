"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

interface GlanceResult {
  id: string;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  overallScore: number;
  observations: unknown;
  improvements: unknown;
  createdAt: string;
}

type SortMode = "lowest" | "newest";

function scoreColor(score: number): string {
  if (score >= 80) return "var(--atbv-success)";
  if (score >= 60) return "var(--atbv-warning)";
  return "var(--atbv-danger)";
}

function firstString(v: unknown): string | null {
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  return null;
}

export default function GlanceTestQueue({
  channelRef,
}: {
  channelRef: string;
}) {
  const [results, setResults] = useState<GlanceResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("lowest");
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/reviewer/channels/${encodeURIComponent(channelRef)}/glance-test`,
      );
      if (!r.ok) throw new Error(await r.text());
      const j = (await r.json()) as { results: GlanceResult[] };
      setResults(j.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [channelRef]);

  useEffect(() => {
    setResults(null);
    load();
  }, [load]);

  async function runBatch() {
    if (running) return;
    setRunning(true);
    try {
      const r = await fetch(
        `/api/admin/reviewer/channels/${encodeURIComponent(channelRef)}/glance-test/run`,
        { method: "POST" },
      );
      if (!r.ok && r.status !== 202) throw new Error(await r.text());
      // Backend processes in the background; refetch after a delay.
      setTimeout(() => {
        load().finally(() => setRunning(false));
      }, 15000);
    } catch (e) {
      alert(`Batch failed: ${e instanceof Error ? e.message : e}`);
      setRunning(false);
    }
  }

  if (error)
    return (
      <div className="rounded-xl border border-[var(--abv-crimson)]/30 bg-[var(--abv-crimson)]/5 p-4 text-sm text-[var(--abv-text)]">
        Could not load Glance Test Queue: {error}
      </div>
    );

  const sorted = results
    ? [...results].sort((a, b) =>
        sort === "lowest"
          ? a.overallScore - b.overallScore
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    : null;

  return (
    <div
      className="rounded-xl border border-[var(--abv-border-strong)] bg-white p-5"
      style={{
        borderRadius: "var(--atbv-radius-lg)",
        boxShadow: "var(--atbv-shadow-sm)",
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--abv-text)]">
          Glance Test Queue
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="rounded-md border border-[var(--abv-border-strong)] bg-white px-2 py-1 text-xs text-[var(--abv-text)]"
            style={{ borderRadius: "var(--atbv-radius-sm)" }}
          >
            <option value="lowest">Lowest score first</option>
            <option value="newest">Newest first</option>
          </select>
          <button
            onClick={runBatch}
            disabled={running}
            className="flex items-center gap-1.5 rounded-md bg-[var(--abv-dark)] px-3 py-1.5 text-xs font-medium text-white hover:bg-black/85 disabled:opacity-50"
            style={{ borderRadius: "var(--atbv-radius-md)" }}
          >
            <ArrowPathIcon
              className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`}
            />
            {running ? "Running…" : "Run new batch"}
          </button>
        </div>
      </div>

      {!sorted ? (
        <div className="h-40 animate-pulse rounded-md bg-[var(--abv-bg)]" />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-[var(--abv-text-secondary)]">
          No glance tests yet. Click <em>Run new batch</em> to score the most
          recent thumbnails.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((r) => {
            const obs = firstString(r.observations);
            const imp = firstString(r.improvements);
            return (
              <div
                key={r.id}
                className="overflow-hidden rounded-md border border-[var(--abv-border-strong)] bg-[var(--abv-bg)]"
                style={{ borderRadius: "var(--atbv-radius-md)" }}
              >
                <div className="relative aspect-video bg-[var(--abv-border-strong)]">
                  {r.thumbnailUrl && (
                    <Image
                      src={r.thumbnailUrl}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover"
                    />
                  )}
                  <div
                    className="absolute right-2 top-2 rounded-md px-2 py-1 font-data text-sm font-semibold text-white tabular-nums"
                    style={{
                      backgroundColor: scoreColor(r.overallScore),
                      borderRadius: "var(--atbv-radius-sm)",
                    }}
                  >
                    {r.overallScore}
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-2 text-sm font-medium text-[var(--abv-text)]">
                    {r.title}
                  </h3>
                  {obs && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-[var(--abv-text-secondary)]">
                      <span className="font-medium text-[var(--abv-text)]">
                        Note:
                      </span>{" "}
                      {obs}
                    </p>
                  )}
                  {imp && (
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--abv-text-secondary)]">
                      <span
                        className="font-medium"
                        style={{ color: "var(--atbv-primary)" }}
                      >
                        Fix:
                      </span>{" "}
                      {imp}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
