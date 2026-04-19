"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import ArcScriptUploadPhase from "@/components/ai-tools/ArcScriptUploadPhase";
import ArcScriptChatPhase from "@/components/ai-tools/ArcScriptChatPhase";
import { GROWTH_DWY_TIERS } from "@/lib/content-plan-utils";

function nextStatusForTier(tier: string): string {
  return GROWTH_DWY_TIERS.includes(tier) ? "Not Started" : "Scripted";
}

function SaveStatusBanner({
  plannerSaving,
  plannerSaved,
  plannerSaveError,
  linkedPlanTitle,
  linkedPlanId,
  onRetry,
}: {
  plannerSaving: boolean;
  plannerSaved: boolean;
  plannerSaveError: boolean;
  linkedPlanTitle: string;
  linkedPlanId: string | null;
  onRetry: () => void;
}) {
  if (!plannerSaving && !plannerSaved && !plannerSaveError) return null;
  if (plannerSaving) {
    return (
      <div className="mb-5 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <span className="text-amber-600">⏳</span>
        <p className="text-sm text-amber-700">Saving script to your content plan…</p>
      </div>
    );
  }
  if (plannerSaved) {
    return (
      <div className="mb-5 flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
        <span className="text-green-600">✓</span>
        <p className="text-sm text-green-700 flex-1">
          Script saved to: <strong>{linkedPlanTitle || "your content plan"}</strong>
        </p>
        {linkedPlanId && (
          <a
            href={`/member/content-planner?plan=${linkedPlanId}`}
            className="shrink-0 text-xs font-semibold text-green-700 underline hover:no-underline"
          >
            View in planner →
          </a>
        )}
      </div>
    );
  }
  if (plannerSaveError) {
    return (
      <div className="mb-5 flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <span className="text-red-600">⚠️</span>
        <p className="text-sm text-red-700 flex-1">
          We couldn&apos;t save your script. It&apos;s still safe here in the builder.
        </p>
        <button
          onClick={onRetry}
          className="shrink-0 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-md transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }
  return null;
}

interface Props {
  basePath: string;
  isAdmin?: boolean;
  defaultPlanId?: string;
}

interface ContentTheme {
  name: string;
  emoji?: string | null;
  colour?: string | null;
  content_engine_prompt?: string | null;
}

interface UploadData {
  title: string;
  talkingPoints: string;
  researchSummary: string;
  clientStory: string;
  leadMagnet: string;
  nextVideoPush: string;
  themeName?: string;
  themeContext?: string;
}

interface UsageData {
  percentUsed: number;
  cap: string;
  resetsAt: string;
}

interface PrefillData {
  planId?: string;
  title: string;
  talkingPoints: string[];
  themeName?: string;
  dataToFind?: string;
}

interface AvatarData {
  contentThemes?: ContentTheme[];
}

interface ContentPlanOption {
  id: string;
  title: string;
}

interface ScriptDraftResume {
  id: string;
  videoTitle: string;
  initialData: UploadData;
  messages: { role: "user" | "assistant"; content: string; researchSummary?: string }[];
  currentSection: string;
  completedSections: string[];
  sectionApprovals: { key: string; snippet: string }[];
  updatedAt: string;
}

export default function ArcScriptBuilderTool({ basePath, isAdmin, defaultPlanId }: Props) {
  const [phase, setPhase] = useState<"upload" | "chat">("upload");
  const [uploadData, setUploadData] = useState<UploadData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [prefillData, setPrefillData] = useState<PrefillData | undefined>(undefined);
  const [avatarData, setAvatarData] = useState<AvatarData>({});
  const [plannerSaving, setPlannerSaving] = useState(false);
  const [plannerSaved, setPlannerSaved] = useState(false);
  const [plannerSaveError, setPlannerSaveError] = useState(false);
  const [serviceTier, setServiceTier] = useState<string>("foundations");
  const [linkedPlanId, setLinkedPlanId] = useState<string | null>(null);
  const [finalScript, setFinalScript] = useState<string>("");
  const [contentPlans, setContentPlans] = useState<ContentPlanOption[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [draftToResume, setDraftToResume] = useState<ScriptDraftResume | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const [linkedPlanTitle, setLinkedPlanTitle] = useState<string>("");

  useEffect(() => {
    fetch("/api/ai-tools/usage/me")
      .then((r) => r.json())
      .then((d) => { if (d?.percentUsed != null) setUsage(d); })
      .catch(() => {});
    fetch("/api/member/content-plans")
      .then((r) => r.json())
      .then((d) => {
        if (d?.serviceTier) setServiceTier(d.serviceTier);
        if (Array.isArray(d?.plans)) {
          setContentPlans(
            (d.plans as { id: string; title: string }[]).map((p) => ({ id: p.id, title: p.title }))
          );
          setPlansLoaded(true);
        }
      })
      .catch(() => {});

    // Decide which draft to surface.
    //   1. ?resume=<id>  → that exact draft (My Work flow).
    //   2. plan context  → only the draft for THIS plan, or none. Plan id can come
    //                      from sessionStorage prefill (push from planner) or the
    //                      defaultPlanId URL param.
    //   3. otherwise     → the user's most recent draft (cold sidebar visit).
    if (typeof window === "undefined") { setDraftChecked(true); return; }
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    let plannerPlanId: string | null = null;
    try {
      const raw = sessionStorage.getItem("arc_prefill");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.planId === "string") plannerPlanId = parsed.planId;
      }
    } catch { /* ignore */ }
    const planContextId = plannerPlanId ?? defaultPlanId ?? null;

    let draftUrl: string;
    if (resumeId) {
      draftUrl = `/api/ai-tools/arc-script-builder/draft?id=${encodeURIComponent(resumeId)}`;
    } else if (planContextId) {
      draftUrl = `/api/ai-tools/arc-script-builder/draft?planId=${encodeURIComponent(planContextId)}`;
    } else {
      draftUrl = "/api/ai-tools/arc-script-builder/draft";
    }
    fetch(draftUrl)
      .then((r) => r.json())
      .then((d) => {
        if (d?.draft) setDraftToResume(d.draft as ScriptDraftResume);
      })
      .catch(() => {})
      .finally(() => setDraftChecked(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/member/avatar")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.contentThemes)) {
          setAvatarData({ contentThemes: d.contentThemes });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("arc_prefill");
      if (raw) {
        sessionStorage.removeItem("arc_prefill");
        const data = JSON.parse(raw);
        if (data.title) {
          setPrefillData({
            planId: typeof data.planId === "string" ? data.planId : undefined,
            title: data.title,
            talkingPoints: Array.isArray(data.talkingPoints) ? data.talkingPoints : [],
            themeName: typeof data.theme === "string" ? data.theme : undefined,
            dataToFind: typeof data.dataToFind === "string" ? data.dataToFind : undefined,
          });
          if (typeof data.planId === "string") setLinkedPlanId(data.planId);
        }
      }
    } catch { /* ignore malformed data */ }
    // URL param planId takes over when no sessionStorage prefill exists
    if (!linkedPlanId && defaultPlanId) setLinkedPlanId(defaultPlanId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the linked plan's title for the save banner
  useEffect(() => {
    if (!linkedPlanId) return;
    fetch(`/api/member/content-plans/${linkedPlanId}`)
      .then((r) => r.json())
      .then((d) => { if (d?.plan?.title) setLinkedPlanTitle(d.plan.title); })
      .catch(() => {});
  }, [linkedPlanId]);

  // Auto-save to linked plan as soon as the final script is ready
  useEffect(() => {
    if (!linkedPlanId || !finalScript || plannerSaved || plannerSaving) return;
    setPlannerSaving(true);
    setPlannerSaveError(false);
    // Check current status first — only advance if still "Idea"
    fetch(`/api/member/content-plans/${linkedPlanId}`)
      .then((r) => r.json())
      .then((data) => {
        const currentStatus = data?.plan?.status ?? "";
        const body: Record<string, string | null> = { script: finalScript };
        if (currentStatus === "Idea") body.status = nextStatusForTier(serviceTier);
        return fetch(`/api/member/content-plans/${linkedPlanId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      })
      .then((r) => {
        if (!r.ok) throw new Error("save failed");
        setPlannerSaved(true);
      })
      .catch(() => setPlannerSaveError(true))
      .finally(() => setPlannerSaving(false));
  }, [finalScript, linkedPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveToPlanner(planId?: string) {
    if (plannerSaving) return;
    setPlannerSaving(true);
    setPlannerSaveError(false);
    try {
      const targetPlanId = planId ?? linkedPlanId;
      if (targetPlanId) {
        // Check current status — only advance if still "Idea"
        const checkRes = await fetch(`/api/member/content-plans/${targetPlanId}`);
        const checkData = await checkRes.json();
        const currentStatus = checkData?.plan?.status ?? "";
        const body: Record<string, string | null> = { script: finalScript || null };
        if (currentStatus === "Idea") body.status = nextStatusForTier(serviceTier);
        const res = await fetch(`/api/member/content-plans/${targetPlanId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("save failed");
      } else if (uploadData) {
        const plannerStatus = GROWTH_DWY_TIERS.includes(serviceTier) ? "Not Started" : "Scripted";
        const res = await fetch("/api/member/content-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: uploadData.title,
            status: plannerStatus,
            script: finalScript || null,
            ...(uploadData.themeName ? { theme: uploadData.themeName } : {}),
          }),
        });
        if (!res.ok) throw new Error("save failed");
      }
      setPlannerSaved(true);
    } catch {
      setPlannerSaveError(true);
    } finally {
      setPlannerSaving(false);
    }
  }

  function handleStartBuilding(data: UploadData) {
    setUploadData(data);
    setDraftToResume(null);
    setPhase("chat");
    setPlannerSaved(false);
    setPlannerSaveError(false);
  }

  function handleReset() {
    setUploadData(null);
    setDraftToResume(null);
    setPhase("upload");
    setPlannerSaved(false);
    setPlannerSaveError(false);
  }

  function handleResumeDraft() {
    if (!draftToResume) return;
    setUploadData(draftToResume.initialData);
    setPhase("chat");
    setPlannerSaved(false);
    setPlannerSaveError(false);
  }

  function handleDismissDraft() {
    if (!draftToResume) return;
    fetch(`/api/ai-tools/arc-script-builder/draft?id=${draftToResume.id}`, { method: "DELETE" }).catch(() => {});
    setDraftToResume(null);
  }

  const pct = usage?.percentUsed ?? 0;
  const isLocked = pct >= 100;

  const subtitle =
    phase === "upload"
      ? "Upload your research and set up your video details"
      : "Building your script — work through each section with the AI";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link
          href={basePath}
          className="inline-flex items-center gap-1.5 text-sm text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          AI Tools
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#2f3437]">ARC Script Builder</h1>
          <p className="text-sm text-[#2f3437]/60 mt-1">{subtitle}</p>
        </div>
      </div>

      <SaveStatusBanner
        plannerSaving={plannerSaving}
        plannerSaved={plannerSaved}
        plannerSaveError={plannerSaveError}
        linkedPlanTitle={linkedPlanTitle}
        linkedPlanId={linkedPlanId}
        onRetry={() => handleSaveToPlanner()}
      />

      {usage && pct >= 50 && (
        <div className={`mb-5 flex items-start gap-3 border rounded-lg p-4 ${
          pct >= 90 ? "bg-red-50 border-red-200" : pct >= 75 ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"
        }`}>
          <span className="text-lg">{pct >= 90 ? "🚫" : pct >= 75 ? "⚠️" : "ℹ️"}</span>
          <p className={`text-sm ${pct >= 90 ? "text-red-700" : pct >= 75 ? "text-amber-700" : "text-blue-700"}`}>
            {pct >= 100
              ? `You've reached your monthly AI usage limit. Resets ${usage.resetsAt}.`
              : `You've used ${Math.round(pct)}% of your monthly AI budget. Resets ${usage.resetsAt}.`}
          </p>
        </div>
      )}

      {/* Resume draft banner */}
      {draftChecked && draftToResume && phase === "upload" && (
        <div className="mb-4 bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="font-semibold text-[#2f3437] text-sm">Resume your script in progress</p>
            <p className="text-xs text-[#2f3437]/60 mt-0.5">
              &ldquo;{draftToResume.videoTitle}&rdquo; — last saved {new Date(draftToResume.updatedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleResumeDraft}
              className="px-3 py-1.5 bg-[#6ba3c7] hover:bg-[#5490b5] text-white text-xs font-medium rounded-md transition-colors"
            >
              Resume
            </button>
            <button
              onClick={handleDismissDraft}
              className="px-3 py-1.5 border border-[#2f3437]/20 text-[#2f3437]/60 hover:text-[#2f3437] text-xs font-medium rounded-md transition-colors"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}

      {isLocked && phase === "upload" ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-lg p-8 text-center">
          <p className="text-2xl mb-3">🚫</p>
          <p className="font-semibold text-[#2f3437] mb-1">Monthly limit reached</p>
          <p className="text-sm text-[#2f3437]/60">
            Your AI usage resets on {usage?.resetsAt}. Come back then to build your next script.
          </p>
        </div>
      ) : phase === "upload" ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-lg p-6">
          <ArcScriptUploadPhase
            onStartBuilding={handleStartBuilding}
            isAdmin={isAdmin}
            prefillData={prefillData}
            contentThemes={avatarData.contentThemes ?? []}
          />
        </div>
      ) : uploadData ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-lg p-6" style={{ minHeight: "70vh" }}>
          <ArcScriptChatPhase
            initialData={uploadData}
            onReset={handleReset}
            onScriptComplete={(s) => setFinalScript(s)}
            linkedPlanId={linkedPlanId}
            plannerSaving={plannerSaving}
            plannerSaved={plannerSaved}
            plannerSaveError={plannerSaveError}
            contentPlans={plansLoaded ? contentPlans : []}
            onSaveToPlanner={handleSaveToPlanner}
            resumeMessages={draftToResume?.messages as Parameters<typeof ArcScriptChatPhase>[0]["resumeMessages"]}
            resumeCurrentSection={draftToResume?.currentSection}
            resumeCompletedSections={draftToResume?.completedSections}
            resumeSectionApprovals={draftToResume?.sectionApprovals}
            draftId={draftToResume?.id}
          />
        </div>
      ) : null}
    </div>
  );
}
