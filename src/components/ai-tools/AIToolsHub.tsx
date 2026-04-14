"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";

interface AvatarData {
  avatarName?: string | null;
  updatedAt?: string | null;
}

interface SavedScript {
  id: string;
  videoTitle: string;
  createdAt: string;
}

interface UsageData {
  percentUsed: number;
  cap: string;
  totalCost: string;
  remaining: string;
  breakdown: Record<string, string>;
  resetsAt: string;
}

interface FeatureFlags {
  tool_avatar_architect?: boolean;
  tool_content_engine?: boolean;
  tool_arc_script_builder?: boolean;
  tool_title_analyzer?: boolean;
  tool_script_review?: boolean;
  [key: string]: boolean | undefined;
}

interface Props {
  basePath: string;
  featureFlags?: FeatureFlags | null;
}

const TOOL_LABELS: Record<string, string> = {
  arc_script_builder: "ARC Script Builder",
  avatar_architect: "Avatar Architect",
  content_engine: "Content Engine",
  title_thumbnail_analyzer: "Title & Thumbnail Analyzer",
  script_review: "Script Review",
  description_generator: "Description Generator",
};

function UsageCard({ usage }: { usage: UsageData }) {
  const pct = Math.min(100, usage.percentUsed);
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-400" : "bg-[#6ba3c7]";
  const textColor = pct >= 90 ? "text-red-600 dark:text-red-400" : pct >= 75 ? "text-amber-600 dark:text-amber-400" : "text-[#6ba3c7]";

  const breakdownEntries = Object.entries(usage.breakdown).filter(([, v]) => parseFloat(v) > 0);

  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[#2f3437] dark:text-white text-sm">My AI Usage</h3>
        <span className={`text-xs font-semibold ${textColor}`}>{Math.round(pct)}%</span>
      </div>

      <div>
        <div className="h-2 bg-[#111]/10 dark:bg-white/10 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-[#2f3437]/50 dark:text-white/50 mt-2">
          {Math.round(pct)}% of monthly allowance used
        </p>
      </div>

      {breakdownEntries.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-[#2f3437]/5 dark:border-white/5">
          {breakdownEntries.map(([tool, cost]) => {
            const toolPct = parseFloat(usage.cap) > 0
              ? ((parseFloat(cost) / parseFloat(usage.cap)) * 100).toFixed(1)
              : "0.0";
            return (
              <div key={tool} className="flex items-center justify-between">
                <span className="text-xs text-[#2f3437]/60 dark:text-white/60">{TOOL_LABELS[tool] ?? tool}</span>
                <span className="text-xs text-[#2f3437]/50 dark:text-white/50">{toolPct}%</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-[#2f3437]/40 dark:text-white/40">Resets {usage.resetsAt}</p>
    </div>
  );
}

export default function AIToolsHub({ basePath, featureFlags }: Props) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "admin";
  const [avatar, setAvatar] = useState<AvatarData | null>(null);
  const [lastScript, setLastScript] = useState<SavedScript | null>(null);
  const [lastReview, setLastReview] = useState<SavedScript | null>(null);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [savedIdeasCount, setSavedIdeasCount] = useState<number | null>(null);
  const [reviewsCount, setReviewsCount] = useState<number | null>(null);

  const scriptReviewHref = `${basePath}/script-review`;

  useEffect(() => {
    Promise.all([
      fetch("/api/member/avatar").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ai-tools/saved-scripts").then((r) => r.json()).catch(() => ({ scripts: [] })),
      fetch("/api/ai-tools/conversations?toolType=script_review").then((r) => r.json()).catch(() => []),
      fetch("/api/ai-tools/usage/me").then((r) => r.json()).catch(() => null),
      fetch("/api/ai-tools/content-engine/saved-ideas?limit=1").then((r) => r.json()).catch(() => null),
    ]).then(([av, sc, sr, us, si]) => {
      setAvatar(av);
      setLastScript(sc.scripts?.[0] ?? null);
      const count = Array.isArray(sr) ? sr.length : (sr?.conversations?.length ?? 0);
      setReviewsCount(count);
      if (us && us.percentUsed > 0) setUsage(us);
      if (si?.total != null) setSavedIdeasCount(si.total);
      setLoading(false);
    });
  }, []);

  const avatarStatus = loading
    ? "Loading..."
    : avatar?.avatarName
    ? `Using avatar: ${avatar.avatarName}`
    : "No avatar — build one first for best results";

  const allTools = [
    {
      href: `${basePath}/avatar-architect`,
      id: "tool-avatar",
      featureKey: "tool_avatar_architect",
      icon: "🎯",
      title: "Avatar Architect",
      description: "Build your ideal client avatar through a guided coaching conversation",
      extra: avatar?.avatarName
        ? `Avatar: ${avatar.avatarName} — Last updated ${avatar.updatedAt ? new Date(avatar.updatedAt).toLocaleDateString() : "—"}`
        : "No avatar yet — start here",
      badge: avatar?.avatarName ? "green" : "amber",
    },
    {
      href: `${basePath}/content-engine`,
      id: "tool-content-engine",
      featureKey: "tool_content_engine",
      icon: "🚀",
      title: "Content Engine",
      description: "Generate video ideas with titles, talking points, and strategy — organized by your content themes",
      extra: loading
        ? "Loading..."
        : avatar?.avatarName
        ? `Using avatar: ${avatar.avatarName}${savedIdeasCount ? ` · ${savedIdeasCount} saved ideas` : ""}`
        : "No avatar — build one first for best results",
      badge: avatar?.avatarName ? "green" : "amber",
    },
    {
      href: `${basePath}/title-thumbnail-analyzer`,
      id: "tool-title",
      featureKey: "tool_title_analyzer",
      icon: "🔍",
      title: "Title & Thumbnail Analyzer",
      description: "Score your title and thumbnail combination before you publish",
      extra: avatarStatus,
      badge: avatar?.avatarName ? "green" : "amber",
    },
    {
      href: `${basePath}/arc-script-builder`,
      id: "tool-script-builder",
      featureKey: "tool_arc_script_builder",
      icon: "🎬",
      title: "ARC Script Builder",
      description: "Build a complete video script outline using the ARC Method",
      extra: lastScript
        ? `Last script: ${new Date(lastScript.createdAt).toLocaleDateString()}`
        : avatarStatus,
      badge: avatar?.avatarName ? "green" : "amber",
    },
    {
      href: scriptReviewHref,
      id: "tool-review",
      featureKey: "tool_script_review",
      icon: "📋",
      title: "Script Review",
      description: "Paste a script or transcript — get scored on 14 Attraction principles with visual suggestions",
      extra: loading
        ? "Loading..."
        : reviewsCount
        ? `${reviewsCount} saved review${reviewsCount === 1 ? "" : "s"} — last 30 days`
        : "No reviews yet — paste any script to get started",
      badge: "blue",
    },
    {
      href: `${basePath}/repurpose-content`,
      id: "tool-repurpose",
      featureKey: "tool_repurpose_content",
      icon: "♻️",
      title: "Repurpose Content",
      description: "Turn your video transcript into a newsletter, LinkedIn article, Facebook post, blog post, or neighbourhood postcard",
      extra: "Generate both in one click",
      badge: "blue" as const,
    },
    {
      href: `${basePath}/description-generator`,
      id: "tool-description",
      featureKey: "tool_description_generator",
      icon: "📝",
      title: "Description Generator",
      description: "Generate SEO-optimised YouTube descriptions from your video transcript",
      extra: avatarStatus,
      badge: avatar?.avatarName ? "green" : "amber",
    },
  ];

  const hasAvatar = !loading && !!avatar?.avatarName;
  const hasIdeas = !loading && (savedIdeasCount ?? 0) > 0;
  const hasScript = !loading && !!lastScript;

  type StepStatus = "complete" | "current" | "upcoming";
  const workflowSteps: { label: string; sublabel: string; status: StepStatus; targetId: string }[] = [
    {
      label: "Step 1",
      sublabel: "Build Avatar",
      status: hasAvatar ? "complete" : "current",
      targetId: "tool-avatar",
    },
    {
      label: "Step 2",
      sublabel: "Generate Ideas",
      status: hasAvatar && hasIdeas ? "complete" : hasAvatar ? "current" : "upcoming",
      targetId: "tool-content-engine",
    },
    {
      label: "Step 3",
      sublabel: "Write Script",
      status: hasIdeas && hasScript ? "complete" : hasIdeas ? "current" : "upcoming",
      targetId: "tool-script-builder",
    },
    {
      label: "Step 4",
      sublabel: "Review & Package",
      status: hasScript ? "current" : "upcoming",
      targetId: "tool-review",
    },
    {
      label: "Step 5",
      sublabel: "Repurpose",
      status: hasScript ? "current" : "upcoming",
      targetId: "tool-repurpose",
    },
  ];

  const tools = featureFlags
    ? allTools.filter((t) => featureFlags[t.featureKey] !== false)
    : allTools;

  return (
    <div>

      {!loading && usage && (usage.percentUsed >= 50) && (
        <div className={`mb-5 flex items-start gap-3 border rounded-lg p-4 ${
          usage.percentUsed >= 90
            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
            : usage.percentUsed >= 75
            ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
            : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
        }`}>
          <span className="text-lg">{usage.percentUsed >= 90 ? "🚫" : usage.percentUsed >= 75 ? "⚠️" : "ℹ️"}</span>
          <p className={`text-sm ${
            usage.percentUsed >= 90 ? "text-red-700 dark:text-red-300" : usage.percentUsed >= 75 ? "text-amber-700 dark:text-amber-300" : "text-blue-700 dark:text-blue-300"
          }`}>
            {usage.percentUsed >= 100
              ? `You've reached your monthly AI usage limit. Resets ${usage.resetsAt}.`
              : `You've used ${Math.round(usage.percentUsed)}% of your monthly AI budget. Resets ${usage.resetsAt}.`}
          </p>
        </div>
      )}

      {!loading && !avatar?.avatarName && (
        <div className="mb-6 flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <span className="text-xl">💡</span>
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">Start with the Avatar Architect</p>
            <p className="text-amber-700 dark:text-amber-400 text-sm mt-0.5">
              All tools work best when they know who you're speaking to. Build your avatar once and every tool uses it automatically.
            </p>
          </div>
        </div>
      )}

      {!loading && (
        <div className="mb-6">
          <p className="text-[11px] font-semibold text-[#2f3437]/40 dark:text-white/40 uppercase tracking-widest mb-3">
            Your Content Workflow
          </p>
          <div className="flex items-center gap-0 overflow-x-auto pb-1 -mx-1 px-1">
            {workflowSteps.map((step, i) => (
              <div key={step.targetId} className="flex items-center shrink-0">
                <button
                  onClick={() => {
                    const el = document.getElementById(step.targetId);
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    el?.classList.add("ring-2", "ring-[#6ba3c7]", "ring-offset-2");
                    setTimeout(() => el?.classList.remove("ring-2", "ring-[#6ba3c7]", "ring-offset-2"), 1800);
                  }}
                  className={`flex flex-col items-center px-3 py-2 rounded-lg text-center transition-colors ${
                    step.status === "complete"
                      ? "text-[#6ba3c7]"
                      : step.status === "current"
                      ? "bg-[#6ba3c7]/8 dark:bg-[#6ba3c7]/15 text-[#2f3437] dark:text-white"
                      : "text-[#2f3437]/30 dark:text-white/30"
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mb-1 border transition-colors ${
                    step.status === "complete"
                      ? "bg-[#6ba3c7] border-[#6ba3c7] text-white"
                      : step.status === "current"
                      ? "bg-white dark:bg-[#1a1a1a] border-[#6ba3c7] text-[#6ba3c7]"
                      : "bg-transparent border-[#2f3437]/20 dark:border-white/20 text-[#2f3437]/30 dark:text-white/30"
                  }`}>
                    {step.status === "complete" ? "✓" : i + 1}
                  </span>
                  <span className="text-[10px] font-semibold leading-tight whitespace-nowrap">{step.sublabel}</span>
                </button>
                {i < workflowSteps.length - 1 && (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-[#2f3437]/15 dark:text-white/15 shrink-0 mx-0.5" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            id={tool.id}
            href={tool.href}
            className="group bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#2f3437]/10 dark:border-white/10 p-6 hover:border-[#6ba3c7]/50 hover:shadow-lg transition-all duration-200"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">{tool.icon}</span>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[#2f3437] dark:text-white group-hover:text-[#6ba3c7] transition-colors">
                  {tool.title}
                </h2>
                <p className="text-sm text-[#2f3437]/60 dark:text-white/60 mt-1">{tool.description}</p>
                <p className={`text-xs mt-3 font-medium ${tool.badge === "green" ? "text-[#6ba3c7]" : tool.badge === "blue" ? "text-[#2f3437]/50 dark:text-white/50" : "text-amber-600 dark:text-amber-400"}`}>
                  {tool.extra}
                </p>
              </div>
              <span className="text-[#2f3437]/20 dark:text-white/20 group-hover:text-[#6ba3c7]/50 transition-colors text-lg">→</span>
            </div>
          </Link>
        ))}
      </div>

      {!loading && usage && (
        <div className="mt-6">
          <UsageCard usage={usage} />
        </div>
      )}
    </div>
  );
}
