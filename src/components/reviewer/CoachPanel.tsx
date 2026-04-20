"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

interface RunSummary {
  id: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  errorMessage?: string | null;
}

interface RunDetail extends RunSummary {
  channelRef: string;
  reportMarkdown: string | null;
}

export function CoachPanel({ channelRef }: { channelRef: string }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/admin/reviewer/channels/${encodeURIComponent(channelRef)}/coach-panel/history`,
      );
      if (res.ok) {
        const data = await res.json();
        setHistory(data.runs ?? []);
        // Auto-show latest complete run if we don't have one yet
        const latestComplete = (data.runs ?? []).find(
          (r: RunSummary) => r.status === "complete",
        );
        if (latestComplete && !run) {
          await loadRun(latestComplete.id);
        }
      }
    } finally {
      setLoadingHistory(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelRef]);

  const loadRun = useCallback(async (runId: string) => {
    const res = await fetch(`/api/admin/reviewer/runs/${runId}`);
    if (res.ok) {
      const data = await res.json();
      setRun(data.run);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    // Reset state and stop any in-flight polling when the channel changes
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
    setRun(null);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [channelRef]);

  function startPolling(runId: string) {
    setPolling(true);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/admin/reviewer/runs/${runId}`);
      if (!res.ok) return;
      const data = await res.json();
      setRun(data.run);
      if (data.run.status === "complete" || data.run.status === "failed") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setPolling(false);
        await loadHistory();
      }
    }, 3000);
  }

  async function handleRun() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/reviewer/channels/${encodeURIComponent(channelRef)}/coach-panel/run`,
        { method: "POST" },
      );
      if (!res.ok) {
        const text = await res.text();
        alert(`Run failed to start: ${text}`);
        return;
      }
      const data = await res.json();
      setRun({
        id: data.runId,
        channelRef,
        status: "pending",
        startedAt: null,
        finishedAt: null,
        createdAt: new Date().toISOString(),
        reportMarkdown: null,
      });
      startPolling(data.runId);
    } catch (err) {
      alert(`Run failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  }

  const isRunning =
    polling || run?.status === "pending" || run?.status === "running";

  return (
    <section
      className="rounded-xl border border-[#eaeaea] bg-white p-6 dark:border-[#2a2a2a] dark:bg-[#1a1a1a]"
      style={{
        borderRadius: "var(--atbv-radius-lg)",
        boxShadow: "var(--atbv-shadow-sm)",
      }}
    >
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-lg text-[#2f3437] dark:text-white">
          Coach Panel
        </h2>
        <p className="eyebrow text-[#787774]">AI coaching summary</p>
      </div>
      <p className="mb-5 text-sm text-[#787774]">
        Generates a four-section coaching report from the latest analytics,
        portfolio mix, pulses, glance tests, and watch-time winners.
      </p>

      <button
        onClick={handleRun}
        disabled={busy || isRunning}
        className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: "var(--atbv-primary, #2f3437)" }}
      >
        {isRunning ? "Analysing…" : "Run coaching analysis"}
      </button>

      {isRunning && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[#787774]">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#787774] border-t-transparent" />
          Analysing channel data — usually takes 30 seconds.
        </div>
      )}

      {run && run.status === "failed" && (
        <div
          className="mt-4 rounded-md border p-3 text-sm"
          style={{
            borderColor: "var(--atbv-danger, #e63946)",
            color: "var(--atbv-danger, #e63946)",
          }}
        >
          Run failed: {run.errorMessage ?? "Unknown error"}
        </div>
      )}

      {run && run.status === "complete" && run.reportMarkdown && (
        <div className="mt-6">
          <article className="prose prose-sm max-w-none text-[#2f3437] dark:prose-invert dark:text-white">
            <ReactMarkdown>{run.reportMarkdown}</ReactMarkdown>
          </article>
          <p className="mt-4 text-xs text-[#787774]">
            Last run:{" "}
            {run.finishedAt
              ? new Date(run.finishedAt).toLocaleString("en-CA")
              : new Date(run.createdAt).toLocaleString("en-CA")}
          </p>
        </div>
      )}

      <div className="mt-6 border-t border-[#eaeaea] pt-4 dark:border-[#2a2a2a]">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="text-xs font-semibold uppercase tracking-wider text-[#787774] hover:text-[#2f3437] dark:hover:text-white"
        >
          {historyOpen ? "Hide" : "Show"} prior runs ({history.length})
        </button>
        {historyOpen && (
          <ul className="mt-3 space-y-1.5">
            {loadingHistory && (
              <li className="text-sm text-[#787774]">Loading…</li>
            )}
            {!loadingHistory && history.length === 0 && (
              <li className="text-sm text-[#787774]">No prior runs.</li>
            )}
            {history.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => loadRun(h.id)}
                  className="flex w-full items-center justify-between rounded-md border border-[#eaeaea] px-3 py-2 text-left text-xs transition-colors hover:bg-[#f7f6f3] dark:border-[#2a2a2a] dark:hover:bg-[#222]"
                >
                  <span className="text-[#2f3437] dark:text-white">
                    {new Date(h.createdAt).toLocaleString("en-CA")}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      backgroundColor:
                        h.status === "complete"
                          ? "color-mix(in srgb, var(--atbv-success) 12%, transparent)"
                          : h.status === "failed"
                            ? "color-mix(in srgb, var(--atbv-danger) 12%, transparent)"
                            : "color-mix(in srgb, var(--atbv-warning) 12%, transparent)",
                      color:
                        h.status === "complete"
                          ? "var(--atbv-success)"
                          : h.status === "failed"
                            ? "var(--atbv-danger)"
                            : "var(--atbv-warning)",
                    }}
                  >
                    {h.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
