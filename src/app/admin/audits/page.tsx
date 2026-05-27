"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowPathIcon, PlayIcon, CheckCircleIcon, XCircleIcon, ChevronDownIcon, PlusIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface AuditRequestRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  youtubeChannelUrl: string;
  currentYoutubeIncome: string | null;
  desiredYoutubeIncome: string | null;
  status: "pending" | "audited";
  userId: string | null;
  auditId: string | null;
  createdAt: string;
}

interface AuditRow {
  id: string;
  auditType: string;
  overallScore: number | null;
  createdAt: string;
  youtubeVideoId: string | null;
  videosAnalysed: Array<{ videoId: string; title: string }> | null;
  // Present on rows returned by /api/admin/lead-audits — the originating
  // Audit Request, so the row shows that lead's own name + channel even when
  // multiple Audit Requests share an email (and therefore a User).
  auditRequestId?: string;
  leadFullName?: string;
  leadYoutubeChannelUrl?: string;
  user: {
    id: string;
    fullName: string | null;
    email: string;
    role?: string;
    leadStatus?: string | null;
    youtubeChannelThumbnail: string | null;
    youtubeChannelName: string | null;
  } | null;
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
  return "bg-red-100 text-[var(--abv-crimson)]";
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
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as string | undefined;
  const isAdminUser = userRole === "admin";

  const [tab, setTab] = useState<"requests" | "audits" | "lead-audits">("audits");

  const [auditReqs, setAuditReqs] = useState<AuditRequestRow[]>([]);
  const [auditReqsLoading, setAuditReqsLoading] = useState(true);
  const [runningRequestId, setRunningRequestId] = useState<string | null>(null);

  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [leadAudits, setLeadAudits] = useState<AuditRow[]>([]);
  const [leadAuditsLoading, setLeadAuditsLoading] = useState(true);
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

  const [batchOpen, setBatchOpen] = useState(false);

  const isBatchActive = activeJobs.length > 0 || batchStatus?.status === "running" || baselineBatchStatus?.status === "running";

  useEffect(() => {
    if (isBatchActive) setBatchOpen(true);
  }, [isBatchActive]);

  useEffect(() => {
    fetchAuditRequests();
    fetchAudits();
    fetchLeadAudits();
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
        // Also refresh the Lead Audits table — admin-initiated lead audits
        // (and form/GHL submissions) finish as part of the same job queue,
        // so when jobs drain to zero, the lead row should appear with a score.
        fetchLeadAudits();
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

  async function fetchAuditRequests() {
    setAuditReqsLoading(true);
    try {
      const res = await fetch("/api/admin/audit-requests");
      const data = await res.json();
      setAuditReqs(data.requests ?? []);
    } finally {
      setAuditReqsLoading(false);
    }
  }

  async function handleRunAuditRequest(id: string) {
    setRunningRequestId(id);
    try {
      const res = await fetch(`/api/admin/audit-requests/${id}/run`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        alert(data?.error ?? `Failed to run audit (${res.status})`);
      } else {
        await fetchAuditRequests();
        await fetchActiveJobs();
        setTab("audits");
      }
    } finally {
      setRunningRequestId(null);
    }
  }

  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  async function handleDeleteAuditRequest(r: { id: string; fullName: string; email: string }) {
    const label = r.fullName || r.email || "this request";
    if (!confirm(`Delete the audit request for ${label}? Any audit report attached to it will also be removed. This cannot be undone.`)) return;
    setDeletingRequestId(r.id);
    try {
      const res = await fetch(`/api/admin/audit-requests/${r.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err?.error ?? `Failed to delete (${res.status})`);
        return;
      }
      await Promise.all([fetchAuditRequests(), fetchLeadAudits()]);
    } finally {
      setDeletingRequestId(null);
    }
  }

  async function fetchAudits() {
    setLoading(true);
    const res = await fetch("/api/audits");
    const data = await res.json();
    setAudits(data.audits ?? []);
    setLoading(false);
  }

  async function fetchLeadAudits() {
    setLeadAuditsLoading(true);
    try {
      const res = await fetch("/api/admin/lead-audits");
      const data = await res.json();
      setLeadAudits(data.audits ?? []);
    } finally {
      setLeadAuditsLoading(false);
    }
  }

  const [busyAuditId, setBusyAuditId] = useState<string | null>(null);

  async function handleDeleteAudit(a: AuditRow, isLead: boolean) {
    const label = a.user?.fullName ?? a.user?.email ?? "this audit";
    if (!confirm(`Delete audit for ${label}? This cannot be undone.`)) return;
    setBusyAuditId(a.id);
    try {
      const res = await fetch(`/api/audits/${a.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to delete audit: ${err.error ?? res.statusText}`);
        return;
      }
      if (isLead) await fetchLeadAudits(); else await fetchAudits();
    } finally {
      setBusyAuditId(null);
    }
  }

  async function handleRerunAudit(a: AuditRow, isLead: boolean) {
    if (!a.user?.id) {
      alert("Cannot re-run: this audit has no associated member.");
      return;
    }
    const label = a.user?.fullName ?? a.user?.email ?? "this member";
    if (!confirm(`Re-run ${a.auditType.replace("_", " ")} audit for ${label}? The current audit will be deleted and a fresh one will start.`)) return;
    setBusyAuditId(a.id);
    try {
      const delRes = await fetch(`/api/audits/${a.id}`, { method: "DELETE" });
      if (!delRes.ok) {
        const err = await delRes.json().catch(() => ({}));
        alert(`Failed to delete previous audit: ${err.error ?? delRes.statusText}`);
        return;
      }
      const videoId = a.auditType === "single_video" ? a.videosAnalysed?.[0]?.videoId : undefined;
      const runRes = await fetch("/api/audits/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: a.user.id, auditType: a.auditType, videoId }),
      });
      if (!runRes.ok) {
        const err = await runRes.json().catch(() => ({}));
        alert(`Audit deleted, but re-run failed: ${err.error ?? runRes.statusText}`);
      }
      if (isLead) await fetchLeadAudits(); else await fetchAudits();
      fetchActiveJobs();
    } finally {
      setBusyAuditId(null);
    }
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

  const pendingCount = auditReqs.filter((r) => r.status === "pending").length;

  // Manual "Add Request" modal state
  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const emptyForm = {
    fullName: "",
    email: "",
    youtubeChannelUrl: "",
    phone: "",
    currentYoutubeIncome: "",
    desiredYoutubeIncome: "",
  };
  const [addForm, setAddForm] = useState(emptyForm);

  function openAddModal() {
    setAddForm(emptyForm);
    setAddError(null);
    setAddOpen(true);
  }

  async function submitAddRequest(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAddSubmitting(true);
    try {
      const res = await fetch("/api/admin/audit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "Failed to create audit request.");
        return;
      }
      setAddOpen(false);
      await fetchAuditRequests();
    } finally {
      setAddSubmitting(false);
    }
  }

  // "Add Lead Audit" modal — creates a lead request AND immediately kicks off
  // the same backend audit job that GHL/form submissions trigger.
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [addLeadSubmitting, setAddLeadSubmitting] = useState(false);
  const [addLeadError, setAddLeadError] = useState<string | null>(null);
  const [addLeadForm, setAddLeadForm] = useState(emptyForm);

  function openAddLeadModal() {
    setAddLeadForm(emptyForm);
    setAddLeadError(null);
    setAddLeadOpen(true);
  }

  async function submitAddLeadAudit(e: React.FormEvent) {
    e.preventDefault();
    setAddLeadError(null);
    setAddLeadSubmitting(true);
    try {
      // 1. Create the audit request (or reuse an existing pending one for this email).
      const createRes = await fetch("/api/admin/audit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addLeadForm),
      });
      const createData = await createRes.json();
      let requestId: string | null = null;
      if (createRes.ok) {
        requestId = createData?.request?.id ?? null;
      } else if (createRes.status === 409 && createData?.existingId) {
        // A pending request already exists for this email — reuse it.
        requestId = createData.existingId;
      } else {
        setAddLeadError(createData?.error ?? "Failed to create lead audit.");
        return;
      }
      if (!requestId) {
        setAddLeadError("Could not determine audit request ID.");
        return;
      }
      // 2. Kick off the audit job (same path used by Run/Re-run on the Requests tab).
      const runRes = await fetch(`/api/admin/audit-requests/${requestId}/run`, {
        method: "POST",
      });
      if (!runRes.ok) {
        const runData = await runRes.json().catch(() => ({}));
        setAddLeadError(runData?.error ?? "Lead created, but failed to start the audit. Try Re-run on the row.");
        await fetchLeadAudits();
        return;
      }
      setAddLeadOpen(false);
      await Promise.all([fetchLeadAudits(), fetchActiveJobs()]);
    } finally {
      setAddLeadSubmitting(false);
    }
  }

  // Webhook activity panel state
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<Array<{
    id: string;
    status: "success" | "deduplicated" | "rejected_bad_token" | "rejected_missing_fields" | "error";
    email: string | null;
    message: string | null;
    payload: any;
    createdAt: string;
  }>>([]);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [expandedPayloadId, setExpandedPayloadId] = useState<string | null>(null);

  async function fetchWebhookLogs() {
    setWebhookLoading(true);
    try {
      const res = await fetch("/api/admin/webhook-logs");
      const data = await res.json();
      setWebhookLogs(data.logs ?? []);
    } finally {
      setWebhookLoading(false);
    }
  }

  function toggleWebhookPanel() {
    const next = !webhookOpen;
    setWebhookOpen(next);
    if (next && webhookLogs.length === 0) fetchWebhookLogs();
  }

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  const webhookStatusBadge: Record<string, { label: string; cls: string; icon?: typeof ExclamationTriangleIcon }> = {
    success: { label: "Success", cls: "bg-green-100 text-green-700" },
    deduplicated: { label: "Deduplicated", cls: "bg-gray-100 text-gray-600" },
    rejected_bad_token: { label: "Bad token", cls: "bg-red-100 text-red-700", icon: ExclamationTriangleIcon },
    rejected_missing_fields: { label: "Missing fields", cls: "bg-amber-100 text-amber-700" },
    error: { label: "Error", cls: "bg-red-100 text-red-700", icon: ExclamationTriangleIcon },
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[var(--abv-text)]">Audits</h1>
      </div>

      {/* Tab bar */}
      <div className="inline-flex items-center gap-1 bg-[#eeecea] rounded-xl p-1 mb-6">
        <button
          onClick={() => setTab("audits")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === "audits"
              ? "bg-white text-[var(--abv-text)] shadow-sm"
              : "text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]"
          }`}
        >
          Member Audits
          <span className="ml-2 text-xs text-[var(--abv-text)]/40 font-normal">{audits.length}</span>
        </button>
        <button
          onClick={() => setTab("lead-audits")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === "lead-audits"
              ? "bg-white text-[var(--abv-text)] shadow-sm"
              : "text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]"
          }`}
        >
          Lead Audits
          <span className="ml-2 text-xs text-[var(--abv-text)]/40 font-normal">{leadAudits.length}</span>
        </button>
        <button
          onClick={() => setTab("requests")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === "requests"
              ? "bg-white text-[var(--abv-text)] shadow-sm"
              : "text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]"
          }`}
        >
          Audit Requests
          {pendingCount > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-[var(--abv-dark)] text-white text-xs font-bold">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Lead Audits tab */}
      {tab === "lead-audits" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-[var(--abv-text)]/60">
              {leadAudits.length} lead audit{leadAudits.length !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchLeadAudits}
                className="flex items-center gap-1.5 text-xs text-[var(--abv-text)]/50 hover:text-[var(--abv-text)] transition-colors"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
              </button>
              {isAdminUser && (
                <button
                  onClick={openAddLeadModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors"
                >
                  <PlusIcon className="w-3.5 h-3.5" /> Add Lead Audit
                </button>
              )}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-amber-50 border-b border-amber-200">
                    {["Date", "Lead", "Score", "Lead Status", "Action"].map((h) => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-amber-900/70 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leadAuditsLoading ? (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-[var(--abv-text)]/40">Loading…</td></tr>
                  ) : leadAudits.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-[var(--abv-text)]/40">No lead audits yet.</td></tr>
                  ) : leadAudits.map((a) => (
                    <tr key={a.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="px-6 py-4 text-[var(--abv-text)]/70 whitespace-nowrap">{fmt(a.createdAt)}</td>
                      <td className="px-6 py-4">
                        {a.user ? (
                          <Link href={`/admin/members/${a.user.id}`} className="text-amber-700 hover:underline font-medium whitespace-nowrap">
                            {a.leadFullName ?? a.user.fullName ?? a.user.email}
                          </Link>
                        ) : (
                          <span className="font-medium text-[var(--abv-text)] whitespace-nowrap">{a.leadFullName ?? "—"}</span>
                        )}
                        {a.leadYoutubeChannelUrl ? (
                          <a
                            href={a.leadYoutubeChannelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-[var(--abv-azure)] hover:underline mt-0.5 truncate max-w-[260px]"
                          >
                            {a.leadYoutubeChannelUrl}
                          </a>
                        ) : a.user?.youtubeChannelName ? (
                          <p className="text-xs text-[var(--abv-text)]/50 mt-0.5">{a.user.youtubeChannelName}</p>
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        {a.overallScore != null ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(Number(a.overallScore))}`}>
                            {Number(a.overallScore).toFixed(1)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
                          {a.user?.leadStatus ?? "New"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 whitespace-nowrap">
                          <Link href={`/admin/audits/${a.id}`} className="text-amber-700 hover:underline text-xs font-medium">
                            View Lead Report →
                          </Link>
                          <button
                            onClick={() => handleRerunAudit(a, true)}
                            disabled={busyAuditId === a.id || !a.user?.id}
                            className="flex items-center gap-1 text-xs font-medium text-[var(--abv-text)]/60 hover:text-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            title="Delete this audit and run a fresh one"
                          >
                            <ArrowPathIcon className="w-3.5 h-3.5" />
                            {busyAuditId === a.id ? "Working…" : "Re-run"}
                          </button>
                          <button
                            onClick={() => handleDeleteAudit(a, true)}
                            disabled={busyAuditId === a.id}
                            className="text-xs font-medium text-red-600/70 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Audit Requests tab */}
      {tab === "requests" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-[var(--abv-text)]/60">{auditReqs.length} request{auditReqs.length !== 1 ? "s" : ""}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchAuditRequests}
                className="flex items-center gap-1.5 text-xs text-[var(--abv-text)]/50 hover:text-[var(--abv-text)] transition-colors"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
              </button>
              <button
                onClick={openAddModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--abv-dark)] hover:bg-[#2ab0ec] text-white transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" /> Add Request Manually
              </button>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["Date", "Lead", "YouTube Channel", "Current Income", "Desired Income", "Status", "Action"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-[var(--abv-text)]/60 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {auditReqsLoading ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-[var(--abv-text)]/40">Loading…</td></tr>
                  ) : auditReqs.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-[var(--abv-text)]/40">No audit requests yet.</td></tr>
                  ) : auditReqs.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-[var(--abv-text)]/60 whitespace-nowrap text-xs">{fmt(r.createdAt)}</td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-[var(--abv-text)]">{r.fullName}</p>
                        <p className="text-xs text-[var(--abv-text)]/50">{r.email}</p>
                        {r.phone && <p className="text-xs text-[var(--abv-text)]/40">{r.phone}</p>}
                      </td>
                      <td className="px-5 py-3 max-w-[220px]">
                        <a
                          href={r.youtubeChannelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--abv-azure)] hover:underline text-xs truncate block"
                        >
                          {r.youtubeChannelUrl}
                        </a>
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--abv-text)]/70 whitespace-nowrap">{r.currentYoutubeIncome ?? "—"}</td>
                      <td className="px-5 py-3 text-xs text-[var(--abv-text)]/70 whitespace-nowrap">{r.desiredYoutubeIncome ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          r.status === "audited"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {r.status === "audited" ? "Audited" : "Pending"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {r.status === "audited" && r.auditId && (
                            <Link href={`/admin/audits/${r.auditId}`} className="text-[var(--abv-azure)] hover:underline text-xs font-medium">
                              View Report →
                            </Link>
                          )}
                          {r.status === "audited" && !r.auditId && r.userId && (
                            <Link href={`/admin/members/${r.userId}`} className="text-[var(--abv-azure)] hover:underline text-xs font-medium">
                              View Member →
                            </Link>
                          )}
                          <button
                            onClick={() => handleRunAuditRequest(r.id)}
                            disabled={runningRequestId === r.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors whitespace-nowrap ${
                              r.status === "audited"
                                ? "border border-[var(--abv-azure)]/40 text-[var(--abv-azure)] hover:bg-[var(--abv-dark)]/10"
                                : "bg-[var(--abv-dark)] hover:bg-[#2ab0ec] text-white"
                            }`}
                            title={r.status === "audited" ? "Delete previous audit and run a fresh one against the channel as it is right now" : undefined}
                          >
                            {r.status === "audited" ? (
                              <ArrowPathIcon className="w-3 h-3" />
                            ) : (
                              <PlayIcon className="w-3 h-3" />
                            )}
                            {runningRequestId === r.id
                              ? (r.status === "audited" ? "Re-running…" : "Starting…")
                              : (r.status === "audited" ? "Re-run Audit" : "Run Audit")}
                          </button>
                          <button
                            onClick={() => handleDeleteAuditRequest(r)}
                            disabled={deletingRequestId === r.id}
                            className="text-xs font-medium text-red-600/70 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            title="Delete this request (and its audit report, if any)"
                          >
                            {deletingRequestId === r.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Webhook Activity panel */}
          <div className="mt-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={toggleWebhookPanel}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--abv-text)]">Webhook Activity</h2>
                <span className="text-xs text-[var(--abv-text)]/40">Last 50 GHL → backend calls</span>
              </div>
              <ChevronDownIcon className={`w-4 h-4 text-[var(--abv-text)]/40 transition-transform ${webhookOpen ? "rotate-180" : ""}`} />
            </button>
            {webhookOpen && (
              <div className="border-t border-gray-200">
                <div className="flex items-center justify-end px-5 py-2 border-b border-gray-100">
                  <button
                    onClick={fetchWebhookLogs}
                    className="flex items-center gap-1.5 text-xs text-[var(--abv-text)]/50 hover:text-[var(--abv-text)] transition-colors"
                  >
                    <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
                  </button>
                </div>
                {webhookLoading ? (
                  <div className="px-5 py-8 text-center text-sm text-[var(--abv-text)]/40">Loading…</div>
                ) : webhookLogs.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-[var(--abv-text)]/40">No webhook activity yet.</div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {webhookLogs.map((log) => {
                      const cfg = webhookStatusBadge[log.status] ?? { label: log.status, cls: "bg-gray-100 text-gray-600" };
                      const Icon = cfg.icon;
                      const expanded = expandedPayloadId === log.id;
                      return (
                        <li key={log.id} className="px-5 py-3">
                          <div className="flex items-start gap-3 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
                              {Icon && <Icon className="w-3 h-3" />}
                              {cfg.label}
                            </span>
                            <span className="text-xs text-[var(--abv-text)]/50 whitespace-nowrap">{relativeTime(log.createdAt)}</span>
                            {log.email && <span className="text-xs text-[var(--abv-text)]/70">{log.email}</span>}
                            <span className="text-xs text-[var(--abv-text)]/60 flex-1 min-w-[200px]">{log.message ?? "—"}</span>
                            <button
                              onClick={() => setExpandedPayloadId(expanded ? null : log.id)}
                              className="text-xs text-[var(--abv-azure)] hover:underline whitespace-nowrap"
                            >
                              {expanded ? "Hide payload" : "View payload"}
                            </button>
                          </div>
                          {expanded && (
                            <pre className="mt-2 text-[11px] bg-gray-50 border border-gray-200 rounded-md p-3 overflow-x-auto text-[var(--abv-text)]/80 whitespace-pre-wrap break-words">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Request Manually modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !addSubmitting && setAddOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitAddRequest}
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
          >
            <div>
              <h2 className="text-lg font-bold text-[var(--abv-text)]">Add Audit Request</h2>
              <p className="text-xs text-[var(--abv-text)]/50 mt-0.5">Manually create a lead request, then click Run Audit on the row.</p>
            </div>
            {addError && (
              <div className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-md px-3 py-2">{addError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Full name *</label>
                <input
                  required
                  value={addForm.fullName}
                  onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Email *</label>
                <input
                  required
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">YouTube channel URL *</label>
                <input
                  required
                  pattern=".*(youtube\.com|youtu\.be).*"
                  title="Must contain youtube.com or youtu.be"
                  placeholder="https://youtube.com/@yourhandle"
                  value={addForm.youtubeChannelUrl}
                  onChange={(e) => setAddForm({ ...addForm, youtubeChannelUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Phone</label>
                <input
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Current YT income</label>
                  <input
                    value={addForm.currentYoutubeIncome}
                    onChange={(e) => setAddForm({ ...addForm, currentYoutubeIncome: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Desired YT income</label>
                  <input
                    value={addForm.desiredYoutubeIncome}
                    onChange={(e) => setAddForm({ ...addForm, desiredYoutubeIncome: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                disabled={addSubmitting}
                className="px-3 py-1.5 text-sm text-[var(--abv-text)]/70 hover:text-[var(--abv-text)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addSubmitting}
                className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-[var(--abv-dark)] hover:bg-[#2ab0ec] text-white disabled:opacity-50"
              >
                {addSubmitting ? "Creating…" : "Create Request"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Lead Audit modal — creates a lead request and immediately runs the audit */}
      {addLeadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !addLeadSubmitting && setAddLeadOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitAddLeadAudit}
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
          >
            <div>
              <h2 className="text-lg font-bold text-[var(--abv-text)]">Add Lead Audit</h2>
              <p className="text-xs text-[var(--abv-text)]/50 mt-0.5">Kicks off the same audit pipeline as a form submission.</p>
            </div>
            {addLeadError && (
              <div className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-md px-3 py-2">{addLeadError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Lead name *</label>
                <input
                  required
                  value={addLeadForm.fullName}
                  onChange={(e) => setAddLeadForm({ ...addLeadForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Email *</label>
                <input
                  required
                  type="email"
                  value={addLeadForm.email}
                  onChange={(e) => setAddLeadForm({ ...addLeadForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Phone</label>
                <input
                  value={addLeadForm.phone}
                  onChange={(e) => setAddLeadForm({ ...addLeadForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">YouTube channel URL *</label>
                <input
                  required
                  pattern=".*(youtube\.com|youtu\.be).*"
                  title="Must contain youtube.com or youtu.be"
                  placeholder="https://youtube.com/@yourhandle"
                  value={addLeadForm.youtubeChannelUrl}
                  onChange={(e) => setAddLeadForm({ ...addLeadForm, youtubeChannelUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">GCI bracket</label>
                  <input
                    placeholder="e.g. $100k–$250k"
                    value={addLeadForm.currentYoutubeIncome}
                    onChange={(e) => setAddLeadForm({ ...addLeadForm, currentYoutubeIncome: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Desired GCI</label>
                  <input
                    placeholder="e.g. $500k"
                    value={addLeadForm.desiredYoutubeIncome}
                    onChange={(e) => setAddLeadForm({ ...addLeadForm, desiredYoutubeIncome: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddLeadOpen(false)}
                disabled={addLeadSubmitting}
                className="px-3 py-1.5 text-sm text-[var(--abv-text)]/70 hover:text-[var(--abv-text)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addLeadSubmitting}
                className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
              >
                {addLeadSubmitting ? "Starting audit…" : "Run Lead Audit"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Member Audits tab */}
      {tab === "audits" && (
      <div>

      {/* Batch Operations Panel — collapsible */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        {/* Panel header — always visible */}
        <button
          onClick={() => setBatchOpen(!batchOpen)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[var(--abv-text)]">Batch Operations</span>
            {isBatchActive && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                {activeJobs.length} job{activeJobs.length !== 1 ? "s" : ""} running
              </span>
            )}
            {!isBatchActive && (lastRun || baselineLastRun) && (
              <span className="text-xs text-[var(--abv-text)]/40">
                Last run: {new Date((lastRun?.date || baselineLastRun?.date)!).toLocaleDateString("en-CA")}
              </span>
            )}
          </div>
          <ChevronDownIcon className={`w-4 h-4 text-[var(--abv-text)]/40 transition-transform duration-200 ${batchOpen ? "rotate-180" : ""}`} />
        </button>

        {/* Panel content — collapsible */}
        {batchOpen && (
          <div className="border-t border-gray-100 px-5 py-4 space-y-4">
            {/* Run buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleRunAllBaseline}
                disabled={baselineLaunching || isBaselineRunning || isRunning}
                className="flex items-center gap-2 bg-[var(--abv-dark)] hover:bg-[#2ab0ec] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
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

            {/* Active Jobs section */}
            {activeJobs.length > 0 && (
              <div className="bg-white border border-[var(--abv-azure)]/30 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--abv-azure)]/20 bg-[#e8f7ff]/40">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[var(--abv-dark)] animate-pulse" />
                    <span className="text-sm font-semibold text-[var(--abv-text)]">
                      {activeJobs.length} Audit{activeJobs.length !== 1 ? "s" : ""} In Progress
                    </span>
                  </div>
                  <button
                    onClick={fetchActiveJobs}
                    className="text-xs text-[var(--abv-text)]/50 hover:text-[var(--abv-text)] flex items-center gap-1"
                  >
                    <ArrowPathIcon className="w-3 h-3" /> Refresh
                  </button>
                </div>
                <div className="divide-y divide-gray-100">
                  {activeJobs.map((job) => (
                    <div key={job.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="w-4 h-4 border-2 border-[var(--abv-azure)] border-t-transparent rounded-full animate-spin shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {job.user ? (
                            <Link
                              href={`/admin/members/${job.user.id}`}
                              className="text-sm font-medium text-[var(--abv-azure)] hover:underline truncate"
                            >
                              {job.user.fullName ?? job.user.email}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-[var(--abv-text)]/60">Unknown member</span>
                          )}
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[#111]/10 text-[var(--abv-text)]/60 capitalize shrink-0">
                            {job.auditType.replace("_", " ")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-[var(--abv-text)]/50">{job.message}</span>
                          <span className="text-xs text-[var(--abv-text)]/30">·</span>
                          <span className="text-xs text-[var(--abv-text)]/40">{elapsedLabel(job.createdAt)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelJob(job.id)}
                        disabled={cancellingJobId === job.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-[var(--abv-crimson)] hover:bg-red-100 disabled:opacity-50 transition-colors shrink-0"
                      >
                        <XCircleIcon className="w-3.5 h-3.5" />
                        {cancellingJobId === job.id ? "Cancelling…" : "Cancel"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly batch progress */}
            {isRunning && (
              <div className="bg-white border border-[var(--abv-azure)]/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-[var(--abv-text)]">Monthly batch in progress…</p>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-[var(--abv-text)]/50">{batchStatus.current} / {batchStatus.total} members</p>
                    <button onClick={dismissMonthlyBatch} className="text-xs text-[var(--abv-text)]/40 hover:text-[var(--abv-crimson)] transition-colors" title="Dismiss">✕</button>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                  <div
                    className="bg-[var(--abv-dark)] h-2 rounded-full transition-all duration-500"
                    style={{ width: `${batchStatus.total > 0 ? (batchStatus.current / batchStatus.total) * 100 : 0}%` }}
                  />
                </div>
                {batchStatus.results && batchStatus.results.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {batchStatus.results.slice().reverse().map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={r.status === "success" ? "text-green-600" : r.status === "failed" ? "text-[var(--abv-crimson)]" : "text-[var(--abv-text)]/40"}>
                          {r.status === "success" ? "✓" : r.status === "failed" ? "✗" : "–"}
                        </span>
                        <span className="text-[var(--abv-text)]">{r.memberName}</span>
                        {r.reason && <span className="text-[var(--abv-text)]/40">({r.reason})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Monthly batch summary */}
            {!isRunning && batchStatus?.status === "complete" && batchStatus.completed && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
                  <p className="text-sm font-semibold text-[var(--abv-text)]">Last monthly batch complete</p>
                  <p className="text-xs text-[var(--abv-text)]/40 ml-auto">{fmtDateTime(batchStatus.completed)}</p>
                </div>
                <p className="text-xs text-[var(--abv-text)]/60">
                  {batchStatus.results?.filter(r => r.status === "success").length ?? 0} audits completed ·{" "}
                  {batchStatus.results?.filter(r => r.status === "skipped").length ?? 0} skipped ·{" "}
                  {batchStatus.results?.filter(r => r.status === "failed").length ?? 0} failed
                </p>
              </div>
            )}

            {/* Last monthly run from DB */}
            {lastRun && !isRunning && !(batchStatus?.status === "complete") && (
              <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-[var(--abv-text)]/60">
                <span className="font-medium text-[var(--abv-text)]">Last monthly run:</span>{" "}
                {fmtDateTime(lastRun.date)} —{" "}
                {lastRun.audits_queued} audits completed, {lastRun.skipped_no_new_videos + lastRun.skipped_no_baseline + (lastRun.skipped_no_youtube ?? 0)} skipped
                {lastRun.failures > 0 && `, ${lastRun.failures} failed`}
              </div>
            )}

            {/* Baseline batch progress */}
            {isBaselineRunning && (
              <div className="bg-white border border-[var(--abv-azure)]/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-[var(--abv-text)]">Baseline batch in progress…</p>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-[var(--abv-text)]/50">{baselineBatchStatus!.current} / {baselineBatchStatus!.total} members</p>
                    <button onClick={dismissBaselineBatch} className="text-xs text-[var(--abv-text)]/40 hover:text-[var(--abv-crimson)] transition-colors" title="Dismiss">✕</button>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                  <div
                    className="bg-[var(--abv-dark)] h-2 rounded-full transition-all duration-500"
                    style={{ width: `${baselineBatchStatus!.total > 0 ? (baselineBatchStatus!.current / baselineBatchStatus!.total) * 100 : 0}%` }}
                  />
                </div>
                {baselineBatchStatus!.results && baselineBatchStatus!.results.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {baselineBatchStatus!.results.slice().reverse().map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={r.status === "success" ? "text-green-600" : r.status === "failed" ? "text-[var(--abv-crimson)]" : "text-[var(--abv-text)]/40"}>
                          {r.status === "success" ? "✓" : r.status === "failed" ? "✗" : "–"}
                        </span>
                        <span className="text-[var(--abv-text)]">{r.memberName}</span>
                        {r.reason && <span className="text-[var(--abv-text)]/40">({r.reason})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Baseline batch summary */}
            {!isBaselineRunning && baselineBatchStatus?.status === "complete" && baselineBatchStatus.completed && (
              <div className="bg-white border border-[var(--abv-azure)]/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircleIcon className="w-4 h-4 text-[var(--abv-azure)] shrink-0" />
                  <p className="text-sm font-semibold text-[var(--abv-text)]">Baseline batch complete</p>
                  <p className="text-xs text-[var(--abv-text)]/40 ml-auto">{fmtDateTime(baselineBatchStatus.completed)}</p>
                </div>
                <p className="text-xs text-[var(--abv-text)]/60">
                  {baselineBatchStatus.results?.filter(r => r.status === "success").length ?? 0} new baselines generated ·{" "}
                  {baselineBatchStatus.results?.filter(r => r.status === "failed").length ?? 0} failed
                </p>
              </div>
            )}

            {/* Last baseline run from DB */}
            {baselineLastRun && !isBaselineRunning && !(baselineBatchStatus?.status === "complete") && (
              <div className="px-4 py-3 bg-[#e8f7ff]/60 border border-[var(--abv-azure)]/20 rounded-lg text-xs text-[var(--abv-text)]/60">
                <span className="font-medium text-[var(--abv-text)]">Last baseline run:</span>{" "}
                {fmtDateTime(baselineLastRun.date)} — {baselineLastRun.generated} baseline{baselineLastRun.generated !== 1 ? "s" : ""} generated
                {baselineLastRun.failures > 0 && `, ${baselineLastRun.failures} failed`}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by member name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--abv-azure)] focus:border-transparent outline-none text-[var(--abv-text)] bg-white text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--abv-azure)] outline-none text-[var(--abv-text)] bg-white text-sm"
        >
          <option value="">All Types</option>
          <option value="baseline">Baseline</option>
          <option value="monthly">Monthly</option>
          <option value="single_video">Single Video</option>
        </select>
        <button
          onClick={() => { fetchAudits(); fetchBatchStatus(); fetchBaselineBatchStatus(); fetchActiveJobs(); }}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-[var(--abv-text)] hover:bg-gray-50"
        >
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Date", "Member", "Audit", "Score", "Action"].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-[var(--abv-text)]/60 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[var(--abv-text)]/40">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[var(--abv-text)]/40">No audits found.</td></tr>
              ) : filtered.map((a) => {
                const isSingleVideo = a.auditType === "single_video";
                const firstVideo = (a.videosAnalysed as any)?.[0] ?? null;
                const videoYtId = firstVideo?.videoId ?? null;
                const videoTitle = firstVideo?.title ?? null;
                const thumbUrl = videoYtId
                  ? `https://img.youtube.com/vi/${videoYtId}/mqdefault.jpg`
                  : null;
                const channelThumb = a.user?.youtubeChannelThumbnail ?? null;

                return (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-[var(--abv-text)]/70 whitespace-nowrap">{fmt(a.createdAt)}</td>
                  <td className="px-6 py-4">
                    {a.user ? (
                      <Link href={`/admin/members/${a.user.id}`} className="text-[var(--abv-azure)] hover:underline font-medium whitespace-nowrap">
                        {a.user.fullName ?? a.user.email}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {/* Thumbnail / avatar */}
                      {isSingleVideo ? (
                        thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={videoTitle ?? "Video"}
                            className="w-[72px] h-[41px] rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-[72px] h-[41px] rounded bg-gray-100 shrink-0" />
                        )
                      ) : channelThumb ? (
                        <img
                          src={channelThumb}
                          alt={a.user?.youtubeChannelName ?? "Channel"}
                          className="w-[41px] h-[41px] rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className={`w-[41px] h-[41px] rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          a.auditType === "baseline"
                            ? "bg-[var(--abv-dark)]/15 text-[var(--abv-azure)]"
                            : "bg-purple-100 text-purple-600"
                        }`}>
                          {a.auditType === "baseline" ? "B" : "M"}
                        </div>
                      )}
                      {/* Type label + video title */}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--abv-text)]/60 uppercase tracking-wide">
                          {a.auditType.replace("_", " ")}
                        </p>
                        {isSingleVideo && videoTitle && (
                          <p className="text-sm text-[var(--abv-text)] mt-0.5 line-clamp-2 max-w-[280px]">
                            {videoTitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {a.overallScore != null ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(Number(a.overallScore))}`}>
                        {Number(a.overallScore).toFixed(1)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <Link href={`/admin/audits/${a.id}`} className="text-[var(--abv-azure)] hover:underline text-xs font-medium">
                        View Report →
                      </Link>
                      <button
                        onClick={() => handleRerunAudit(a, false)}
                        disabled={busyAuditId === a.id || !a.user?.id}
                        className="flex items-center gap-1 text-xs font-medium text-[var(--abv-text)]/60 hover:text-[var(--abv-azure)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Delete this audit and run a fresh one"
                      >
                        <ArrowPathIcon className="w-3.5 h-3.5" />
                        {busyAuditId === a.id ? "Working…" : "Re-run"}
                      </button>
                      <button
                        onClick={() => handleDeleteAudit(a, false)}
                        disabled={busyAuditId === a.id}
                        className="text-xs font-medium text-red-600/70 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>
      )}
    </div>
  );
}
