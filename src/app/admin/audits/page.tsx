"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowPathIcon, PlayIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

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

export default function AuditsPage() {
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [launching, setLaunching] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchAudits();
    fetchBatchStatus();
  }, []);

  // Poll for batch progress while running
  useEffect(() => {
    if (batchStatus?.status === "running") {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchBatchStatus, 3000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        // Refresh audit list when batch completes
        if (batchStatus?.status === "complete") fetchAudits();
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [batchStatus?.status]);

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
      }
    } finally {
      setLaunching(false);
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

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">Audits</h1>
          <p className="text-[#1e2a38]/60 mt-1">{audits.length} total audit{audits.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={handleRunAllMonthly}
          disabled={launching || isRunning}
          className="flex items-center gap-2 bg-[#1e2a38] hover:bg-[#2a3a50] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
        >
          <PlayIcon className={`w-4 h-4 ${isRunning ? "animate-pulse" : ""}`} />
          {isRunning ? `Running… ${batchStatus.current}/${batchStatus.total}` : launching ? "Starting…" : "Run All Monthly Audits"}
        </button>
      </div>

      {/* Batch progress */}
      {isRunning && (
        <div className="mb-4 bg-white border border-[#3dc3ff]/30 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-[#1e2a38]">Monthly batch in progress…</p>
            <p className="text-sm text-[#1e2a38]/50">{batchStatus.current} / {batchStatus.total} members</p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
            <div
              className="bg-[#3dc3ff] h-2 rounded-full transition-all duration-500"
              style={{ width: `${batchStatus.total > 0 ? (batchStatus.current / batchStatus.total) * 100 : 0}%` }}
            />
          </div>
          {batchStatus.results && batchStatus.results.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {batchStatus.results.slice().reverse().map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={
                    r.status === "success" ? "text-green-600" :
                    r.status === "failed" ? "text-[#ff0033]" : "text-[#1e2a38]/40"
                  }>
                    {r.status === "success" ? "✓" : r.status === "failed" ? "✗" : "–"}
                  </span>
                  <span className="text-[#1e2a38]">{r.memberName}</span>
                  {r.reason && <span className="text-[#1e2a38]/40">({r.reason})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Last run summary */}
      {!isRunning && batchStatus?.status === "complete" && batchStatus.completed && (
        <div className="mb-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
            <p className="text-sm font-semibold text-[#1e2a38]">Last batch complete</p>
            <p className="text-xs text-[#1e2a38]/40 ml-auto">{fmtDateTime(batchStatus.completed)}</p>
          </div>
          <p className="text-xs text-[#1e2a38]/60">
            {batchStatus.results?.filter(r => r.status === "success").length ?? 0} audits completed ·{" "}
            {batchStatus.results?.filter(r => r.status === "skipped").length ?? 0} skipped ·{" "}
            {batchStatus.results?.filter(r => r.status === "failed").length ?? 0} failed
          </p>
        </div>
      )}

      {/* Last monthly run from DB */}
      {lastRun && !isRunning && !(batchStatus?.status === "complete") && (
        <div className="mb-4 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-[#1e2a38]/60">
          <span className="font-medium text-[#1e2a38]">Last monthly run:</span>{" "}
          {fmtDateTime(lastRun.date)} —{" "}
          {lastRun.audits_queued} audits completed, {lastRun.skipped_no_new_videos + lastRun.skipped_no_baseline + (lastRun.skipped_no_youtube ?? 0)} skipped
          {lastRun.failures > 0 && `, ${lastRun.failures} failed`}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by member name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3dc3ff] focus:border-transparent outline-none text-[#1e2a38] bg-white text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3dc3ff] outline-none text-[#1e2a38] bg-white text-sm"
        >
          <option value="">All Types</option>
          <option value="baseline">Baseline</option>
          <option value="monthly">Monthly</option>
          <option value="single_video">Single Video</option>
        </select>
        <button onClick={fetchAudits} className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-[#1e2a38] hover:bg-gray-50">
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Date", "Member", "Type", "Score", "Action"].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[#1e2a38]/40">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[#1e2a38]/40">No audits found.</td></tr>
              ) : filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-[#1e2a38]/70">{fmt(a.createdAt)}</td>
                  <td className="px-6 py-4">
                    {a.user ? (
                      <Link href={`/admin/members/${a.user.id}`} className="text-[#3dc3ff] hover:underline font-medium">
                        {a.user.fullName ?? a.user.email}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-4 capitalize text-[#1e2a38]">{a.auditType.replace("_", " ")}</td>
                  <td className="px-6 py-4">
                    {a.overallScore != null ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(a.overallScore)}`}>
                        {a.overallScore.toFixed(1)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/admin/audits/${a.id}`} className="text-[#3dc3ff] hover:underline text-xs font-medium">
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
