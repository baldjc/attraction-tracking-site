"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
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

const GHL_LOCATION_ID = process.env.NEXT_PUBLIC_GHL_LOCATION_ID ?? "";

const SERVICE_TIERS = [
  { value: "foundations", label: "Foundations" },
  { value: "editing_2", label: "Editing 2" },
  { value: "editing_4", label: "Editing 4" },
  { value: "mastery_2", label: "Mastery 2" },
  { value: "mastery_4", label: "Mastery 4" },
];

const PRINCIPLE_LABELS: Record<string, string> = {
  avatar_clarity: "Avatar Clarity",
  themes_over_topics: "Themes Over Topics",
  arc_attention: "ARC Attention",
  arc_revelation: "ARC Revelation",
  arc_connection: "ARC Connection",
  title_frameworks: "Title Frameworks",
  approve_the_click: "Approve the Click",
  lead_magnet_system: "Lead Magnet System",
  curiosity_bridges: "Curiosity Bridges",
  show_dont_tell: "Show Don't Tell",
  values_peppering: "Values Peppering",
  connection_language: "Connection Language",
  story_proof: "Story Proof",
  grade_5_language: "Grade 5 Language",
  binge_architecture: "Binge Architecture",
  consistency: "Consistency",
};

const DIMENSIONS = [
  {
    label: "🎯 Channel Strategy",
    keys: ["avatar_clarity", "themes_over_topics", "consistency"],
  },
  {
    label: "🎬 Content Impact",
    keys: ["arc_attention", "arc_revelation", "approve_the_click", "title_frameworks", "curiosity_bridges"],
  },
  {
    label: "🤝 Viewer Connection",
    keys: ["connection_language", "values_peppering", "story_proof", "grade_5_language"],
  },
  {
    label: "📈 Lead Generation",
    keys: ["lead_magnet_system", "binge_architecture"],
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
  const { data: sessionData } = useSession();
  const currentRole = (sessionData?.user as any)?.role ?? "admin";
  const isEditorRole = currentRole === "editor";

  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Audit deletion
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingAuditId, setDeletingAuditId] = useState<string | null>(null);

  // Member deletion
  const [confirmDeleteMember, setConfirmDeleteMember] = useState(false);
  const [deletingMember, setDeletingMember] = useState(false);

  // Quick tier change
  const [quickTier, setQuickTier] = useState<string>("");
  const [tierSaving, setTierSaving] = useState(false);
  const [tierSaved, setTierSaved] = useState(false);

  // Notes state
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesUpdated, setNotesUpdated] = useState<string | null>(null);

  // Audit dropdown + job polling (separate state for header vs sidebar)
  const [auditOpenHeader, setAuditOpenHeader] = useState(false);
  const [auditOpenSidebar, setAuditOpenSidebar] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("");
  const [jobMessage, setJobMessage] = useState<string>("");
  const [jobError, setJobError] = useState<string | null>(null);

  // Avatar profile admin editing
  const [avatarText, setAvatarText] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarSaved, setAvatarSaved] = useState(false);
  const [toolsUsage, setToolsUsage] = useState<{
    scriptsCount: number; analysesCount: number; lastActivity: string | null;
  } | null>(null);

  // Top videos — last 30 days
  const [topVideos, setTopVideos] = useState<any[]>([]);
  const [topVideosLoading, setTopVideosLoading] = useState(false);
  const [topVideosNoChannel, setTopVideosNoChannel] = useState(false);
  const [topVideosNoUploads, setTopVideosNoUploads] = useState(false);

  // Single video selection modal
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoModalLoading, setVideoModalLoading] = useState(false);
  const [videoModalVideos, setVideoModalVideos] = useState<any[]>([]);
  const [videoModalError, setVideoModalError] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  const fetchMember = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/members/${id}`);
    const data = await res.json();
    setMember(data.member);
    setQuickTier(data.member?.serviceTier ?? "foundations");
    setNotes(data.member?.coachingNotes ?? "");
    setNotesUpdated(data.member?.coachingNotesUpdatedAt ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchMember();
  }, [fetchMember]);

  useEffect(() => {
    if (!member?.id) return;
    setTopVideosLoading(true);
    fetch(`/api/admin/members/${member.id}/top-videos`)
      .then((r) => r.json())
      .then((data) => {
        setTopVideos(data.videos ?? []);
        setTopVideosNoChannel(!!data.noChannel);
        setTopVideosNoUploads(!!data.noUploadsIn30Days);
      })
      .catch(() => {})
      .finally(() => setTopVideosLoading(false));
  }, [member?.id]);

  useEffect(() => {
    if (!member?.id) return;
    // Populate avatar text from member data
    if (member.avatarProfile) {
      try {
        setAvatarText(typeof member.avatarProfile === "string"
          ? member.avatarProfile
          : JSON.stringify(member.avatarProfile, null, 2));
      } catch { setAvatarText(""); }
    } else {
      setAvatarText("");
    }
    // Fetch AI tools usage counts
    fetch(`/api/admin/member-tools-usage/${member.id}`)
      .then((r) => r.json())
      .then((data) => setToolsUsage(data))
      .catch(() => {});
  }, [member?.id, member?.avatarProfile]);

  async function handleSaveAdminAvatar() {
    if (!member?.id) return;
    setAvatarSaving(true);
    setAvatarSaved(false);
    let parsed: unknown = avatarText;
    try { parsed = JSON.parse(avatarText); } catch { /* save as string */ }
    await fetch(`/api/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarProfile: parsed }),
    });
    await fetchMember();
    setAvatarSaving(false);
    setAvatarSaved(true);
    setTimeout(() => setAvatarSaved(false), 3000);
  }

  function isRawChannelId(handle: string | null | undefined): boolean {
    if (!handle) return false;
    const stripped = handle.startsWith("@") ? handle.slice(1) : handle;
    return /^UC[\w-]{22}$/.test(stripped);
  }

  useEffect(() => {
    if (!member) return;
    if (member.youtubeChannelName) return;
    const handle = member.youtubeHandle;
    if (!isRawChannelId(handle)) return;
    const channelId = handle.startsWith("@") ? handle.slice(1) : handle;
    fetch(`/api/youtube/resolve-channel?channelId=${encodeURIComponent(channelId)}`)
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.title) return;
        await fetch(`/api/members/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeChannelName: data.title }),
        });
        setMember((prev: any) => prev ? { ...prev, youtubeChannelName: data.title } : prev);
      })
      .catch(() => {});
  }, [member?.id, member?.youtubeChannelName, member?.youtubeHandle, id]);

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

  async function handleQuickTierSave() {
    setTierSaving(true);
    await fetch(`/api/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceTier: quickTier }),
    });
    await fetchMember();
    setTierSaving(false);
    setTierSaved(true);
    setTimeout(() => setTierSaved(false), 2000);
  }

  async function handleDeleteAudit(auditId: string) {
    setDeletingAuditId(auditId);
    await fetch(`/api/audits/${auditId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    setDeletingAuditId(null);
    await fetchMember();
  }

  async function handleDeleteMember() {
    setDeletingMember(true);
    await fetch(`/api/members/${id}`, { method: "DELETE" });
    router.push("/admin/members");
  }

  async function runAudit(auditType: string, videoId?: string) {
    setAuditOpenHeader(false);
    setAuditOpenSidebar(false);
    setJobId(null);
    setJobStatus("queued");
    setJobMessage("Queued — waiting to start…");
    setJobError(null);

    const res = await fetch("/api/audits/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: id, auditType, ...(videoId ? { videoId } : {}) }),
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
      if (TERMINAL.includes(data.status)) {
        clearInterval(interval);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [jobId, fetchMember]);

  async function openVideoModal() {
    setAuditOpenHeader(false);
    setAuditOpenSidebar(false);
    setShowVideoModal(true);
    setVideoModalLoading(true);
    setVideoModalError(null);
    setVideoModalVideos([]);
    setSelectedVideoId(null);

    const res = await fetch(`/api/youtube/channel-videos?memberId=${id}`);
    const data = await res.json();

    if (!res.ok || !data.videos?.length) {
      setVideoModalError(data.error ?? "Could not fetch videos — check that this member has a valid YouTube channel set");
      setVideoModalLoading(false);
      return;
    }

    setVideoModalVideos(data.videos);
    setVideoModalLoading(false);
  }

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

  const officialAudits = (member.audits ?? []).filter(
    (a: any) => a.auditType === "baseline" || a.auditType === "monthly"
  );
  const latestAudit = officialAudits[0] ?? null;
  const baselineAudit = [...officialAudits].reverse().find(
    (a: any) => a.auditType === "baseline"
  );

  const chartData = [...officialAudits]
    .reverse()
    .filter((a: any) => a.overallScore != null)
    .map((a: any) => ({
      date: new Date(a.createdAt).toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      }),
      score: parseFloat(Number(a.overallScore).toFixed(1)),
      type: a.auditType,
    }));

  const videoAuditData = [...(member.audits ?? [])]
    .filter((a: any) => a.auditType === "single_video" && a.overallScore != null)
    .reverse()
    .map((a: any) => ({
      date: new Date(a.createdAt).toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      }),
      score: parseFloat(Number(a.overallScore).toFixed(1)),
      title: (a.videosAnalysed as any)?.[0]?.title ?? "Single Video",
    }));

  function extractScore(raw: any, key: string): number | null {
    if (!raw || typeof raw !== "object") return null;
    const val = raw[key];
    if (val == null) return null;
    if (typeof val === "number") return val;
    if (typeof val === "object" && typeof val.score === "number") return val.score;
    return null;
  }

  const rawLatestScores = typeof latestAudit?.scores === "object" && latestAudit?.scores
    ? (latestAudit.scores as any)
    : null;

  const rawBaselineScores = typeof baselineAudit?.scores === "object" && baselineAudit?.scores
    ? (baselineAudit.scores as any)
    : null;

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
      <div className="rounded-2xl overflow-hidden bg-gradient-to-r from-[#1e2a38] via-[#2c4a6e] to-[#3dc3ff] p-6 pt-10">
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-snug break-words">
              {member.fullName || member.email}
            </h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {(member.youtubeChannelName || (member.youtubeHandle && !isRawChannelId(member.youtubeHandle))) && (
                <span className="text-white/70 text-sm break-words">
                  {member.youtubeChannelName || member.youtubeHandle}
                </span>
              )}
              {!member.youtubeChannelName && isRawChannelId(member.youtubeHandle) && (
                <span className="text-white/40 text-xs italic">Resolving channel name…</span>
              )}
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${tierColors(member.serviceTier).badge}`}>
                {tierLabel(member.serviceTier)}
              </span>
            </div>
          </div>
          {member.youtubeChannelUrl && (
            <a
              href={member.youtubeChannelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-white text-[#1e2a38] text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors self-start"
            >
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              View Channel
            </a>
          )}
        </div>
      </div>

      {/* STATS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Current Score",
            value: latestAudit?.overallScore != null
              ? Number(latestAudit.overallScore).toFixed(1)
              : "—",
            colored: true,
            score: latestAudit?.overallScore != null ? Number(latestAudit.overallScore) : null,
          },
          { label: "Member Since", value: fmt(member.invitedAt ?? member.createdAt) },
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
        <div className="lg:col-span-2 space-y-6 order-2 lg:order-1">
          {/* MEMBER INFO CARD */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[#1e2a38]">Member Info</h2>
              {!isEditorRole && (
                !editing ? (
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
                )
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
                          ? (member.youtubeHandle && !isRawChannelId(member.youtubeHandle)
                              ? `${member.youtubeChannelName} (${member.youtubeHandle})`
                              : member.youtubeChannelName)
                          : (!isRawChannelId(member.youtubeHandle)
                              ? (member.youtubeHandle ?? member.youtubeChannelUrl)
                              : member.youtubeChannelUrl)}
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
              {!isEditorRole && (
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
                          onClick={() => value === "single_video" ? openVideoModal() : runAudit(value)}
                          className="w-full text-left px-4 py-2.5 text-sm text-[#1e2a38] hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Date</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Type</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Score</th>
                      <th className="text-right py-2 text-xs font-semibold text-[#1e2a38]/50 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.audits.map((audit: any) => (
                      <tr key={audit.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-3 pr-4 text-[#1e2a38]/70">{fmt(audit.createdAt)}</td>
                        <td className="py-3 pr-4 text-[#1e2a38]">
                          {audit.auditType === "single_video" ? (() => {
                            const vid = (audit.videosAnalysed as any)?.[0];
                            const videoId = vid?.videoId;
                            const title = vid?.title ?? "Single Video";
                            const truncated = title.length > 50 ? title.slice(0, 50) + "…" : title;
                            return (
                              <div className="flex items-center gap-2">
                                {videoId && (
                                  <img
                                    src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                                    alt=""
                                    className="w-12 h-[34px] rounded object-cover shrink-0"
                                  />
                                )}
                                <span className="text-sm leading-tight">{truncated}</span>
                              </div>
                            );
                          })() : (
                            <span className="capitalize">{audit.auditType.replace("_", " ")}</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {audit.overallScore != null ? (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(Number(audit.overallScore))}`}>
                              {Number(audit.overallScore).toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {!isEditorRole && confirmDeleteId === audit.id ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-xs text-[#1e2a38]/50">Delete?</span>
                              <button
                                onClick={() => handleDeleteAudit(audit.id)}
                                disabled={deletingAuditId === audit.id}
                                className="text-xs text-[#ff0033] font-semibold hover:underline"
                              >
                                {deletingAuditId === audit.id ? "Deleting…" : "Yes"}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-3">
                              <Link
                                href={`/admin/audits/${audit.id}`}
                                className="text-[#3dc3ff] hover:underline text-xs"
                              >
                                View →
                              </Link>
                              {!isEditorRole && (
                                <button
                                  onClick={() => setConfirmDeleteId(audit.id)}
                                  className="text-xs text-gray-300 hover:text-[#ff0033] transition-colors"
                                >
                                  Delete
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* TOP VIDEOS — last 30 days */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-[#1e2a38] mb-4">Most Viewed — Last 30 Days</h2>
            {topVideosLoading ? (
              <p className="text-sm text-[#1e2a38]/50 text-center py-6">Loading videos…</p>
            ) : topVideosNoChannel ? (
              <p className="text-sm text-[#1e2a38]/50 text-center py-6">No YouTube channel connected.</p>
            ) : topVideosNoUploads ? (
              <p className="text-sm text-amber-500 text-center py-6">No uploads in the last 30 days.</p>
            ) : topVideos.length === 0 ? (
              <p className="text-sm text-[#1e2a38]/50 text-center py-6">No videos found.</p>
            ) : (
              <div className="space-y-3">
                {topVideos.map((v, i) => (
                  <a
                    key={v.videoId}
                    href={v.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <span className="text-xs font-bold text-[#1e2a38]/30 w-4 shrink-0">{i + 1}</span>
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      className="w-20 h-[45px] object-cover rounded shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1e2a38] leading-snug line-clamp-2 group-hover:text-[#3dc3ff] transition-colors">
                        {v.title}
                      </p>
                      <p className="text-xs text-[#1e2a38]/40 mt-0.5">
                        {Number(v.viewCount).toLocaleString()} views
                        {v.uploadDate && (
                          <span className="ml-2">{new Date(v.uploadDate).toLocaleDateString()}</span>
                        )}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* SCORE TREND — two charts */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">

            {/* Chart 1: Channel Score Trend (baseline + monthly only) */}
            <div>
              <h2 className="text-base font-semibold text-[#1e2a38] mb-3">Channel Score Trend</h2>
              {chartData.length === 0 ? (
                <p className="text-sm text-[#1e2a38]/50 text-center py-6">
                  Scores will appear after the first audit.
                </p>
              ) : chartData.length === 1 ? (
                <div>
                  <ResponsiveContainer width="100%" height={150}>
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
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(val) => [typeof val === "number" ? val.toFixed(1) : String(val ?? ""), "Score"]}
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

            <div className="border-t border-gray-100" />

            {/* Chart 2: Video Audit Scores (single_video only) */}
            <div>
              <h2 className="text-base font-semibold text-[#1e2a38] mb-1">Video Audit Scores</h2>
              <p className="text-xs text-[#1e2a38]/40 mb-3">Individual video scores — expect variation above and below the channel baseline.</p>
              {videoAuditData.length === 0 ? (
                <p className="text-sm text-[#1e2a38]/50 text-center py-6">
                  No video audits yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={videoAuditData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm text-xs max-w-[220px]">
                            <p className="font-semibold text-[#1e2a38] mb-0.5">{d.title}</p>
                            <p className="text-[#1e2a38]/60">{d.date} · Score: <span className="font-bold text-[#1e2a38]">{d.score.toFixed(1)}</span></p>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={{ r: 4, fill: "#94a3b8", stroke: "#fff", strokeWidth: 1.5 }}
                      activeDot={{ r: 6, fill: "#64748b" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 16-PRINCIPLE BREAKDOWN */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setBreakdownOpen((o) => !o)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <span className="text-base font-semibold text-[#1e2a38]">16-Principle Breakdown</span>
              <div className="flex items-center gap-2">
                {latestAudit && (
                  <span className="text-xs text-[#1e2a38]/40 font-medium">
                    {DIMENSIONS.length} categories
                  </span>
                )}
                <ChevronDownIcon
                  className={`w-4 h-4 text-[#1e2a38]/40 transition-transform duration-200 ${breakdownOpen ? "rotate-180" : ""}`}
                />
              </div>
            </button>

            {breakdownOpen && (
              <div className="px-6 pb-6 border-t border-gray-100">
            {!latestAudit ? (
              <p className="text-sm text-[#1e2a38]/50 text-center py-8">
                Scores will appear after the first audit.
              </p>
            ) : (
              <div className="space-y-6 pt-4">
                {DIMENSIONS.map((dim) => {
                  const dimScores = dim.keys
                    .map((k) => extractScore(rawLatestScores, k))
                    .filter((s): s is number => s != null);
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
                          {dim.keys.map((key) => {
                            const score = extractScore(rawLatestScores, key);
                            const base = extractScore(rawBaselineScores, key);
                            const principle = PRINCIPLE_LABELS[key] ?? key;
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
                        (c: any) => c.lead
                      ).length ?? 0;
                      const rate =
                        clicks > 0 ? ((conversions / clicks) * 100).toFixed(1) + "%" : "—";
                      return (
                        <tr key={link.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-3 pr-4 text-[#1e2a38]">{link.name}</td>
                          <td className="py-3 pr-4">
                            <span className="text-[#3dc3ff] font-mono text-xs">
                              /{link.refCode}
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
            {isEditorRole ? (
              <div className="text-sm text-[#1e2a38] whitespace-pre-wrap bg-gray-50 rounded-lg px-4 py-3 min-h-[80px]">
                {notes || <span className="text-[#1e2a38]/30 italic">No coaching notes yet.</span>}
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>

          {/* Avatar Profile */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[#1e2a38]">Avatar Profile</h2>
              {member?.avatarName && (
                <span className="text-xs text-[#3dc3ff] bg-[#3dc3ff]/10 px-2.5 py-1 rounded-full font-medium">
                  {member.avatarName}
                </span>
              )}
            </div>
            {!member?.avatarProfile ? (
              <p className="text-sm text-[#1e2a38]/40 mb-3">No avatar saved for this member yet.</p>
            ) : (
              <>
                {member.avatarSummary && (
                  <p className="text-sm text-[#1e2a38]/70 mb-3 leading-relaxed">{member.avatarSummary}</p>
                )}
                {Array.isArray(member.contentThemes) && member.contentThemes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {(member.contentThemes as unknown[]).map((t, i) => {
                      const label = typeof t === "string"
                        ? t
                        : t && typeof t === "object" && "name" in t
                          ? `${(t as any).emoji ?? ""} ${(t as any).name ?? ""}`.trim()
                          : null;
                      return label ? (
                        <span key={i} className="text-xs bg-[#3dc3ff]/10 text-[#3dc3ff] px-2.5 py-1 rounded-full font-medium">{label}</span>
                      ) : null;
                    })}
                  </div>
                )}
              </>
            )}
            {isEditorRole ? (
              avatarText ? (
                <div className="text-sm text-[#1e2a38] whitespace-pre-wrap bg-gray-50 rounded-lg px-4 py-3 font-mono max-h-48 overflow-y-auto">
                  {avatarText}
                </div>
              ) : null
            ) : (
              <>
                <textarea
                  value={avatarText}
                  onChange={(e) => setAvatarText(e.target.value)}
                  rows={6}
                  placeholder="No avatar document saved. You can paste or edit one here."
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#1e2a38] font-mono focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30 resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  {avatarSaved && <span className="text-xs text-green-600 font-medium">Saved</span>}
                  <button
                    onClick={handleSaveAdminAvatar}
                    disabled={avatarSaving || !avatarText.trim()}
                    className="ml-auto bg-[#1e2a38] hover:bg-[#2a3a4e] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    {avatarSaving ? "Saving…" : "Save Avatar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR — QUICK ACTIONS */}
        <div className="space-y-4 order-1 lg:order-2">
          {/* Membership Level — always-visible quick selector (admin only) */}
          {!isEditorRole && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-[#1e2a38] mb-3">Membership Level</h2>
              <select
                value={quickTier}
                onChange={(e) => { setQuickTier(e.target.value); setTierSaved(false); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#1e2a38] focus:outline-none focus:ring-2 focus:ring-[#3dc3ff]/30 mb-2"
              >
                {SERVICE_TIERS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button
                onClick={handleQuickTierSave}
                disabled={tierSaving || quickTier === member.serviceTier}
                className={`w-full text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
                  tierSaved
                    ? "bg-green-100 text-green-700"
                    : quickTier === member.serviceTier
                    ? "bg-gray-100 text-gray-400 cursor-default"
                    : "bg-[#1e2a38] hover:bg-[#2a3a4a] text-white"
                }`}
              >
                {tierSaved ? "Saved" : tierSaving ? "Saving…" : "Save Tier"}
              </button>
            </div>
          )}

          {/* AI Tools Usage */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-[#1e2a38] mb-3">AI Tools Usage</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#1e2a38]/50">Avatar saved</span>
                <span className={`text-xs font-semibold ${member?.avatarName ? "text-green-600" : "text-[#1e2a38]/30"}`}>
                  {member?.avatarName ? `✓ ${member.avatarName}` : "None"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#1e2a38]/50">Scripts built</span>
                <span className="text-xs font-semibold text-[#1e2a38]">{toolsUsage?.scriptsCount ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#1e2a38]/50">Title analyses</span>
                <span className="text-xs font-semibold text-[#1e2a38]">{toolsUsage?.analysesCount ?? "—"}</span>
              </div>
              {toolsUsage?.lastActivity && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#1e2a38]/50">Last active</span>
                  <span className="text-xs font-semibold text-[#1e2a38]">
                    {new Date(toolsUsage.lastActivity).toLocaleDateString()}
                  </span>
                </div>
              )}
              {!member?.avatarName && !toolsUsage?.scriptsCount && (
                <p className="text-xs text-[#1e2a38]/30 italic pt-1">No AI tool activity yet</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm sticky top-6">
            <h2 className="text-sm font-semibold text-[#1e2a38] mb-4">Quick Actions</h2>
            <div className="space-y-2">
              {/* Run Audit */}
              {!isEditorRole && (
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
                          onClick={() => value === "single_video" ? openVideoModal() : runAudit(value)}
                          className="w-full text-left px-4 py-2.5 text-sm text-[#1e2a38] hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

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

          {/* Danger Zone — admin only */}
          {!isEditorRole && (
            <div className="bg-white rounded-xl border border-red-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-red-600 mb-3">Danger Zone</h2>
              {!confirmDeleteMember ? (
                <button
                  onClick={() => setConfirmDeleteMember(true)}
                  className="w-full text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 px-4 py-2.5 rounded-lg transition-colors"
                >
                  Delete Member
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-600">
                    This will permanently delete <strong>{member.fullName || member.email}</strong> and all their data (audits, links, scripts, etc.). This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteMember}
                      disabled={deletingMember}
                      className="flex-1 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deletingMember ? "Deleting…" : "Yes, Delete"}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteMember(false)}
                      className="flex-1 text-sm font-medium text-[#1e2a38] border border-gray-200 hover:bg-gray-50 px-4 py-2.5 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Single Video Selection Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-[#1e2a38]">Select a Video to Audit</h2>
                <p className="text-xs text-[#1e2a38]/50 mt-0.5">Choose from {member.fullName}&apos;s 10 most recent long-form videos</p>
              </div>
              <button onClick={() => setShowVideoModal(false)} className="text-[#1e2a38]/40 hover:text-[#1e2a38] transition-colors">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4">
              {videoModalLoading && (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-[#3dc3ff]" />
                  <p className="text-sm text-[#1e2a38]/50">Fetching videos…</p>
                </div>
              )}
              {videoModalError && (
                <div className="bg-[#ffe5ea] border border-[#ff0033]/20 text-[#ff0033] rounded-lg p-4 text-sm">
                  {videoModalError}
                </div>
              )}
              {!videoModalLoading && !videoModalError && (
                <div className="space-y-2">
                  {videoModalVideos.map((v: any) => (
                    <button
                      key={v.videoId}
                      onClick={() => setSelectedVideoId(v.videoId)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ${
                        selectedVideoId === v.videoId
                          ? "border-[#3dc3ff] bg-[#e8f7ff]"
                          : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <img
                        src={v.thumbnailUrl}
                        alt=""
                        className="w-24 h-14 rounded object-cover shrink-0 bg-gray-100"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1e2a38] line-clamp-2 leading-snug">{v.title}</p>
                        <p className="text-xs text-[#1e2a38]/50 mt-1">
                          {v.durationFormatted} · {new Date(v.uploadDate).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })} · {v.viewCount?.toLocaleString()} views
                        </p>
                      </div>
                      {selectedVideoId === v.videoId && (
                        <CheckIcon className="w-5 h-5 text-[#3dc3ff] shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <p className="text-xs text-[#1e2a38]/40">
                {selectedVideoId ? "Video selected — ready to audit" : "Click a video to select it"}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowVideoModal(false)}
                  className="px-4 py-2 text-sm font-medium text-[#1e2a38] hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowVideoModal(false);
                    runAudit("single_video", selectedVideoId!);
                  }}
                  disabled={!selectedVideoId}
                  className="px-4 py-2 text-sm font-semibold bg-[#3dc3ff] hover:bg-[#2bb3ef] text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Run Audit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
