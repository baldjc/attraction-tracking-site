"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  listing_video_builder: "Listing Video Builder",
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

const SECTIONS = [
  {
    id: "start",
    icon: "🏁",
    label: "Get Started",
    description: "Everything starts with knowing who you're talking to.",
    tools: ["avatar_architect"],
    columns: 1,
  },
  {
    id: "create",
    icon: "✍️",
    label: "Create",
    description: "Turn your avatar into ideas and scripts.",
    tools: ["content_engine", "arc_script_builder", "listing_video_builder"],
    columns: 2,
  },
  {
    id: "refine",
    icon: "🔍",
    label: "Refine",
    description: "Score and improve before you publish.",
    tools: ["title_analyzer", "script_review"],
    columns: 2,
  },
  {
    id: "distribute",
    icon: "📤",
    label: "Distribute",
    description: "Turn one video into content everywhere.",
    tools: ["repurpose_content", "description_generator"],
    columns: 2,
  },
];

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
      href: `${basePath}/listing-video-builder`,
      id: "tool-listing-video",
      featureKey: "tool_listing_video_builder",
      icon: "🏠",
      title: "Listing Video Builder",
      description: "Turn any listing into an avatar-driven video — not a home tour, a content strategy",
      extra: avatarStatus,
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

  const toolMap: Record<string, typeof allTools[number]> = {};
  allTools.forEach((t) => {
    const key = t.featureKey.replace("tool_", "");
    toolMap[key] = t;
  });

  let stepNum = 0;

  return (
    <div className="space-y-8">

      {/* Usage warning banner */}
      {!loading && usage && usage.percentUsed >= 50 && (
        <div className={`flex items-start gap-3 border rounded-lg p-4 ${
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

      {/* Sections */}
      {SECTIONS.map((section) => {
        const sectionTools = section.tools
          .map((key) => toolMap[key])
          .filter(Boolean)
          .filter((t) => !featureFlags || featureFlags[t.featureKey] !== false);

        if (sectionTools.length === 0) return null;

        return (
          <div key={section.id}>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">{section.icon}</span>
              <div>
                <h2 className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0] uppercase tracking-wider">
                  {section.label}
                </h2>
                <p className="text-xs text-[#2f3437]/40 dark:text-white/30">
                  {section.description}
                </p>
              </div>
            </div>

            {/* Tool cards */}
            <div className={`grid gap-3 ${
              section.columns === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
            }`}>
              {sectionTools.map((tool) => {
                stepNum++;
                const isAvatarTool = tool.featureKey === "tool_avatar_architect";
                const isLocked = !isAvatarTool && !hasAvatar && !loading;
                const currentStep = stepNum;

                if (isLocked) {
                  return (
                    <div
                      key={tool.href}
                      className="relative bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#2f3437]/10 dark:border-white/10 p-5 opacity-50 cursor-not-allowed select-none"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-[#2f3437]/30 dark:text-white/20">{currentStep}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xl grayscale">{tool.icon}</span>
                            <h3 className="font-semibold text-[#2f3437]/40 dark:text-white/30 text-sm">
                              {tool.title}
                            </h3>
                          </div>
                          <p className="text-xs text-[#2f3437]/30 dark:text-white/20 mt-1">{tool.description}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2">
                        <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                        </svg>
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          Complete your avatar in Step 1 to unlock this tool
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className={`group bg-white dark:bg-[#1a1a1a] rounded-xl border hover:shadow-lg transition-all duration-200 ${
                      isAvatarTool && !hasAvatar
                        ? "border-[#6ba3c7] shadow-md shadow-[#6ba3c7]/10 ring-1 ring-[#6ba3c7]/20"
                        : "border-[#2f3437]/10 dark:border-white/10 hover:border-[#6ba3c7]/50"
                    } ${section.columns === 1 ? "p-6" : "p-5"}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isAvatarTool && !hasAvatar
                          ? "bg-[#6ba3c7] text-white"
                          : "bg-[#6ba3c7]/10 text-[#6ba3c7]"
                      }`}>
                        <span className="text-xs font-bold">{currentStep}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xl">{tool.icon}</span>
                          <h3 className="font-semibold text-[#2f3437] dark:text-white group-hover:text-[#6ba3c7] transition-colors text-sm">
                            {tool.title}
                          </h3>
                          {isAvatarTool && !hasAvatar && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-[#6ba3c7] text-white px-2 py-0.5 rounded-full">
                              Start Here
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#2f3437]/60 dark:text-white/60 mt-1 leading-relaxed">{tool.description}</p>
                        <p className={`text-xs mt-2 font-medium ${
                          tool.badge === "green"
                            ? "text-[#6ba3c7]"
                            : tool.badge === "blue"
                            ? "text-[#2f3437]/50 dark:text-white/50"
                            : "text-amber-600 dark:text-amber-400"
                        }`}>
                          {tool.extra}
                        </p>
                      </div>
                      <span className="text-[#2f3437]/20 dark:text-white/20 group-hover:text-[#6ba3c7]/50 transition-colors text-lg mt-1">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Usage card */}
      {!loading && usage && (
        <div>
          <UsageCard usage={usage} />
        </div>
      )}
    </div>
  );
}
