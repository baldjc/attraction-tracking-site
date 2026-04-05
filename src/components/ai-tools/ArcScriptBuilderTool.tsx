"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import ArcScriptUploadPhase from "@/components/ai-tools/ArcScriptUploadPhase";
import ArcScriptChatPhase from "@/components/ai-tools/ArcScriptChatPhase";
import { GROWTH_DWY_TIERS } from "@/lib/content-plan-utils";

interface Props {
  basePath: string;
  isAdmin?: boolean;
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

export default function ArcScriptBuilderTool({ basePath, isAdmin }: Props) {
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
  }, []);

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
  }, []);

  // Auto-save to linked plan as soon as the final script is ready
  useEffect(() => {
    if (!linkedPlanId || !finalScript || plannerSaved || plannerSaving) return;
    setPlannerSaving(true);
    setPlannerSaveError(false);
    fetch(`/api/member/content-plans/${linkedPlanId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: finalScript }),
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
        const res = await fetch(`/api/member/content-plans/${targetPlanId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: finalScript || null }),
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
    setPhase("chat");
    setPlannerSaved(false);
    setPlannerSaveError(false);
  }

  function handleReset() {
    setUploadData(null);
    setPhase("upload");
    setPlannerSaved(false);
    setPlannerSaveError(false);
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
          />
        </div>
      ) : null}
    </div>
  );
}
