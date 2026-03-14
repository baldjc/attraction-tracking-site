"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  EnvelopeIcon,
  ChevronDownIcon,
  PhoneIcon,
} from "@heroicons/react/24/outline";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";

const GHL_LOCATION_ID = "vEIiKAjpBkCDrabeDre7";

const SERVICE_TIERS = [
  { value: "foundations", label: "Foundations" },
  { value: "editing_2", label: "Editing 2" },
  { value: "editing_4", label: "Editing 4" },
  { value: "mastery_2", label: "Mastery 2" },
  { value: "mastery_4", label: "Mastery 4" },
];

const DIMENSIONS = [
  {
    label: "🎯 Channel Strategy",
    principles: ["Avatar Clarity", "Themes Over Topics", "Consistency"],
  },
  {
    label: "🎬 Content Impact",
    principles: [
      "ARC Attention",
      "ARC Revelation",
      "Approve the Click",
      "Title Frameworks",
      "Show Don't Tell",
      "Curiosity Bridges",
    ],
  },
  {
    label: "🤝 Viewer Connection",
    principles: ["Connection Language", "Values Peppering", "Story Proof"],
  },
  {
    label: "📈 Lead Generation",
    principles: ["Lead Magnet System", "Binge Architecture"],
  },
];

function tierColors(tier: string) {
  if (tier === "foundations") return { badge: "bg-[#3dc3ff]/20 text-[#3dc3ff]", dot: "#3dc3ff" };
  if (tier === "editing_2" || tier === "editing_4") return { badge: "bg-amber-100 text-amber-700", dot: "#f59e0b" };
  if (tier === "mastery_2" || tier === "mastery_4") return { badge: "bg-purple-100 text-purple-700", dot: "#7c3aed" };
  return { badge: "bg-gray-100 text-gray-500", dot: "#9ca3af" };
}

function scoreColor(score: number | null | undefined) {
  if (score == null) return "text-gray-400";
  if (score >= 7) return "text-green-600";
  if (score >= 5) return "text-yellow-600";
  return "text-[#ff0033]";
}

function scoreBg(score: number | null | undefined) {
  if (score == null) return "bg-gray-100 text-gray-500";
  if (score >= 7) return "bg-green-100 text-green-700";
  if (score >= 5) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-[#ff0033]";
}

function fmt(date: string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function tierLabel(value: string) {
  return SERVICE_TIERS.find((t) => t.value === value)?.label ?? value;
}

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Notes state
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesUpdated, setNotesUpdated] = useState<string | null>(null);

  // Audit dropdown + job polling (separate state for header vs sidebar)
  const [auditOpenHeader, setAuditOpenHeader] = useState(false);
  const [auditOpenSidebar, setAuditOpenSidebar] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("");
  const [jobMessage, setJobMessage] = useState<string>("");
  const [jobError, setJobError] = useState<string | null>(null);

  const fetchMember = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/members/${id}`);
    const data = await res.json();
    setMember(data.member);
    setNotes(data.member?.coachingNotes ?? "");
    setNotesUpdated(data.member?.coachingNotesUpdatedAt ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchMember();
  }, [fetchMember]);

  async function handleSaveEdit() {
    setSaving(true);
    await fetch(`/api/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editFields),
    });
    await fetchMember();
    setEditing(false);
    setSaving(false);
  }

  async function handleSaveNotes() {
    setNotesSaving(true);
    const res = await fetch(`/api/members/${id}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    const data = await res.json();
    setNotesUpdated(data.member?.coachingNotesUpdatedAt ?? null);
    setNotesSaving(false);
  }

  async function runAudit(auditType: string) {
    setAuditOpenHeader(false);
    setAuditOpenSidebar(false);
    setJobId(null);
    setJobStatus("queued");
    setJobMessage("Queued — waiting to start…");
    setJobError(null);

    const res = await fetch("/api/audits/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: id, auditType }),
    });

    if (!res.ok) {
      const d = await res.json();
      setJobStatus("failed");
      setJobError(d.error ?? "Failed to start audit");
      return;
    }

    const { jobId: newJobId } = await res.json();
    setJobId(newJobId);
  }

  // Poll job status
  useEffect(() => {
    if (!jobId) return;
    const TERMINAL = ["complete", "failed"];
    if (TERMINAL.includes(jobStatus)) return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/audits/jobs/${jobId}`);
      const data = await res.json();
      setJobStatus(data.status);
      setJobMessage(data.message ?? "");
      if (data.status === "failed") {
        setJobError(data.errorMessage ?? "Audit failed");
        clearInterval(interval);
      }
      if (data.status === "complete") {
        clearInterval(interval);
        fetchMember();
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [jobId, jobStatus, fetchMember]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#1e2a38]/40">
        Loading member…
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-20">
        <p className="text-[#1e2a38]/50">Member not found.</p>
        <Link href="/admin/members" className="text-[#3dc3ff] text-sm mt-2 inline-block">
          ← Back to Members
        </Link>
      </div>
    );
  }

  const latestAudit = member.audits?.[0] ?? null;
  const baselineAudit = [...(member.audits ?? [])].reverse().find(
    (a: any) => a.auditType === "baseline"
  );

  const chartData = [...(member.audits ?? [])]
    .reverse()
    .filter((a: any) => a.overallScore != null)
    .map((a: any) => ({
      date: new Date(a.createdAt).toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      }),
      score: Number(a.overallScore?.toFixed(1)),
      type: a.auditType,
    }));

  const latestScores: Record<string, number> =
    typeof latestAudit?.scores === "object" && latestAudit?.scores
      ? (latestAudit.scores as any)
      : {};

  const baselineScores: Record<string, number> =
    typeof baselineAudit?.scores === "object" && baselineAudit?.scores
      ? (baselineAudit.scores as any)
      : {};

  return (
    <div className="max-w-5xl space-y-6">
      {/* Back */}
      <Link
        href="/admin/members"
        className="inline-flex items-center gap-1.5 text-sm text-[#1e2a38]/50 hover:text-[#1e2a38] transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to Members
      </Link>

      {/* AUDIT JOB STATUS BANNER */}
      {jobStatus && (
        <div className={`rounded-xl px-5 py-3.5 flex items-center justify-between gap-4 ${
          jobStatus === "complete" ? "bg-green-50 border border-green-200" :
          jobStatus === "failed" ? "bg-red-50 border border-[#ff0033]/20" :
          "bg-[#3dc3ff]/10 border border-[#3dc3ff]/30"
        }`}>
          <div className="flex items-center gap-3">
            {!["complete", "failed"].includes(jobStatus) && (
              <div className="w-4 h-4 border-2 border-[#3dc3ff] border-t-transparent rounded-full animate-spin shrink-0" />
            )}
            {jobStatus === "complete" && <span className="text-green-600 text-lg">✓</span>}
            {jobStatus === "failed" && <span className="text-[#ff0033] text-lg">✕</span>}
            <span className={`text-sm font-medium ${
              jobStatus === "complete" ? "text-green-700" :
              jobStatus === "failed" ? "text-[#ff0033]" :
              "text-[#1e2a38]"
            }`}>
              {jobStatus === "failed" ? (jobError ?? "Audit failed") : jobMessage}
            </span>
          </div>
          <button onClick={() => { setJobId(null); setJobStatus(""); setJobMessage(""); setJobError(null); }} className="text-xs text-[#1e2a38]/40 hover:text-[#1e2a38]">Dismiss</button>
        </div>
      )}

      {/* HEADER BANNER */}
      <div className="relative rounded-2xl overflow-hidden">
        <div className="h-40 bg-gradient-to-r from-[#1e2a38] via-[#2c4a6e] to-[#3dc3ff]" />
        <div className="absolute inset-0 flex flex-col justify-end p-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {member.fullName || member.email}
              </h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {(member.youtubeChannelName || member.youtubeHandle) && (
                  <span className="text-white/70 text-sm">
                    {member.youtubeChannelName
                      ? member.youtubeHandle && !/^UC[\w-]{22}$/.test(member.youtubeHandle.replace(/^@/, ""))
                        ? `${member.youtubeChannelName} (${member.youtubeHandle})`
                        : member.youtubeChannelName
                      : member.youtubeHandle}
                  </span>
                )}
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${tierColors(member.serviceTier).badge}`}>
                  {tierLabel(member.serviceTier)}
                </span>
              </div>
            </div>
            {member.youtubeChannelUrl && (
              <a
                href={member.youtubeChannelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-white text-[#1e2a38] text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
              >
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                View Channel
              </a>
            )}
          </div>
        </div>
      </div>

      {/* STATS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Current Score",
            value: latestAudit?.overallScore != null
              ? latestAudit.overallScore.toFixed(1)
              : "—",
            colored: true,
            score: latestAudit?.overallScore,
          },
          { label: "Member Since", value: fmt(member.createdAt) },
          { label: "Last Audit", value: fmt(latestAudit?.createdAt) },
          {
            label: "Total Audits",
            value: member.audits?.length ?? 0,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
          >
            <p className="text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider mb-1">
              {stat.label}
            </p>
            <p
              className={`text-2xl font-bold ${
                stat.colored ? scoreColor(stat.score) : "text-[#1e2a38]"
              }`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          {/* MEMBER INFO CARD */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[#1e2a38]">Member Info</h2>
              {!editing ? (
                <button
                  onClick={() => {
                    setEditFields({
                      fullName: member.fullName ?? "",
                      email: member.email ?? "",
                      phone: member.phone ?? "",
                      youtubeChannelUrl: member.youtubeChannelUrl ?? "",
                      youtubeHandle: member.youtubeHandle ?? "",
                      youtubeChannelName: member.youtubeChannelName ?? "",
                      serviceTier: member.serviceTier ?? "foundations",
                      ghlContactId: member.ghlContactId ?? "",
                    });
                    setEditing(true);
                  }}
                  className="flex items-center gap-1.5 text-sm text-[#3dc3ff] hover:text-[#2bb3ef]"
                >
                  <PencilIcon className="w-4 h-4" /> Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium"
                  >
                    <CheckIcon className="w-4 h-4" />
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-4 h-4" /> Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3 text-sm">
              {/* Full Name */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <span className="text-[#1e2a38]/50 w-40 shrink-0">Full Name</span>
                {editing ? (
                  <input value={editFields.fullName ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, fullName: e.target.value }))} className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30" />
                ) : (
                  <span className="text-[#1e2a38]">{member.fullName || <span className="text-gray-400">—</span>}</span>
                )}
              </div>

              {/* Email */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <span className="text-[#1e2a38]/50 w-40 shrink-0">Email</span>
                {editing ? (
                  <input value={editFields.email ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, email: e.target.value }))} className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30" />
                ) : (
                  <span className="text-[#1e2a38]">{member.email || <span className="text-gray-400">—</span>}</span>
                )}
              </div>

              {/* Phone */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <span className="text-[#1e2a38]/50 w-40 shrink-0">Phone</span>
                {editing ? (
                  <input value={editFields.phone ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, phone: e.target.value }))} className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30" placeholder="+1 555 000 0000" />
                ) : (
                  <span className="text-[#1e2a38]">
                    {member.phone ? (
                      <a href={`tel:${member.phone}`} className="text-[#3dc3ff] hover:underline">{member.phone}</a>
                    ) : <span className="text-gray-400">—</span>}
                  </span>
                )}
              </div>

              {/* YouTube Channel */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <span className="text-[#1e2a38]/50 w-40 shrink-0">YouTube Channel</span>
                {editing ? (
                  <div className="flex-1 space-y-1.5">
                    <input value={editFields.youtubeChannelUrl ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, youtubeChannelUrl: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30" placeholder="YouTube URL" />
                    <input value={editFields.youtubeHandle ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, youtubeHandle: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30" placeholder="Handle (@channel)" />
                    <input value={editFields.youtubeChannelName ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, youtubeChannelName: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30" placeholder="Channel name" />
                  </div>
                ) : (
                  <span className="text-[#1e2a38] break-all">
                    {member.youtubeChannelUrl ? (
                      <a href={member.youtubeChannelUrl} target="_blank" rel="noopener noreferrer" className="text-[#3dc3ff] hover:underline flex items-center gap-1">
                        {member.youtubeChannelName
                          ? member.youtubeHandle && !/^UC[\w-]{22}$/.test(member.youtubeHandle.replace(/^@/, ""))
                            ? `${member.youtubeChannelName} (${member.youtubeHandle})`
                            : member.youtubeChannelName
                          : member.youtubeHandle ?? member.youtubeChannelUrl}
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    ) : <span className="text-gray-400">—</span>}
                  </span>
                )}
              </div>

              {/* GHL Contact ID */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <span className="text-[#1e2a38]/50 w-40 shrink-0">GHL Contact ID</span>
                {editing ? (
                  <input value={editFields.ghlContactId ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, ghlContactId: e.target.value }))} className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30" />
                ) : (
                  <span className="text-[#1e2a38] break-all">
                    {member.ghlContactId ? (
                      <a href={`https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${member.ghlContactId}`} target="_blank" rel="noopener noreferrer" className="text-[#3dc3ff] hover:underline">
                        {member.ghlContactId}
                      </a>
                    ) : <span className="text-gray-400">—</span>}
                  </span>
                )}
              </div>

              {/* Membership Level */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <span className="text-[#1e2a38]/50 w-40 shrink-0">Membership Level</span>
                {editing ? (
                  <select
                    value={editFields.serviceTier ?? "foundations"}
                    onChange={(e) => setEditFields((f: any) => ({ ...f, serviceTier: e.target.value }))}
                    className="border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30"
                  >
                    {SERVICE_TIERS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${tierColors(member.serviceTier).badge}`}>
                    {tierLabel(member.serviceTier)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* AUDIT HISTORY */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[#1e2a38]">Audit History</h2>
              <div className="relative">
                <button
                  onClick={() => setAuditOpenHeader((o) => !o)}
                  className="flex items-center gap-1.5 bg-[#3dc3ff] hover:bg-[#2bb3ef] text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
                >
                  Run Audit
                  <ChevronDownIcon className="w-4 h-4" />
                </button>
                {auditOpenHeader && (
                  <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                    {[
                      { label: "Baseline", value: "baseline" },
                      { label: "Monthly", value: "monthly" },
                      { label: "Single Video", value: "single_video" },
                    ].map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => runAudit(value)}
                        className="w-full text-left px-4 py-2.5 text-sm text-[#1e2a38] hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {member.audits?.length === 0 ? (
              <p className="text-sm text-[#1e2a38]/50 text-center py-8">
                No audits yet — use the Run Audit button to generate the first baseline.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">
                        Score
                      </th>
                      <th className="text-right py-2 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">
                        Report
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.audits.map((audit: any) => (
                      <tr key={audit.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-3 pr-4 text-[#1e2a38]/70">{fmt(audit.createdAt)}</td>
                        <td className="py-3 pr-4 capitalize text-[#1e2a38]">
                          {audit.auditType.replace("_", " ")}
                        </td>
                        <td className="py-3 pr-4">
                          {audit.overallScore != null ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(audit.overallScore)}`}
                            >
                              {audit.overallScore.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/admin/audits/${audit.id}`}
                            className="text-[#3dc3ff] hover:underline text-xs"
                          >
                            View Report →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SCORE TREND */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-[#1e2a38] mb-4">Score Trend</h2>
            {chartData.length === 0 ? (
              <p className="text-sm text-[#1e2a38]/50 text-center py-8">
                Scores will appear after the first audit.
              </p>
            ) : chartData.length === 1 ? (
              <div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                    <ReferenceDot
                      x={chartData[0].date}
                      y={chartData[0].score}
                      r={5}
                      fill="#3dc3ff"
                    />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-[#1e2a38]/40 text-center mt-2">
                  More data points will appear after monthly audits.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val: number) => [val.toFixed(1), "Score"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#3dc3ff"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#3dc3ff" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 16-PRINCIPLE BREAKDOWN */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-[#1e2a38] mb-4">
              16-Principle Breakdown
            </h2>
            {!latestAudit ? (
              <p className="text-sm text-[#1e2a38]/50 text-center py-8">
                Scores will appear after the first audit.
              </p>
            ) : (
              <div className="space-y-6">
                {DIMENSIONS.map((dim) => {
                  const dimScores = dim.principles
                    .map((p) => latestScores[p])
                    .filter((s) => s != null);
                  const dimAvg =
                    dimScores.length > 0
                      ? dimScores.reduce((a, b) => a + b, 0) / dimScores.length
                      : null;

                  return (
                    <div key={dim.label}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-[#1e2a38]">{dim.label}</h3>
                        {dimAvg != null && (
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBg(dimAvg)}`}
                          >
                            Avg {dimAvg.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left pb-1.5 text-xs text-[#1e2a38]/40 font-medium">
                              Principle
                            </th>
                            <th className="text-center pb-1.5 text-xs text-[#1e2a38]/40 font-medium">
                              Score
                            </th>
                            <th className="text-center pb-1.5 text-xs text-[#1e2a38]/40 font-medium">
                              Δ Baseline
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {dim.principles.map((principle) => {
                            const score = latestScores[principle];
                            const base = baselineScores[principle];
                            const delta =
                              score != null && base != null ? score - base : null;
                            return (
                              <tr key={principle} className="border-b border-gray-50 last:border-0">
                                <td className="py-2 text-[#1e2a38]">{principle}</td>
                                <td className="py-2 text-center">
                                  {score != null ? (
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(score)}`}
                                    >
                                      {score.toFixed(1)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="py-2 text-center text-xs font-semibold">
                                  {delta == null ? (
                                    <span className="text-gray-400">—</span>
                                  ) : delta > 0 ? (
                                    <span className="text-green-600">+{delta.toFixed(1)}</span>
                                  ) : delta < 0 ? (
                                    <span className="text-[#ff0033]">{delta.toFixed(1)}</span>
                                  ) : (
                                    <span className="text-gray-400">0.0</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* TRACKING LINKS */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[#1e2a38]">Tracking Links</h2>
              <button className="text-sm text-[#3dc3ff] hover:text-[#2bb3ef] font-medium">
                + Create Link
              </button>
            </div>
            {member.links?.length === 0 ? (
              <p className="text-sm text-[#1e2a38]/50 text-center py-6">
                No tracking links yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["Link Name", "Short URL", "Clicks", "Conversions", "Conv. Rate"].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-left py-2 pr-4 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider last:text-right"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {member.links.map((link: any) => {
                      const clicks = link.clicks?.length ?? 0;
                      const conversions = link.clicks?.filter(
                        (c: any) => c.conversion
                      ).length ?? 0;
                      const rate =
                        clicks > 0 ? ((conversions / clicks) * 100).toFixed(1) + "%" : "—";
                      return (
                        <tr key={link.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-3 pr-4 text-[#1e2a38]">{link.name}</td>
                          <td className="py-3 pr-4">
                            <span className="text-[#3dc3ff] font-mono text-xs">
                              /{link.shortCode}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-[#1e2a38]">{clicks}</td>
                          <td className="py-3 pr-4 text-[#1e2a38]">{conversions}</td>
                          <td className="py-3 text-right text-[#1e2a38]">{rate}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* COACHING NOTES */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-[#1e2a38]">Coaching Notes</h2>
              {notesUpdated && (
                <span className="text-xs text-[#1e2a38]/40">
                  Last saved {fmt(notesUpdated)}
                </span>
              )}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="Private coaching notes about this member…"
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#1e2a38] focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30 resize-none"
            />
            <button
              onClick={handleSaveNotes}
              disabled={notesSaving}
              className="mt-2 bg-[#1e2a38] hover:bg-[#2a3a4e] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {notesSaving ? "Saving…" : "Save Notes"}
            </button>
          </div>
        </div>

        {/* RIGHT SIDEBAR — QUICK ACTIONS */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm sticky top-6">
            <h2 className="text-sm font-semibold text-[#1e2a38] mb-4">Quick Actions</h2>
            <div className="space-y-2">
              {/* Run Audit */}
              <div className="relative">
                <button
                  onClick={() => setAuditOpenSidebar((o) => !o)}
                  className="w-full flex items-center justify-between bg-[#3dc3ff] hover:bg-[#2bb3ef] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
                >
                  Run Audit
                  <ChevronDownIcon className="w-4 h-4" />
                </button>
                {auditOpenSidebar && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                    {[
                      { label: "Baseline", value: "baseline" },
                      { label: "Monthly", value: "monthly" },
                      { label: "Single Video", value: "single_video" },
                    ].map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => runAudit(value)}
                        className="w-full text-left px-4 py-2.5 text-sm text-[#1e2a38] hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {member.youtubeChannelUrl && (
                <a
                  href={member.youtubeChannelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-[#1e2a38] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4 text-[#3dc3ff]" />
                  View on YouTube
                </a>
              )}

              <a
                href={`mailto:${member.email}`}
                className="w-full flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-[#1e2a38] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                <EnvelopeIcon className="w-4 h-4 text-[#3dc3ff]" />
                Email Member
              </a>

              {member.phone && (
                <a
                  href={`tel:${member.phone}`}
                  className="w-full flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-[#1e2a38] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  <PhoneIcon className="w-4 h-4 text-[#3dc3ff]" />
                  Call Member
                </a>
              )}

              {member.ghlContactId && (
                <a
                  href={`https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${member.ghlContactId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-[#1e2a38] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4 text-gray-400" />
                  View in GHL
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
