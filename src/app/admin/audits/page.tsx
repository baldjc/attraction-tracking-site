"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowPathIcon, PlayIcon, CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

interface AuditRow {
  id: string;
  auditType: string;
  overallScore: number | null;
  createdAt: string;
  user: { id: string; fullName: string | null; email: string } | null;
}

interface BatchStatus {
  status: "running" | "complete" | "idle";
  current: number;
  total: number;
  started?: string;
  completed?: string;
  results?: Array<{ memberId: string; memberName: string; status: string; reason?: string }>;
}

interface LastRun {
  date: string;
  yearMonth: string;
  total_eligible: number;
  audits_queued: number;
  skipped_no_baseline: number;
  skipped_no_new_videos: number;
  skipped_no_youtube: number;
  failures: number;
}

interface BaselineLastRun {
  date: string;
  total_eligible: number;
  generated: number;
  failures: number;
}

interface ActiveJob {
  id: string;
  status: string;
  auditType: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; fullName: string | null; email: string } | null;
}

function scoreBg(score: number | null) {
  if (score == null) return "bg-gray-100 text-gray-500";
  if (score >= 7) return "bg-green-100 text-green-700";
  if (score >= 5) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-[#ff0033]";
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(date: string) {
  return new Date(date).toLocaleString("en-CA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function elapsedLabel(createdAt: string) {
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

const ACTIVE_STATUSES = ["queued", "downloading", "analysing", "generating"];

export default function AuditsPage() {
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [launching, setLaunching] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [baselineBatchStatus, setBaselineBatchStatus] = useState<BatchStatus | null>(null);
  const [baselineLastRun, setBaselineLastRun] = useState<BaselineLastRun | null>(null);
  const [baselineLaunching, setBaselineLaunching] = useState(false);
  const baselinePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const activeJobsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    fetchAudits();
    fetchBatchStatus();
    fetchBaselineBatchStatus();
    fetchActiveJobs();
  }, []);

  // Poll active jobs while any exist
  useEffect(() => {
    if (activeJobs.length > 0) {
      if (!activeJobsPollRef.current) {
        activeJobsPollRef.current = setInterval(() => {
          fetchActiveJobs();
          forceUpdate((n) => n + 1); // re-render to update elapsed timers
        }, 3000);
      }
    } else {
      if (activeJobsPollRef.current) {
        clearInterval(activeJobsPollRef.current);
        activeJobsPollRef.current = null;
        fetchAudits();
      }
    }
    return () => {
      if (activeJobsPollRef.current) clearInterval(activeJobsPollRef.current);
    };
  }, [activeJobs.length]);

  // Poll for monthly batch progress while running
  useEffect(() => {
    if (batchStatus?.status === "running") {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchBatchStatus, 3000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        if (batchStatus?.status === "complete") fetchAudits();
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [batchStatus?.status]);

  // Poll for baseline batch progress while running
  useEffect(() => {
    if (baselineBatchStatus?.status === "running") {
      if (!baselinePollRef.current) {
        baselinePollRef.current = setInterval(fetchBaselineBatchStatus, 3000);
      }
    } else {
      if (baselinePollRef.current) {
        clearInterval(baselinePollRef.current);
        baselinePollRef.current = null;
        if (baselineBatchStatus?.status === "complete") fetchAudits();
      }
    }
    return () => {
      if (baselinePollRef.current) clearInterval(baselinePollRef.current);
    };
  }, [baselineBatchStatus?.status]);

  async function fetchAudits() {
    setLoading(true);
    const res = await fetch("/api/audits");
    const data = await res.json();
    setAudits(data.audits ?? []);
    setLoading(false);
  }

  async function fetchBatchStatus() {
    try {
      const res = await fetch("/api/audits/run-all-monthly");
      const data = await res.json();
      setBatchStatus(data.batchStatus);
      setLastRun(data.lastRun);
    } catch { }
  }

  async function fetchBaselineBatchStatus() {
    try {
      const res = await fetch("/api/audits/run-all-baseline");
      const data = await res.json();
      setBaselineBatchStatus(data.batchStatus);
      setBaselineLastRun(data.lastRun);
    } catch { }
  }

  async function dismissMonthlyBatch() {
    try {
      await fetch("/api/audits/run-all-monthly", { method: "DELETE" });
      setBatchStatus(null);
    } catch { }
  }

  async function dismissBaselineBatch() {
    try {
      await fetch("/api/audits/run-all-baseline", { method: "DELETE" });
      setBaselineBatchStatus(null);
    } catch { }
  }

  const fetchActiveJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/audits/active-jobs");
      const data = await res.json();
      setActiveJobs((data.jobs ?? []).filter((j: ActiveJob) => ACTIVE_STATUSES.includes(j.status)));
    } catch { }
  }, []);

  async function handleCancelJob(jobId: string) {
    setCancellingJobId(jobId);
    try {
      await fetch(`/api/audits/jobs/${jobId}/cancel`, { method: "POST" });
      await fetchActiveJobs();
    } finally {
      setCancellingJobId(null);
    }
  }

  async function handleRunAllMonthly() {
    if (!confirm("This will queue monthly audits for all eligible members. Each member takes ~30–60 seconds. Continue?")) return;
    setLaunching(true);
    try {
      const res = await fetch("/api/audits/run-all-monthly", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        await fetchBatchStatus();
        await fetchActiveJobs();
      }
    } finally {
      setLaunching(false);
    }
  }

  async function handleRunAllBaseline() {
    if (!confirm("This will queue baseline audits for all members who don't have one yet and have a YouTube channel set. Continue?")) return;
    setBaselineLaunching(true);
    try {
      const res = await fetch("/api/audits/run-all-baseline", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else if (!data.started) {
        alert(data.message ?? "No eligible members found.");
      } else {
        await fetchBaselineBatchStatus();
        await fetchActiveJobs();
      }
    } finally {
      setBaselineLaunching(false);
    }
  }

  const filtered = audits
    .filter((a) => !typeFilter || a.auditType === typeFilter)
    .filter((a) => {
      if (!search) return true;
      const name = (a.user?.fullName ?? a.user?.email ?? "").toLowerCase();
      return name.includes(search.toLowerCase());
    });

  const isRunning = batchStatus?.status === "running";
  const isBaselineRunning = baselineBatchStatus?.status === "running";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2f3437]">Audits</h1>
          <p className="text-[#2f3437]/60 mt-1">{audits.length} total audit{audits.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={handleRunAllBaseline}
            disabled={baselineLaunching || isBaselineRunning || isRunning}
            className="flex items-center gap-2 bg-[#6ba3c7] hover:bg-[#2ab0ec] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            <PlayIcon className={`w-4 h-4 ${isBaselineRunning ? "animate-pulse" : ""}`} />
            {isBaselineRunning ? `Running… ${baselineBatchStatus!.current}/${baselineBatchStatus!.total}` : baselineLaunching ? "Starting…" : "Run All Baseline Audits"}
          </button>
          <button
            onClick={handleRunAllMonthly}
            disabled={launching || isRunning || isBaselineRunning}
            className="flex items-center gap-2 bg-[#111] hover:bg-[#2a3a4d] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            <PlayIcon className={`w-4 h-4 ${isRunning ? "animate-pulse" : ""}`} />
            {isRunning ? `Running… ${batchStatus!.current}/${batchStatus!.total}` : launching ? "Starting…" : "Run All Monthly Audits"}
          </button>
        </div>
      </div>

      {/* Active Jobs section */}
      {activeJobs.length > 0 && (
        <div className="mb-5 bg-white border border-[#6ba3c7]/30 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#6ba3c7]/20 bg-[#e8f7ff]/40">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#6ba3c7] animate-pulse" />
              <span className="text-sm font-semibold text-[#2f3437]">
                {activeJobs.length} Audit{activeJobs.length !== 1 ? "s" : ""} In Progress
              </span>
            </div>
            <button
              onClick={fetchActiveJobs}
              className="text-xs text-[#2f3437]/50 hover:text-[#2f3437] flex items-center gap-1"
            >
              <ArrowPathIcon className="w-3 h-3" /> Refresh
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {activeJobs.map((job) => (
              <div key={job.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-4 h-4 border-2 border-[#6ba3c7] border-t-transparent rounded-full animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {job.user ? (
                      <Link
                        href={`/admin/members/${job.user.id}`}
                        className="text-sm font-medium text-[#6ba3c7] hover:underline truncate"
                      >
                        {job.user.fullName ?? job.user.email}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-[#2f3437]/60">Unknown member</span>
                    )}
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#111]/10 text-[#2f3437]/60 capitalize shrink-0">
                      {job.auditType.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[#2f3437]/50">{job.message}</span>
                    <span className="text-xs text-[#2f3437]/30">·</span>
                    <span className="text-xs text-[#2f3437]/40">{elapsedLabel(job.createdAt)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleCancelJob(job.id)}
                  disabled={cancellingJobId === job.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-[#ff0033] hover:bg-red-100 disabled:opacity-50 transition-colors shrink-0"
                >
                  <XCircleIcon className="w-3.5 h-3.5" />
                  {cancellingJobId === job.id ? "Cancelling…" : "Cancel"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch progress */}
      {isRunning && (
        <div className="mb-4 bg-white border border-[#6ba3c7]/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-[#2f3437]">Monthly batch in progress…</p>
            <div className="flex items-center gap-3">
              <p className="text-sm text-[#2f3437]/50">{batchStatus.current} / {batchStatus.total} members</p>
              <button onClick={dismissMonthlyBatch} className="text-xs text-[#2f3437]/40 hover:text-[#ff0033] transition-colors" title="Dismiss">✕</button>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
            <div
              className="bg-[#6ba3c7] h-2 rounded-full transition-all duration-500"
              style={{ width: `${batchStatus.total > 0 ? (batchStatus.current / batchStatus.total) * 100 : 0}%` }}
            />
          </div>
          {batchStatus.results && batchStatus.results.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {batchStatus.results.slice().reverse().map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={
                    r.status === "success" ? "text-green-600" :
                    r.status === "failed" ? "text-[#ff0033]" : "text-[#2f3437]/40"
                  }>
                    {r.status === "success" ? "✓" : r.status === "failed" ? "✗" : "–"}
                  </span>
                  <span className="text-[#2f3437]">{r.memberName}</span>
                  {r.reason && <span className="text-[#2f3437]/40">({r.reason})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Monthly batch summary */}
      {!isRunning && batchStatus?.status === "complete" && batchStatus.completed && (
        <div className="mb-4 bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
            <p className="text-sm font-semibold text-[#2f3437]">Last monthly batch complete</p>
            <p className="text-xs text-[#2f3437]/40 ml-auto">{fmtDateTime(batchStatus.completed)}</p>
          </div>
          <p className="text-xs text-[#2f3437]/60">
            {batchStatus.results?.filter(r => r.status === "success").length ?? 0} audits completed ·{" "}
            {batchStatus.results?.filter(r => r.status === "skipped").length ?? 0} skipped ·{" "}
            {batchStatus.results?.filter(r => r.status === "failed").length ?? 0} failed
          </p>
        </div>
      )}

      {/* Last monthly run from DB */}
      {lastRun && !isRunning && !(batchStatus?.status === "complete") && (
        <div className="mb-4 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-[#2f3437]/60">
          <span className="font-medium text-[#2f3437]">Last monthly run:</span>{" "}
          {fmtDateTime(lastRun.date)} —{" "}
          {lastRun.audits_queued} audits completed, {lastRun.skipped_no_new_videos + lastRun.skipped_no_baseline + (lastRun.skipped_no_youtube ?? 0)} skipped
          {lastRun.failures > 0 && `, ${lastRun.failures} failed`}
        </div>
      )}

      {/* Baseline batch progress */}
      {isBaselineRunning && (
        <div className="mb-4 bg-white border border-[#6ba3c7]/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-[#2f3437]">Baseline batch in progress…</p>
            <div className="flex items-center gap-3">
              <p className="text-sm text-[#2f3437]/50">{baselineBatchStatus!.current} / {baselineBatchStatus!.total} members</p>
              <button onClick={dismissBaselineBatch} className="text-xs text-[#2f3437]/40 hover:text-[#ff0033] transition-colors" title="Dismiss">✕</button>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
            <div
              className="bg-[#6ba3c7] h-2 rounded-full transition-all duration-500"
              style={{ width: `${baselineBatchStatus!.total > 0 ? (baselineBatchStatus!.current / baselineBatchStatus!.total) * 100 : 0}%` }}
            />
          </div>
          {baselineBatchStatus!.results && baselineBatchStatus!.results.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {baselineBatchStatus!.results.slice().reverse().map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={r.status === "success" ? "text-green-600" : r.status === "failed" ? "text-[#ff0033]" : "text-[#2f3437]/40"}>
                    {r.status === "success" ? "✓" : r.status === "failed" ? "✗" : "–"}
                  </span>
                  <span className="text-[#2f3437]">{r.memberName}</span>
                  {r.reason && <span className="text-[#2f3437]/40">({r.reason})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Baseline batch summary */}
      {!isBaselineRunning && baselineBatchStatus?.status === "complete" && baselineBatchStatus.completed && (
        <div className="mb-4 bg-white border border-[#6ba3c7]/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="w-4 h-4 text-[#6ba3c7] shrink-0" />
            <p className="text-sm font-semibold text-[#2f3437]">Baseline batch complete</p>
            <p className="text-xs text-[#2f3437]/40 ml-auto">{fmtDateTime(baselineBatchStatus.completed)}</p>
          </div>
          <p className="text-xs text-[#2f3437]/60">
            {baselineBatchStatus.results?.filter(r => r.status === "success").length ?? 0} new baselines generated ·{" "}
            {baselineBatchStatus.results?.filter(r => r.status === "failed").length ?? 0} failed
          </p>
        </div>
      )}

      {/* Last baseline run from DB */}
      {baselineLastRun && !isBaselineRunning && !(baselineBatchStatus?.status === "complete") && (
        <div className="mb-4 px-4 py-3 bg-[#e8f7ff]/60 border border-[#6ba3c7]/20 rounded-lg text-xs text-[#2f3437]/60">
          <span className="font-medium text-[#2f3437]">Last baseline run:</span>{" "}
          {fmtDateTime(baselineLastRun.date)} — {baselineLastRun.generated} baseline{baselineLastRun.generated !== 1 ? "s" : ""} generated
          {baselineLastRun.failures > 0 && `, ${baselineLastRun.failures} failed`}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by member name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none text-[#2f3437] bg-white text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] outline-none text-[#2f3437] bg-white text-sm"
        >
          <option value="">All Types</option>
          <option value="baseline">Baseline</option>
          <option value="monthly">Monthly</option>
          <option value="single_video">Single Video</option>
        </select>
        <button
          onClick={() => { fetchAudits(); fetchBatchStatus(); fetchBaselineBatchStatus(); fetchActiveJobs(); }}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-[#2f3437] hover:bg-gray-50"
        >
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Date", "Member", "Type", "Score", "Action"].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-[#2f3437]/60 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[#2f3437]/40">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[#2f3437]/40">No audits found.</td></tr>
              ) : filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-[#2f3437]/70">{fmt(a.createdAt)}</td>
                  <td className="px-6 py-4">
                    {a.user ? (
                      <Link href={`/admin/members/${a.user.id}`} className="text-[#6ba3c7] hover:underline font-medium">
                        {a.user.fullName ?? a.user.email}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-4 capitalize text-[#2f3437]">{a.auditType.replace("_", " ")}</td>
                  <td className="px-6 py-4">
                    {a.overallScore != null ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(Number(a.overallScore))}`}>
                        {Number(a.overallScore).toFixed(1)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/admin/audits/${a.id}`} className="text-[#6ba3c7] hover:underline text-xs font-medium">
                      View Report →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
