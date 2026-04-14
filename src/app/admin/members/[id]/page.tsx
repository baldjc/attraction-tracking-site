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
  VideoCameraIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/ToastProvider";
import ContentPlanTable from "@/components/content-planner/ContentPlanTable";
import AdminCallsTab from "@/components/admin/AdminCallsTab";
import AdminClientHubTab from "@/components/admin/AdminClientHubTab";

const GHL_LOCATION_ID = process.env.NEXT_PUBLIC_GHL_LOCATION_ID ?? "";

const SERVICE_TIERS = [
  { value: "foundations", label: "Foundations" },
  { value: "editing_2", label: "Production (2)" },
  { value: "editing_4", label: "Production (4)" },
  { value: "mastery_2", label: "Growth (2)" },
  { value: "mastery_4", label: "Growth (4)" },
  { value: "done_with_you", label: "Done-With-You" },
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

const PRODUCTION_TIERS = ["editing_2", "editing_4", "mastery_2", "mastery_4", "done_with_you"];

const TABS = [
  { id: "profile",          label: "Profile",          tierRequired: null },
  { id: "analytics",        label: "Analytics",        tierRequired: null },
  { id: "progress",         label: "Audits & Progress",tierRequired: null },
  { id: "campaigns",        label: "Campaigns",        tierRequired: null },
  { id: "ai_inputs",        label: "AI Inputs",        tierRequired: null },
  { id: "content_planner",  label: "Content Planner",  tierRequired: null },
  { id: "calls",            label: "Calls",            tierRequired: null },
  { id: "client_hub",       label: "Client Hub",       tierRequired: null },
] as const;
type TabId = typeof TABS[number]["id"];

function tierColors(tier: string) {
  if (tier === "foundations") return { badge: "bg-[#6ba3c7]/20 text-[#6ba3c7]", dot: "#6ba3c7" };
  if (tier === "editing_2" || tier === "editing_4") return { badge: "bg-amber-100 text-amber-700", dot: "#f59e0b" };
  if (tier === "mastery_2" || tier === "mastery_4") return { badge: "bg-purple-100 text-purple-700", dot: "#7c3aed" };
  if (tier === "done_with_you") return { badge: "bg-emerald-100 text-emerald-700", dot: "#059669" };
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

function Delta({ val }: { val: number | null }) {
  const dim = "text-[#2f3437]/30";
  if (val === null) return <span className={`text-xs ${dim}`}>—</span>;
  const color = val > 0 ? "text-emerald-600" : val < 0 ? "text-[#ff0033]" : "text-[#2f3437]/50";
  return <span className={`text-xs font-medium ${color}`}>{val > 0 ? "+" : ""}{val.toLocaleString()}</span>;
}

export default function MemberDetailPage() {
  const { data: sessionData } = useSession();
  const currentRole = (sessionData?.user as any)?.role ?? "admin";
  const isEditorRole = currentRole === "editor";

  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const toast = useToast();

  const chartGrid    = isDark ? "rgba(45,55,72,0.5)"   : "rgba(30,42,56,0.06)";
  const chartTick    = isDark ? "#64748b"               : "rgba(30,42,56,0.45)";
  const chartTooltip = {
    background:   isDark ? "#1a1a1a" : "#fff",
    border:       `1px solid ${isDark ? "#2a2a2a" : "#e5e7eb"}`,
    borderRadius: 8,
    fontSize:     12,
    color:        isDark ? "#e2e8f0" : "#2f3437",
  };

  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingAuditId, setDeletingAuditId] = useState<string | null>(null);

  const [confirmDeleteMember, setConfirmDeleteMember] = useState(false);
  const [deletingMember, setDeletingMember] = useState(false);

  const [quickTier, setQuickTier] = useState<string>("");
  const [tierSaving, setTierSaving] = useState(false);

  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesUpdated, setNotesUpdated] = useState<string | null>(null);

  const [auditOpenHeader, setAuditOpenHeader] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("");
  const [jobMessage, setJobMessage] = useState<string>("");
  const [jobError, setJobError] = useState<string | null>(null);

  const [avatarText, setAvatarText] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);

  const [videoThemes, setVideoThemes] = useState("");
  const [videoThemesSaving, setVideoThemesSaving] = useState(false);
  const [toolsUsage, setToolsUsage] = useState<{
    scriptsCount: number; analysesCount: number; lastActivity: string | null;
  } | null>(null);

  const [academyProgress, setAcademyProgress] = useState<any>(null);

  const [stripeLinkOpen, setStripeLinkOpen] = useState(false);
  const [stripeSearchQ, setStripeSearchQ] = useState("");
  const [stripeSearchResults, setStripeSearchResults] = useState<any[]>([]);
  const [stripeSearchLoading, setStripeSearchLoading] = useState(false);
  const [stripeSearchDone, setStripeSearchDone] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const [sendingReminder, setSendingReminder] = useState(false);

  const [syncingStripe, setSyncingStripe] = useState(false);

  const [topVideos, setTopVideos] = useState<any[]>([]);
  const [topVideosLoading, setTopVideosLoading] = useState(false);
  const [topVideosNoChannel, setTopVideosNoChannel] = useState(false);
  const [topVideosNoUploads, setTopVideosNoUploads] = useState(false);

  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoModalLoading, setVideoModalLoading] = useState(false);
  const [videoModalVideos, setVideoModalVideos] = useState<any[]>([]);
  const [videoModalError, setVideoModalError] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [refreshingChannel, setRefreshingChannel] = useState(false);
  const [runningAudit, setRunningAudit] = useState<Record<string, boolean>>({});
  const [auditDone, setAuditDone] = useState<Record<string, string>>({});

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

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics/members/${id}`);
      const d = await res.json();
      setAnalyticsData(d);
    } catch { /* silent */ } finally {
      setAnalyticsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMember();
    fetchAnalytics();
  }, [fetchMember, fetchAnalytics]);

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
    fetch(`/api/admin/academy/member-progress/${member.id}`)
      .then((r) => r.json())
      .then((data) => setAcademyProgress(data))
      .catch(() => {});
  }, [member?.id]);

  useEffect(() => {
    if (!member?.id) return;
    if (member.avatarProfile) {
      try {
        setAvatarText(typeof member.avatarProfile === "string"
          ? member.avatarProfile
          : JSON.stringify(member.avatarProfile, null, 2));
      } catch { setAvatarText(""); }
    } else {
      setAvatarText("");
    }
    setVideoThemes(member.videoThemes ?? "");
    fetch(`/api/admin/member-tools-usage/${member.id}`)
      .then((r) => r.json())
      .then((data) => setToolsUsage(data))
      .catch(() => {});
  }, [member?.id, member?.avatarProfile]);

  async function handleSaveAdminAvatar() {
    if (!member?.id) return;
    setAvatarSaving(true);
    try {
      let parsed: unknown = avatarText;
      try { parsed = JSON.parse(avatarText); } catch { /* save as string */ }
      const res = await fetch(`/api/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarProfile: parsed }),
      });
      if (!res.ok) throw new Error("Save failed");
      await fetchMember();
      toast.success("Avatar updated.");
    } catch {
      toast.error("Failed to save avatar.");
    } finally {
      setAvatarSaving(false);
    }
  }

  async function handleSaveVideoThemes() {
    if (!member?.id) return;
    setVideoThemesSaving(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoThemes }),
      });
      if (!res.ok) throw new Error("Save failed");
      await fetchMember();
      toast.success("Video themes saved.");
    } catch {
      toast.error("Failed to save video themes.");
    } finally {
      setVideoThemesSaving(false);
    }
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
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFields),
      });
      if (!res.ok) throw new Error("Save failed");
      await fetchMember();
      setEditing(false);
      toast.success("Profile updated.");
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    setNotesSaving(true);
    try {
      const res = await fetch(`/api/members/${id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setNotesUpdated(data.member?.coachingNotesUpdatedAt ?? null);
      toast.success("Coaching notes saved.");
    } catch {
      toast.error("Failed to save notes.");
    } finally {
      setNotesSaving(false);
    }
  }

  async function handleQuickTierSave() {
    setTierSaving(true);
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceTier: quickTier }),
      });
      if (!res.ok) throw new Error("Save failed");
      await fetchMember();
      toast.success(`Tier updated to ${quickTier.replace(/_/g, " ")}`);
    } catch {
      toast.error("Failed to update tier.");
    } finally {
      setTierSaving(false);
    }
  }

  async function handleSendPaymentReminder() {
    setSendingReminder(true);
    try {
      const res = await fetch(`/api/admin/members/${id}/send-payment-reminder`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success("Payment reminder SMS sent.");
        if (data.sentAt) {
          setMember((prev: any) => prev ? { ...prev, lastPaymentReminderSentAt: data.sentAt } : prev);
        }
      } else {
        toast.error(data.error ?? "Failed to send reminder.");
      }
    } catch {
      toast.error("Network error — could not send reminder.");
    } finally {
      setSendingReminder(false);
    }
  }

  async function searchStripeCustomers() {
    if (!stripeSearchQ.trim()) return;
    setStripeSearchLoading(true);
    setStripeSearchDone(false);
    const res = await fetch(`/api/admin/members/stripe-search?q=${encodeURIComponent(stripeSearchQ)}`);
    const data = await res.json();
    setStripeSearchResults(data.customers ?? []);
    setStripeSearchLoading(false);
    setStripeSearchDone(true);
  }

  async function handleStripeLink(stripeCustomerId: string) {
    setLinking(true);
    await fetch(`/api/admin/members/${id}/stripe-link`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stripeCustomerId }),
    });
    await fetchMember();
    setLinking(false);
    setStripeLinkOpen(false);
    setStripeSearchQ("");
    setStripeSearchResults([]);
    setStripeSearchDone(false);
  }

  async function handleStripeUnlink() {
    setUnlinking(true);
    try {
      await fetch(`/api/admin/members/${id}/stripe-unlink`, { method: "PUT" });
      await fetchMember();
      toast.success("Stripe account unlinked.");
    } catch {
      toast.error("Failed to unlink Stripe.");
    } finally {
      setUnlinking(false);
    }
  }

  async function handleStripeSync() {
    setSyncingStripe(true);
    try {
      const res = await fetch(`/api/admin/members/${id}/stripe-sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      await fetchMember();
      toast.success(`Synced — status is now: ${data.subscriptionStatus ?? "unknown"}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingStripe(false);
    }
  }

  async function handleDeleteAudit(auditId: string) {
    setDeletingAuditId(auditId);
    try {
      const res = await fetch(`/api/audits/${auditId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setConfirmDeleteId(null);
      setDeletingAuditId(null);
      await fetchMember();
      toast.success("Audit deleted.");
    } catch {
      toast.error("Failed to delete audit.");
      setDeletingAuditId(null);
    }
  }

  async function handleDeleteMember() {
    setDeletingMember(true);
    try {
      await fetch(`/api/members/${id}`, { method: "DELETE" });
      toast.success("Member deleted. Redirecting…");
      router.push("/admin/members");
    } catch {
      toast.error("Failed to delete member.");
      setDeletingMember(false);
    }
  }

  async function runAudit(auditType: string, videoId?: string) {
    setAuditOpenHeader(false);
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

  async function handleRunVideoAudit(video: any) {
    if (!analyticsData) return;
    setRunningAudit((p) => ({ ...p, [video.id]: true }));
    try {
      const res = await fetch("/api/audits/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: analyticsData.user.id, auditType: "single_video", videoId: video.videoId }),
      });
      const d = await res.json();
      if (d.jobId) setAuditDone((p) => ({ ...p, [video.id]: d.jobId }));
    } finally {
      setRunningAudit((p) => ({ ...p, [video.id]: false }));
    }
  }

  async function handleRefreshChannel() {
    setRefreshingChannel(true);
    try {
      await fetch("/api/admin/youtube/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      await fetchAnalytics();
    } finally {
      setRefreshingChannel(false);
    }
  }

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
      if (TERMINAL.includes(data.status)) clearInterval(interval);
    }, 2500);
    return () => clearInterval(interval);
  }, [jobId, fetchMember]);

  async function openVideoModal() {
    setAuditOpenHeader(false);
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
      <div className="flex items-center justify-center h-64 text-[#2f3437]/40">
        Loading member…
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-20">
        <p className="text-[#2f3437]/50">Member not found.</p>
        <Link href="/admin/members" className="text-[#6ba3c7] text-sm mt-2 inline-block">
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
      date: new Date(a.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
      score: parseFloat(Number(a.overallScore).toFixed(1)),
      type: a.auditType,
    }));

  const videoAuditData = [...(member.audits ?? [])]
    .filter((a: any) => a.auditType === "single_video" && a.overallScore != null)
    .reverse()
    .map((a: any) => ({
      date: new Date(a.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
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
    ? (latestAudit.scores as any) : null;
  const rawBaselineScores = typeof baselineAudit?.scores === "object" && baselineAudit?.scores
    ? (baselineAudit.scores as any) : null;

  const subCfg: Record<string, { dot: string; label: string; cls: string }> = {
    active:    { dot: "bg-green-500",  label: "Active",    cls: "text-green-700 bg-green-50 border-green-200" },
    trialing:  { dot: "bg-blue-400",   label: "Trial",     cls: "text-blue-700 bg-blue-50 border-blue-200" },
    past_due:  { dot: "bg-amber-400",  label: "Past Due",  cls: "text-amber-700 bg-amber-50 border-amber-200" },
    cancelled: { dot: "bg-red-500",    label: "Cancelled", cls: "text-red-700 bg-red-50 border-red-200" },
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Back */}
      <Link
        href="/admin/members"
        className="inline-flex items-center gap-1.5 text-sm text-[#2f3437]/50 hover:text-[#2f3437] transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to Members
      </Link>

      {/* AUDIT JOB STATUS BANNER */}
      {jobStatus && (
        <div className={`rounded-lg px-5 py-3.5 flex items-center justify-between gap-4 ${
          jobStatus === "complete" ? "bg-green-50 border border-green-200" :
          jobStatus === "failed" ? "bg-red-50 border border-[#ff0033]/20" :
          "bg-[#6ba3c7]/10 border border-[#6ba3c7]/30"
        }`}>
          <div className="flex items-center gap-3">
            {!["complete", "failed"].includes(jobStatus) && (
              <div className="w-4 h-4 border-2 border-[#6ba3c7] border-t-transparent rounded-full animate-spin shrink-0" />
            )}
            {jobStatus === "complete" && <span className="text-green-600 text-lg">✓</span>}
            {jobStatus === "failed" && <span className="text-[#ff0033] text-lg">✕</span>}
            <span className={`text-sm font-medium ${
              jobStatus === "complete" ? "text-green-700" :
              jobStatus === "failed" ? "text-[#ff0033]" :
              "text-[#2f3437]"
            }`}>
              {jobStatus === "failed" ? (jobError ?? "Audit failed") : jobMessage}
            </span>
          </div>
          <button
            onClick={() => { setJobId(null); setJobStatus(""); setJobMessage(""); setJobError(null); }}
            className="text-xs text-[#2f3437]/40 hover:text-[#2f3437]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* HEADER BANNER */}
      <div className="rounded-lg bg-gradient-to-r from-[#2f3437] via-[#2c4a6e] to-[#6ba3c7] p-6 pt-10">
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
              {member.stripePlanName && member.subscriptionStatus && (() => {
                const cfg = subCfg[member.subscriptionStatus];
                if (!cfg) return null;
                return (
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${cfg.cls}`}>
                    {member.stripePlanName} · {cfg.label}
                  </span>
                );
              })()}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {member.youtubeChannelUrl && (
              <a
                href={member.youtubeChannelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-white text-[#2f3437] text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                View Channel
              </a>
            )}
            {!isEditorRole && (
              <div className="relative">
                <button
                  onClick={() => setAuditOpenHeader((o) => !o)}
                  className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-white/20"
                >
                  Run Audit
                  <ChevronDownIcon className="w-4 h-4" />
                </button>
                {auditOpenHeader && (
                  <div className="absolute left-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                    {[
                      { label: "Baseline", value: "baseline" },
                      { label: "Monthly", value: "monthly" },
                      { label: "Single Video", value: "single_video" },
                    ].map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => value === "single_video" ? openVideoModal() : runAudit(value)}
                        className="w-full text-left px-4 py-2.5 text-sm text-[#2f3437] hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!isEditorRole && member.subscriptionStatus === "past_due" && (
              <div className="flex flex-col items-start gap-1">
                <button
                  onClick={handleSendPaymentReminder}
                  disabled={sendingReminder}
                  className="inline-flex items-center gap-1.5 bg-amber-400 hover:bg-amber-500 disabled:opacity-60 text-[#2f3437] text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {sendingReminder ? "Sending…" : "Send Payment Reminder"}
                </button>
                {member.lastPaymentReminderSentAt && (
                  <span className="text-white/50 text-xs pl-1">
                    Last sent {fmt(member.lastPaymentReminderSentAt)}
                  </span>
                )}
              </div>
            )}
            {!isEditorRole && member.stripeCustomerId && (
              <button
                onClick={handleStripeSync}
                disabled={syncingStripe}
                className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-white/20"
                title="Pull latest subscription status directly from Stripe"
              >
                {syncingStripe ? "Syncing…" : "Sync Stripe Status"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* STATS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Current Score",
            value: latestAudit?.overallScore != null ? Number(latestAudit.overallScore).toFixed(1) : "—",
            colored: true,
            score: latestAudit?.overallScore != null ? Number(latestAudit.overallScore) : null,
          },
          { label: "Member Since", value: fmt(member.invitedAt ?? member.createdAt) },
          { label: "Last Audit", value: fmt(latestAudit?.createdAt) },
          { label: "Total Audits", value: member.audits?.length ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.colored ? scoreColor(stat.score) : "text-[#2f3437]"}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* TAB BAR */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit overflow-x-auto">
        {TABS.filter((t) => !t.tierRequired || t.tierRequired.includes(member.serviceTier)).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === t.id
                ? "bg-[#2f3437] text-white"
                : "text-[#2f3437]/60 hover:text-[#2f3437] hover:bg-gray-50"
            }`}
          >
            {t.label}
            {t.id === "progress" && (member.audits?.length ?? 0) > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === t.id ? "bg-white/20 text-white" : "bg-[#6ba3c7]/15 text-[#6ba3c7]"
              }`}>
                {member.audits.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── ANALYTICS TAB ─────────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {analyticsLoading ? (
            <div className="flex items-center justify-center h-48 text-[#2f3437]/40">
              <ArrowPathIcon className="w-5 h-5 animate-spin mr-2" />
              Loading analytics…
            </div>
          ) : !analyticsData || analyticsData.error ? (
            <p className="text-sm text-[#2f3437]/50 text-center py-12">No analytics data available.</p>
          ) : (
            <>
              {/* Channel Stats */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-[#2f3437]">YouTube Activity</h2>
                  <button
                    onClick={handleRefreshChannel}
                    disabled={refreshingChannel}
                    className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60 text-[#2f3437] text-xs font-medium px-3 py-1.5 rounded-lg transition"
                  >
                    <ArrowPathIcon className={`w-3.5 h-3.5 ${refreshingChannel ? "animate-spin" : ""}`} />
                    {refreshingChannel ? "Refreshing…" : "Refresh Channel"}
                  </button>
                </div>
                {analyticsData.channelStats ? (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="text-xs text-[#2f3437]/50 uppercase tracking-wide mb-1">Subscribers</div>
                      <div className="text-2xl font-bold text-[#2f3437]">{analyticsData.channelStats.subscriberCount.toLocaleString()}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Delta val={analyticsData.channelStats.subscriberChange30d} />
                        <span className="text-xs text-[#2f3437]/30">30d</span>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="text-xs text-[#2f3437]/50 uppercase tracking-wide mb-1">Total Views</div>
                      <div className="text-2xl font-bold text-[#2f3437]">{analyticsData.channelStats.totalViewCount.toLocaleString()}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Delta val={analyticsData.channelStats.viewChange30d} />
                        <span className="text-xs text-[#2f3437]/30">30d</span>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="text-xs text-[#2f3437]/50 uppercase tracking-wide mb-1">Videos/Week</div>
                      <div className="text-2xl font-bold text-[#2f3437]">{analyticsData.channelStats.videosPerWeek30d ?? "—"}</div>
                      <div className="text-xs text-[#2f3437]/30 mt-1">30d avg</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[#2f3437]/50 bg-white border border-gray-200 rounded-lg p-6 text-center">
                    No channel snapshot yet. Click Refresh Channel to sync.
                  </p>
                )}
              </div>

              {/* Score Trend */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                <div>
                  <h2 className="text-base font-semibold text-[#2f3437] mb-3">Channel Score Trend</h2>
                  {chartData.length === 0 ? (
                    <p className="text-sm text-[#2f3437]/50 text-center py-6">Scores will appear after the first audit.</p>
                  ) : chartData.length === 1 ? (
                    <div>
                      <ResponsiveContainer width="100%" height={150}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                          <ReferenceDot x={chartData[0].date} y={chartData[0].score} r={5} fill="#6ba3c7" />
                        </LineChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-center text-[#2f3437]/40 mt-1">Only 1 audit — add another to see a trend.</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs">
                                <p className="font-semibold capitalize">{d.type.replace("_", " ")}</p>
                                <p className="text-[#2f3437]/60">{d.date} · Score: <strong>{d.score.toFixed(1)}</strong></p>
                              </div>
                            );
                          }}
                        />
                        <Line
                          type="monotone" dataKey="score" stroke="#6ba3c7" strokeWidth={2.5}
                          dot={({ cx, cy, payload }: any) => (
                            <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4}
                              fill={payload.type === "baseline" ? "#2f3437" : "#6ba3c7"}
                              stroke="#fff" strokeWidth={1.5}
                            />
                          )}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
                {videoAuditData.length > 1 && (
                  <div>
                    <h2 className="text-base font-semibold text-[#2f3437] mb-3">Single Video Audits</h2>
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
                              <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs max-w-[220px]">
                                <p className="font-semibold text-[#2f3437] mb-0.5">{d.title}</p>
                                <p className="text-[#2f3437]/60">{d.date} · Score: <span className="font-bold text-[#2f3437]">{d.score.toFixed(1)}</span></p>
                              </div>
                            );
                          }}
                        />
                        <Line type="monotone" dataKey="score" stroke="#94a3b8" strokeWidth={2}
                          strokeDasharray="4 3"
                          dot={{ r: 4, fill: "#94a3b8", stroke: "#fff", strokeWidth: 1.5 }}
                          activeDot={{ r: 6, fill: "#64748b" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Most Viewed — Last 30 Days */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-base font-semibold text-[#2f3437] mb-4">Most Viewed — Last 30 Days</h2>
                {topVideosLoading ? (
                  <p className="text-sm text-[#2f3437]/50 text-center py-6">Loading videos…</p>
                ) : topVideosNoChannel ? (
                  <p className="text-sm text-[#2f3437]/50 text-center py-6">No YouTube channel connected.</p>
                ) : topVideosNoUploads ? (
                  <p className="text-sm text-amber-500 text-center py-6">No uploads in the last 30 days.</p>
                ) : topVideos.length === 0 ? (
                  <p className="text-sm text-[#2f3437]/50 text-center py-6">No videos found.</p>
                ) : (
                  <div className="space-y-3">
                    {topVideos.map((v, i) => (
                      <a key={v.videoId} href={v.watchUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group"
                      >
                        <span className="text-xs font-bold text-[#2f3437]/30 w-4 shrink-0">{i + 1}</span>
                        <img src={v.thumbnailUrl} alt={v.title} className="w-20 h-[45px] object-cover rounded shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#2f3437] leading-snug line-clamp-2 group-hover:text-[#6ba3c7] transition-colors">{v.title}</p>
                          <p className="text-xs text-[#2f3437]/40 mt-0.5">
                            {Number(v.viewCount).toLocaleString()} views
                            {v.uploadDate && <span className="ml-2">{new Date(v.uploadDate).toLocaleDateString()}</span>}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Videos */}
              {analyticsData.videos?.length > 0 && (
                <div>
                  <h2 className="text-base font-semibold text-[#2f3437] mb-3">Recent Videos</h2>
                  <div className="space-y-3">
                    {analyticsData.videos.slice(0, 10).map((video: any) => {
                      const latestAuditV = video.audits?.[0];
                      const started = auditDone[video.id];
                      return (
                        <div key={video.id} className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-3">
                          {video.thumbnailUrl ? (
                            <img src={video.thumbnailUrl} alt={video.title} className="w-24 h-14 object-cover rounded-lg flex-shrink-0" />
                          ) : (
                            <div className="w-24 h-14 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <VideoCameraIcon className="w-6 h-6 text-[#2f3437]/30" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-[#2f3437] font-medium truncate">{video.title}</div>
                            <div className="text-xs text-[#2f3437]/40 mt-0.5">{fmt(video.publishedAt)} · {video.viewCount.toLocaleString()} views</div>
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-2">
                            {latestAuditV ? (
                              <Link
                                href={`/admin/audits/${latestAuditV.id}`}
                                className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-100 transition whitespace-nowrap"
                              >
                                View Audit {latestAuditV.overallScore !== null ? `(${Number(latestAuditV.overallScore).toFixed(1)})` : ""}
                              </Link>
                            ) : started ? (
                              <span className="text-xs text-[#2f3437]/30">Queued…</span>
                            ) : (
                              <button
                                onClick={() => handleRunVideoAudit(video)}
                                disabled={runningAudit[video.id]}
                                className="text-xs bg-[#6ba3c7] hover:bg-[#29b0f0] disabled:opacity-60 text-white rounded-lg px-3 py-1.5 transition whitespace-nowrap"
                              >
                                {runningAudit[video.id] ? "Starting…" : "Run Audit"}
                              </button>
                            )}
                            {video.videoId && (
                              <a
                                href={`https://www.youtube.com/watch?v=${video.videoId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#2f3437]/50 border border-[#2f3437]/12 rounded-lg px-3 py-1.5 hover:text-[#2f3437] hover:border-[#2f3437]/25 hover:bg-gray-50 transition whitespace-nowrap"
                              >
                                View on YouTube ↗
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Click Trend */}
              {analyticsData.campaigns?.length > 0 && (
                <div>
                  <h2 className="text-base font-semibold text-[#2f3437] mb-3">Campaign Performance</h2>
                  <div className="space-y-4 mb-4">
                    {analyticsData.campaigns.map((campaign: any) => (
                      <div key={campaign.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-[#2f3437]">{campaign.name}</div>
                        {campaign.links.length > 0 ? (
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                {["Link", "Clicks (7d)", "Clicks (All)", "Conv. (7d)", "Conv. (All)"].map((h) => (
                                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#2f3437]/50 bg-gray-50">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {campaign.links.map((link: any) => (
                                <tr key={link.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-2 text-[#2f3437]/70">{link.name}</td>
                                  <td className="px-4 py-2 text-[#2f3437]/70">{link.clicks7d}</td>
                                  <td className="px-4 py-2 text-[#2f3437]/70">{link.clicksAllTime}</td>
                                  <td className="px-4 py-2 text-[#2f3437]/70">{link.conversions7d}</td>
                                  <td className="px-4 py-2 text-[#2f3437]/70">{link.conversionsAllTime}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="px-4 py-3 text-sm text-[#2f3437]/30">No links yet.</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {analyticsData.clickTrend30d?.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="text-sm font-semibold text-[#2f3437] mb-3">Click Trend (30 days)</div>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={analyticsData.clickTrend30d} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: chartTick }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: chartTick }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={chartTooltip} />
                          <Bar dataKey="clicks" fill="#6ba3c7" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}

              {/* Tool Usage */}
              {analyticsData.toolUsage?.length > 0 && (
                <div>
                  <h2 className="text-base font-semibold text-[#2f3437] mb-3">Tool Usage</h2>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          {["Tool", "Uses (7d)", "All Time", "Last Used"].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#2f3437]/50 bg-gray-50">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.toolUsage.map((t: any) => (
                          <tr key={t.tool} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-[#2f3437]">{t.tool}</td>
                            <td className="px-4 py-3 text-[#2f3437]/70">{t.uses7d}</td>
                            <td className="px-4 py-3 text-[#2f3437]/70">{t.usesAllTime}</td>
                            <td className="px-4 py-3 text-xs text-[#2f3437]/40">{fmt(t.lastUsed)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PROFILE TAB ───────────────────────────────────────────── */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Member Info */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-[#2f3437]">Member Info</h2>
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
                      className="flex items-center gap-1.5 text-sm text-[#6ba3c7] hover:text-[#5490b5]"
                    >
                      <PencilIcon className="w-4 h-4" /> Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={handleSaveEdit} disabled={saving} className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium">
                        <CheckIcon className="w-4 h-4" />
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600">
                        <XMarkIcon className="w-4 h-4" /> Cancel
                      </button>
                    </div>
                  )
                )}
              </div>
              <div className="space-y-3 text-sm">
                {[
                  { label: "Full Name", field: "fullName", type: "text" as const, placeholder: "" },
                  { label: "Email", field: "email", type: "text" as const, placeholder: "" },
                  { label: "Phone", field: "phone", type: "text" as const, placeholder: "+1 555 000 0000" },
                ].map(({ label, field, placeholder }) => (
                  <div key={field} className="flex flex-col sm:flex-row sm:items-center gap-1">
                    <span className="text-[#2f3437]/50 w-40 shrink-0">{label}</span>
                    {editing ? (
                      <input value={editFields[field] ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, [field]: e.target.value }))} placeholder={placeholder} className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30" />
                    ) : (
                      <span className="text-[#2f3437]">{member[field] || <span className="text-gray-400">—</span>}</span>
                    )}
                  </div>
                ))}

                {/* YouTube Channel */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                  <span className="text-[#2f3437]/50 w-40 shrink-0">YouTube Channel</span>
                  {editing ? (
                    <div className="flex-1 space-y-1.5">
                      <input value={editFields.youtubeChannelUrl ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, youtubeChannelUrl: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30" placeholder="YouTube URL" />
                      <input value={editFields.youtubeHandle ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, youtubeHandle: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30" placeholder="Handle (@channel)" />
                      <input value={editFields.youtubeChannelName ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, youtubeChannelName: e.target.value }))} className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30" placeholder="Channel name" />
                    </div>
                  ) : (
                    <span className="text-[#2f3437] break-all">
                      {member.youtubeChannelUrl ? (
                        <a href={member.youtubeChannelUrl} target="_blank" rel="noopener noreferrer" className="text-[#6ba3c7] hover:underline flex items-center gap-1">
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

                {/* GHL */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                  <span className="text-[#2f3437]/50 w-40 shrink-0">GHL Contact ID</span>
                  {editing ? (
                    <input value={editFields.ghlContactId ?? ""} onChange={(e) => setEditFields((f: any) => ({ ...f, ghlContactId: e.target.value }))} className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30" />
                  ) : (
                    <span className="text-[#2f3437] break-all">
                      {member.ghlContactId ? (
                        <a href={`https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${member.ghlContactId}`} target="_blank" rel="noopener noreferrer" className="text-[#6ba3c7] hover:underline">{member.ghlContactId}</a>
                      ) : <span className="text-gray-400">—</span>}
                    </span>
                  )}
                </div>

                {/* Membership Level */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                  <span className="text-[#2f3437]/50 w-40 shrink-0">Membership Level</span>
                  {editing ? (
                    <select value={editFields.serviceTier ?? "foundations"} onChange={(e) => setEditFields((f: any) => ({ ...f, serviceTier: e.target.value }))} className="border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30">
                      {SERVICE_TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  ) : (
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${tierColors(member.serviceTier).badge}`}>
                      {tierLabel(member.serviceTier)}
                    </span>
                  )}
                </div>

                {/* Account info */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 pt-1 border-t border-gray-100">
                  <span className="text-[#2f3437]/50 w-40 shrink-0">Member Since</span>
                  <span className="text-[#2f3437]">{fmt(member.invitedAt ?? member.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* COACHING NOTES */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-[#2f3437]">Coaching Notes</h2>
                {notesUpdated && (
                  <span className="text-xs text-[#2f3437]/40">Last saved {fmt(notesUpdated)}</span>
                )}
              </div>
              {isEditorRole ? (
                <div className="text-sm text-[#2f3437] whitespace-pre-wrap bg-gray-50 rounded-lg px-4 py-3 min-h-[80px]">
                  {notes || <span className="text-[#2f3437]/30 italic">No coaching notes yet.</span>}
                </div>
              ) : (
                <>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={6}
                    placeholder="Private coaching notes about this member…"
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30 resize-none"
                  />
                  <button
                    onClick={handleSaveNotes}
                    disabled={notesSaving}
                    className="mt-2 bg-[#111] hover:bg-[#2a3a4d] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    {notesSaving ? "Saving…" : "Save Notes"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="space-y-4">
            {/* Membership Level quick selector */}
            {!isEditorRole && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-[#2f3437] mb-3">Membership Level</h2>
                <select
                  value={quickTier}
                  onChange={(e) => setQuickTier(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30 mb-2"
                >
                  {SERVICE_TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button
                  onClick={handleQuickTierSave}
                  disabled={tierSaving || quickTier === member.serviceTier}
                  className={`w-full text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
                    quickTier === member.serviceTier ? "bg-gray-100 text-gray-400 cursor-default"
                    : "bg-[#111] hover:bg-[#2a3a4d] text-white"
                  }`}
                >
                  {tierSaving ? "Saving…" : "Save Tier"}
                </button>
              </div>
            )}

            {/* AI Tools Usage */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-[#2f3437] mb-3">AI Tools Usage</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#2f3437]/50">Avatar saved</span>
                  <span className={`text-xs font-semibold ${member?.avatarName ? "text-green-600" : "text-[#2f3437]/30"}`}>
                    {member?.avatarName ? `✓ ${member.avatarName}` : "None"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#2f3437]/50">Themes saved</span>
                  <span className={`text-xs font-semibold ${member?.videoThemes ? "text-green-600" : "text-[#2f3437]/30"}`}>
                    {member?.videoThemes ? "✓ Yes" : "None"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#2f3437]/50">Scripts built</span>
                  <span className="text-xs font-semibold text-[#2f3437]">{toolsUsage?.scriptsCount ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#2f3437]/50">Title analyses</span>
                  <span className="text-xs font-semibold text-[#2f3437]">{toolsUsage?.analysesCount ?? "—"}</span>
                </div>
                {toolsUsage?.lastActivity && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#2f3437]/50">Last active</span>
                    <span className="text-xs font-semibold text-[#2f3437]">{new Date(toolsUsage.lastActivity).toLocaleDateString()}</span>
                  </div>
                )}
                {!member?.avatarName && !toolsUsage?.scriptsCount && (
                  <p className="text-xs text-[#2f3437]/30 italic pt-1">No AI tool activity yet</p>
                )}
              </div>
            </div>

            {/* Stripe */}
            {!isEditorRole && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-[#2f3437] mb-3">Stripe</h2>
                {member.stripeCustomerId ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[#2f3437]/50 text-xs shrink-0">Customer</span>
                      <a
                        href={`https://dashboard.stripe.com/customers/${member.stripeCustomerId}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[#6ba3c7] hover:underline font-mono text-xs truncate text-right"
                      >
                        {member.stripeCustomerId}
                      </a>
                    </div>
                    {member.stripePlanName && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#2f3437]/50 text-xs">Plan</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[#2f3437]">{member.stripePlanName}</span>
                          {member.subscriptionStatus && (() => {
                            const cfg = subCfg[member.subscriptionStatus];
                            if (!cfg) return null;
                            return (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.cls}`}>
                                {cfg.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                    {member.stripePriceAmount != null && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#2f3437]/50 text-xs">Amount</span>
                        <span className="text-xs font-semibold text-emerald-700">
                          ${Math.round(member.stripePriceAmount / 100).toLocaleString("en-CA")}/mo
                          {member.stripeCurrency && (
                            <span className="ml-1 font-normal text-[#2f3437]/40">{member.stripeCurrency}</span>
                          )}
                        </span>
                      </div>
                    )}
                    {member.stripeCurrentPeriodEnd && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#2f3437]/50 text-xs">
                          {member.subscriptionStatus === "cancelled" ? "Ended" : "Renews"}
                        </span>
                        <span className="text-xs text-[#2f3437]/70">
                          {new Date(member.stripeCurrentPeriodEnd).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-[#2f3437]/40 mb-2">No Stripe customer linked.</p>
                    <button
                      onClick={() => setStripeLinkOpen(true)}
                      className="w-full text-xs font-medium text-[#6ba3c7] border border-[#6ba3c7]/30 hover:bg-[#6ba3c7]/5 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Link Stripe Customer
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-[#2f3437] mb-4">Quick Actions</h2>
              <div className="space-y-2">
                {member.youtubeChannelUrl && (
                  <a href={member.youtubeChannelUrl} target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-[#2f3437] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                  >
                    <ArrowTopRightOnSquareIcon className="w-4 h-4 text-[#6ba3c7]" />
                    View on YouTube
                  </a>
                )}
                <a href={`mailto:${member.email}`}
                  className="w-full flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-[#2f3437] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  <EnvelopeIcon className="w-4 h-4 text-[#6ba3c7]" />
                  Email Member
                </a>
                {member.phone && (
                  <a href={`tel:${member.phone}`}
                    className="w-full flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-[#2f3437] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                  >
                    <PhoneIcon className="w-4 h-4 text-[#6ba3c7]" />
                    Call Member
                  </a>
                )}
                {member.ghlContactId && (
                  <a
                    href={`https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${member.ghlContactId}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-[#2f3437] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                  >
                    <ArrowTopRightOnSquareIcon className="w-4 h-4 text-gray-400" />
                    View in GHL
                  </a>
                )}
              </div>
            </div>

            {/* Danger Zone */}
            {!isEditorRole && (
              <div className="bg-white rounded-lg border border-red-200 p-5">
                <h2 className="text-sm font-semibold text-red-600 mb-3">Danger Zone</h2>
                {member.stripeCustomerId && (
                  <button
                    onClick={handleStripeUnlink}
                    disabled={unlinking}
                    className="w-full mb-2 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 px-4 py-2.5 rounded-lg transition-colors"
                  >
                    {unlinking ? "Unlinking…" : "Unlink Stripe"}
                  </button>
                )}
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
                      This will permanently delete <strong>{member.fullName || member.email}</strong> and all their data. This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={handleDeleteMember} disabled={deletingMember} className="flex-1 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                        {deletingMember ? "Deleting…" : "Yes, Delete"}
                      </button>
                      <button onClick={() => setConfirmDeleteMember(false)} className="flex-1 text-sm font-medium text-[#2f3437] border border-gray-200 hover:bg-gray-50 px-4 py-2.5 rounded-lg transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROGRESS TAB ──────────────────────────────────────────── */}
      {activeTab === "progress" && (
        <div className="space-y-6">
          {/* Audit History */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[#2f3437]">Audit History</h2>
            </div>
            {member.audits?.length === 0 ? (
              <p className="text-sm text-[#2f3437]/50 text-center py-8">
                No audits yet — use the Run Audit button in the header to generate the first baseline.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["Date", "Type", "Score", "Actions"].map((h, i) => (
                        <th key={h} className={`py-2 pr-4 text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {member.audits.map((audit: any) => (
                      <tr key={audit.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-3 pr-4 text-[#2f3437]/70">{fmt(audit.createdAt)}</td>
                        <td className="py-3 pr-4 text-[#2f3437]">
                          {audit.auditType === "single_video" ? (() => {
                            const vid = (audit.videosAnalysed as any)?.[0];
                            const videoId = vid?.videoId;
                            const title = vid?.title ?? "Single Video";
                            const truncated = title.length > 50 ? title.slice(0, 50) + "…" : title;
                            return (
                              <div className="flex items-center gap-2">
                                {videoId && (
                                  <img src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} alt="" className="w-12 h-[34px] rounded object-cover shrink-0" />
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
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-3 text-right">
                          {!isEditorRole && confirmDeleteId === audit.id ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-xs text-[#2f3437]/50">Delete?</span>
                              <button onClick={() => handleDeleteAudit(audit.id)} disabled={deletingAuditId === audit.id} className="text-xs text-[#ff0033] font-semibold hover:underline">
                                {deletingAuditId === audit.id ? "Deleting…" : "Yes"}
                              </button>
                              <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400 hover:text-gray-600">No</button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-3">
                              <Link href={`/admin/audits/${audit.id}`} className="text-[#6ba3c7] hover:underline text-xs">View →</Link>
                              {!isEditorRole && (
                                <button onClick={() => setConfirmDeleteId(audit.id)} className="text-xs text-gray-300 hover:text-[#ff0033] transition-colors">Delete</button>
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

          {/* 16-Principle Breakdown */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setBreakdownOpen((o) => !o)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <span className="text-base font-semibold text-[#2f3437]">16-Principle Breakdown</span>
              <div className="flex items-center gap-2">
                {latestAudit && <span className="text-xs text-[#2f3437]/40 font-medium">{DIMENSIONS.length} categories</span>}
                <ChevronDownIcon className={`w-4 h-4 text-[#2f3437]/40 transition-transform duration-200 ${breakdownOpen ? "rotate-180" : ""}`} />
              </div>
            </button>
            {breakdownOpen && (
              <div className="px-6 pb-6 border-t border-gray-100">
                {!latestAudit ? (
                  <p className="text-sm text-[#2f3437]/50 text-center py-8">Scores will appear after the first audit.</p>
                ) : (
                  <div className="space-y-6 pt-4">
                    {DIMENSIONS.map((dim) => {
                      const dimScores = dim.keys.map((k) => extractScore(rawLatestScores, k)).filter((s): s is number => s != null);
                      const dimAvg = dimScores.length > 0 ? dimScores.reduce((a, b) => a + b, 0) / dimScores.length : null;
                      return (
                        <div key={dim.label}>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-[#2f3437]">{dim.label}</h3>
                            {dimAvg != null && (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBg(dimAvg)}`}>Avg {dimAvg.toFixed(1)}</span>
                            )}
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="text-left pb-1.5 text-xs text-[#2f3437]/40 font-medium">Principle</th>
                                <th className="text-center pb-1.5 text-xs text-[#2f3437]/40 font-medium">Score</th>
                                <th className="text-center pb-1.5 text-xs text-[#2f3437]/40 font-medium">Δ Baseline</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dim.keys.map((key) => {
                                const score = extractScore(rawLatestScores, key);
                                const base = extractScore(rawBaselineScores, key);
                                const principle = PRINCIPLE_LABELS[key] ?? key;
                                const delta = score != null && base != null ? score - base : null;
                                return (
                                  <tr key={principle} className="border-b border-gray-50 last:border-0">
                                    <td className="py-2 text-[#2f3437]">{principle}</td>
                                    <td className="py-2 text-center">
                                      {score != null ? (
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(score)}`}>{score.toFixed(1)}</span>
                                      ) : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="py-2 text-center text-xs font-semibold">
                                      {delta == null ? <span className="text-gray-400">—</span>
                                        : delta > 0 ? <span className="text-green-600">+{delta.toFixed(1)}</span>
                                        : delta < 0 ? <span className="text-[#ff0033]">{delta.toFixed(1)}</span>
                                        : <span className="text-gray-400">0.0</span>}
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

          {/* Academy Progress */}
          {academyProgress && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-[#2f3437]">Academy Progress</h2>
                <span className="text-sm font-bold text-[#6ba3c7]">{academyProgress.overall?.pct ?? 0}%</span>
              </div>
              <div className="mb-5">
                <div className="flex items-center justify-between text-xs text-[#2f3437]/50 mb-1">
                  <span>Overall</span>
                  <span>{academyProgress.overall?.completed ?? 0}/{academyProgress.overall?.total ?? 0} lessons</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#6ba3c7] rounded-full transition-all" style={{ width: `${academyProgress.overall?.pct ?? 0}%` }} />
                </div>
              </div>
              {Array.isArray(academyProgress.sections) && academyProgress.sections.length > 0 && (
                <div className="space-y-2 mb-5">
                  {academyProgress.sections.map((sec: any) => {
                    const pct = sec.total > 0 ? Math.round((sec.completed / sec.total) * 100) : 0;
                    return (
                      <div key={sec.id}>
                        <div className="flex items-center justify-between text-xs text-[#2f3437]/60 mb-0.5">
                          <span className="truncate max-w-[200px]">{sec.title}</span>
                          <span className="shrink-0 ml-2">{sec.completed}/{sec.total}</span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-[#6ba3c7]"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-[#2f3437]">
                    {academyProgress.workbook?.filled ?? 0}
                    <span className="text-sm font-normal text-[#2f3437]/40">/{academyProgress.workbook?.total ?? 0}</span>
                  </p>
                  <p className="text-xs text-[#2f3437]/50 mt-0.5">Workbook fields</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-[#2f3437]">
                    {academyProgress.homework?.completed ?? 0}
                    <span className="text-sm font-normal text-[#2f3437]/40">/{academyProgress.homework?.total ?? 0}</span>
                  </p>
                  <p className="text-xs text-[#2f3437]/50 mt-0.5">Homework items</p>
                </div>
              </div>
              {academyProgress.lastLesson && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs text-[#2f3437]/50 mb-0.5">Last completed lesson</p>
                  <p className="text-sm font-medium text-[#2f3437] truncate">{academyProgress.lastLesson.title}</p>
                  {academyProgress.lastLesson.date && (
                    <p className="text-xs text-[#2f3437]/40 mt-0.5">
                      {new Date(academyProgress.lastLesson.date).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}
                    </p>
                  )}
                </div>
              )}
              {academyProgress.overall?.total === 0 && (
                <p className="text-sm text-[#2f3437]/40 italic">No academy content published yet.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CAMPAIGNS TAB ─────────────────────────────────────────── */}
      {activeTab === "campaigns" && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[#2f3437]">Tracking Links</h2>
              <button className="text-sm text-[#6ba3c7] hover:text-[#5490b5] font-medium">+ Create Link</button>
            </div>
            {member.links?.length === 0 ? (
              <p className="text-sm text-[#2f3437]/50 text-center py-6">No tracking links yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["Link Name", "Short URL", "Clicks", "Conversions", "Conv. Rate"].map((h) => (
                        <th key={h} className="text-left py-2 pr-4 text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider last:text-right">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {member.links.map((link: any) => {
                      const clicks = link.clicks?.length ?? 0;
                      const conversions = link.clicks?.filter((c: any) => c.lead).length ?? 0;
                      const rate = clicks > 0 ? ((conversions / clicks) * 100).toFixed(1) + "%" : "—";
                      return (
                        <tr key={link.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-3 pr-4 text-[#2f3437]">{link.name}</td>
                          <td className="py-3 pr-4"><span className="text-[#6ba3c7] font-mono text-xs">/{link.refCode}</span></td>
                          <td className="py-3 pr-4 text-[#2f3437]">{clicks}</td>
                          <td className="py-3 pr-4 text-[#2f3437]">{conversions}</td>
                          <td className="py-3 text-right text-[#2f3437]">{rate}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AI INPUTS TAB ─────────────────────────────────── */}
      {activeTab === "ai_inputs" && (
        <div className="space-y-6">
          {/* Avatar Profile */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-[#2f3437]">Avatar Profile</h2>
                <p className="text-xs text-[#2f3437]/50 mt-0.5">The ideal customer avatar document used as AI context</p>
              </div>
              {member?.avatarName && (
                <span className="text-xs text-[#6ba3c7] bg-[#6ba3c7]/10 px-2.5 py-1 rounded-full font-medium">{member.avatarName}</span>
              )}
            </div>
            {member?.avatarProfile && (
              <div className="mb-4">
                {member.avatarSummary && (
                  <p className="text-sm text-[#2f3437]/70 mb-3 leading-relaxed">{member.avatarSummary}</p>
                )}
                {Array.isArray(member.contentThemes) && member.contentThemes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {(member.contentThemes as unknown[]).map((t, i) => {
                      const label = typeof t === "string" ? t
                        : t && typeof t === "object" && "name" in t
                          ? `${(t as any).emoji ?? ""} ${(t as any).name ?? ""}`.trim() : null;
                      return label ? (
                        <span key={i} className="text-xs bg-[#6ba3c7]/10 text-[#6ba3c7] px-2.5 py-1 rounded-full font-medium">{label}</span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            )}
            {!member?.avatarProfile && (
              <p className="text-sm text-[#2f3437]/40 mb-3">No avatar saved for this member yet.</p>
            )}
            {isEditorRole ? (
              avatarText ? (
                <div className="text-sm text-[#2f3437] whitespace-pre-wrap bg-gray-50 rounded-lg px-4 py-3 font-mono max-h-72 overflow-y-auto">{avatarText}</div>
              ) : (
                <p className="text-sm text-[#2f3437]/30 italic">No avatar document saved.</p>
              )
            ) : (
              <>
                <textarea
                  value={avatarText}
                  onChange={(e) => setAvatarText(e.target.value)}
                  rows={10}
                  placeholder="Paste or type the avatar document here. You can use plain text or JSON."
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#2f3437] font-mono focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30 resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <button
                    onClick={handleSaveAdminAvatar}
                    disabled={avatarSaving}
                    className="ml-auto bg-[#111] hover:bg-[#2a3a4d] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    {avatarSaving ? "Saving…" : "Save Avatar"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Video Themes */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-[#2f3437]">Video Themes</h2>
              <p className="text-xs text-[#2f3437]/50 mt-0.5">Recurring themes and content pillars for this member&apos;s channel — used as AI context</p>
            </div>
            {isEditorRole ? (
              <div className="text-sm text-[#2f3437] whitespace-pre-wrap bg-gray-50 rounded-lg px-4 py-3 min-h-[120px] leading-relaxed">
                {videoThemes || <span className="text-[#2f3437]/30 italic">No themes saved yet.</span>}
              </div>
            ) : (
              <>
                <textarea
                  value={videoThemes}
                  onChange={(e) => setVideoThemes(e.target.value)}
                  rows={8}
                  placeholder={"Describe the recurring themes and content pillars for this channel.\n\nExamples:\n- Real estate tips for first-time buyers in Calgary\n- Behind-the-scenes of listing a luxury home\n- Local market updates and trends\n- Neighbourhood spotlights"}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30 resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <button
                    onClick={handleSaveVideoThemes}
                    disabled={videoThemesSaving}
                    className="ml-auto bg-[#111] hover:bg-[#2a3a4d] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    {videoThemesSaving ? "Saving…" : "Save Themes"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Single Video Selection Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-[#2f3437]">Select a Video to Audit</h2>
                <p className="text-xs text-[#2f3437]/50 mt-0.5">Choose from {member.fullName}&apos;s 10 most recent long-form videos</p>
              </div>
              <button onClick={() => setShowVideoModal(false)} className="text-[#2f3437]/40 hover:text-[#2f3437] transition-colors">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {videoModalLoading && (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-[#6ba3c7]" />
                  <p className="text-sm text-[#2f3437]/50">Fetching videos…</p>
                </div>
              )}
              {videoModalError && (
                <div className="bg-[#ffe5ea] border border-[#ff0033]/20 text-[#ff0033] rounded-lg p-4 text-sm">{videoModalError}</div>
              )}
              {!videoModalLoading && !videoModalError && (
                <div className="space-y-2">
                  {videoModalVideos.map((v: any) => (
                    <button
                      key={v.videoId}
                      onClick={() => setSelectedVideoId(v.videoId)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ${
                        selectedVideoId === v.videoId ? "border-[#6ba3c7] bg-[#e8f7ff]" : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <img src={v.thumbnailUrl} alt="" className="w-24 h-14 rounded object-cover shrink-0 bg-gray-100" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#2f3437] line-clamp-2 leading-snug">{v.title}</p>
                        <p className="text-xs text-[#2f3437]/50 mt-1">
                          {v.durationFormatted} · {new Date(v.uploadDate).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })} · {v.viewCount?.toLocaleString()} views
                        </p>
                      </div>
                      {selectedVideoId === v.videoId && <CheckIcon className="w-5 h-5 text-[#6ba3c7] shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <p className="text-xs text-[#2f3437]/40">
                {selectedVideoId ? "Video selected — ready to audit" : "Click a video to select it"}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowVideoModal(false)} className="px-4 py-2 text-sm font-medium text-[#2f3437] hover:bg-gray-50 rounded-lg transition-colors">Cancel</button>
                <button
                  onClick={() => { setShowVideoModal(false); runAudit("single_video", selectedVideoId!); }}
                  disabled={!selectedVideoId}
                  className="px-4 py-2 text-sm font-semibold bg-[#6ba3c7] hover:bg-[#5490b5] text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Run Audit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stripe Link Modal */}
      {stripeLinkOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-[#2f3437]">Link Stripe Customer</h2>
                <p className="text-xs text-[#2f3437]/50 mt-0.5">Search by name or email to find the matching Stripe customer</p>
              </div>
              <button onClick={() => { setStripeLinkOpen(false); setStripeSearchQ(""); setStripeSearchResults([]); setStripeSearchDone(false); }} className="text-[#2f3437]/40 hover:text-[#2f3437]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={stripeSearchQ}
                  onChange={(e) => setStripeSearchQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchStripeCustomers()}
                  placeholder="Name or email…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30"
                />
                <button
                  onClick={searchStripeCustomers}
                  disabled={stripeSearchLoading || !stripeSearchQ.trim()}
                  className="px-4 py-2 bg-[#6ba3c7] hover:bg-[#5490b5] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {stripeSearchLoading ? "…" : "Search"}
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {stripeSearchLoading && (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-[#6ba3c7]" />
                </div>
              )}
              {!stripeSearchLoading && stripeSearchDone && stripeSearchResults.length === 0 && (
                <p className="text-sm text-center text-[#2f3437]/40 py-8">No Stripe customers found.</p>
              )}
              {!stripeSearchLoading && stripeSearchResults.length > 0 && (
                <div className="space-y-2">
                  {stripeSearchResults.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-4 py-3 hover:border-gray-200 hover:bg-gray-50 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#2f3437] truncate">{c.name ?? "—"}</p>
                        <p className="text-xs text-[#2f3437]/50 truncate">{c.email ?? "—"}</p>
                        {c.subscription ? (
                          <p className="text-xs text-[#2f3437]/40 mt-0.5">{c.subscription.planName ?? "Unknown plan"} · <span className="capitalize">{c.subscription.status}</span></p>
                        ) : (
                          <p className="text-xs text-[#2f3437]/30 mt-0.5 italic">No subscription</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleStripeLink(c.id)}
                        disabled={linking}
                        className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-[#2f3437] hover:bg-[#1e2a38] text-white rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {linking ? "Linking…" : "Link"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!stripeSearchDone && !stripeSearchLoading && (
                <p className="text-xs text-center text-[#2f3437]/30 py-6">Type a name or email above and click Search.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "content_planner" && member && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-[#2f3437] mb-4">Content Planner</h2>
          <ContentPlanTable
            apiBase={`/api/admin/members/${member.id}/content-plans`}
            isAdmin
          />
        </div>
      )}

      {activeTab === "calls" && member && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <AdminCallsTab memberId={member.id} />
        </div>
      )}

      {activeTab === "client_hub" && member && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-[#2f3437] mb-4">Client Hub Settings</h2>
          <AdminClientHubTab memberId={member.id} serviceTier={member.serviceTier} />
        </div>
      )}
    </div>
  );
}
