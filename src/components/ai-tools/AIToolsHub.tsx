"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ToolCard } from "@/components/cards";

interface FeatureFlags {
  tool_avatar_architect?: boolean;
  tool_content_engine?: boolean;
  tool_arc_script_builder?: boolean;
  tool_title_analyzer?: boolean;
  tool_script_review?: boolean;
  tool_repurpose_content?: boolean;
  tool_description_generator?: boolean;
  [key: string]: boolean | undefined;
}

interface Props {
  basePath: string;
  featureFlags?: FeatureFlags | null;
}

interface ActivitySummary {
  avatar: { name: string | null; lastEditedLabel: string | null };
  contentEngine: { ideasThisWeek: number };
  arcScript: { draftsInProgress: number };
  titleAnalyzer: { pendingReports: number };
  scriptReview: { lastReviewLabel: string | null };
}

const IconTarget = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5.5" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);
const IconSparkles = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
    <path d="M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z" />
    <path d="M19 14l.8 2L22 17l-2.2 1L19 20l-.8-2L16 17l2.2-1z" />
    <path d="M5 17l.6 1.4L7 19l-1.4.6L5 21l-.6-1.4L3 19l1.4-.6z" />
  </svg>
);
const IconDocPencil = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
    <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2v-8" />
    <path d="M18 2.5l3.5 3.5L13 14.5 9 15.5l1-4z" />
    <path d="M8 13h3M8 17h5" />
  </svg>
);
const IconChart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M3 17h18" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M7 13l3-4 3 3 4-5" />
  </svg>
);
const IconCheckCircle = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12l3 3 5-6" />
  </svg>
);
const IconRepurpose = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
    <path d="M4 7h12a4 4 0 014 4v0M20 17H8a4 4 0 01-4-4v0" />
    <path d="M16 4l3 3-3 3M8 14l-3 3 3 3" />
  </svg>
);
const IconDescription = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);

interface ToolCard {
  href: string;
  name: string;
  tag: string;
  icon: ReactNode;
  featureKey: keyof FeatureFlags;
  activity: string | null;
}

export default function AIToolsHub({ basePath, featureFlags }: Props) {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/member/ai-tools/activity-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSummary(d))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  // Build activity label per tool — hide when count is 0 / no data.
  const avatarActivity =
    summary?.avatar.lastEditedLabel != null
      ? `Last edited ${summary.avatar.lastEditedLabel}`
      : null;
  const ideasActivity =
    summary && summary.contentEngine.ideasThisWeek > 0
      ? `${summary.contentEngine.ideasThisWeek} ideas generated this week`
      : null;
  const draftsActivity =
    summary && summary.arcScript.draftsInProgress > 0
      ? `${summary.arcScript.draftsInProgress} draft${summary.arcScript.draftsInProgress === 1 ? "" : "s"} in progress`
      : null;
  const pendingActivity =
    summary && summary.titleAnalyzer.pendingReports > 0
      ? `${summary.titleAnalyzer.pendingReports} score report${summary.titleAnalyzer.pendingReports === 1 ? "" : "s"} pending review`
      : null;
  const reviewActivity =
    summary?.scriptReview.lastReviewLabel != null
      ? `Last review: ${summary.scriptReview.lastReviewLabel}`
      : null;

  const tools: ToolCard[] = [
    {
      href: `${basePath}/avatar-architect`,
      name: "Avatar Architect",
      tag: "Define who you talk to.",
      icon: IconTarget,
      featureKey: "tool_avatar_architect",
      activity: avatarActivity,
    },
    {
      href: `${basePath}/content-engine`,
      name: "Content Engine",
      tag: "Generate ideas at scale.",
      icon: IconSparkles,
      featureKey: "tool_content_engine",
      activity: ideasActivity,
    },
    {
      href: `${basePath}/arc-script-builder`,
      name: "ARC Script Builder",
      tag: "Write scripts that hold attention.",
      icon: IconDocPencil,
      featureKey: "tool_arc_script_builder",
      activity: draftsActivity,
    },
    {
      href: `${basePath}/title-thumbnail-analyzer`,
      name: "Title & Thumbnail Analyzer",
      tag: "Score before you publish.",
      icon: IconChart,
      featureKey: "tool_title_analyzer",
      activity: pendingActivity,
    },
    {
      href: `${basePath}/script-review`,
      name: "Script Review",
      tag: "Get a second pair of eyes.",
      icon: IconCheckCircle,
      featureKey: "tool_script_review",
      activity: reviewActivity,
    },
    {
      href: `${basePath}/repurpose-content`,
      name: "Repurpose",
      tag: "One video into shorts, threads, emails.",
      icon: IconRepurpose,
      featureKey: "tool_repurpose_content",
      activity: null,
    },
    {
      href: `${basePath}/description-generator`,
      name: "Description Generator",
      tag: "YouTube descriptions, ready to paste.",
      icon: IconDescription,
      featureKey: "tool_description_generator",
      activity: null,
    },
  ].filter((t) => !featureFlags || featureFlags[t.featureKey] !== false);

  const workflow = [
    {
      bold: "Avatar Architect",
      rest: " to define exactly who you’re talking to.",
      lead: "Start with ",
      tag: "Once per quarter",
    },
    {
      bold: "Content Engine",
      rest: " weekly to generate validated ideas from your data.",
      lead: "Run ",
      tag: "Weekly",
    },
    {
      bold: "ARC Script Builder",
      rest: " to write the script, with cited facts auto-anchored.",
      lead: "Use ",
      tag: "Per video",
    },
    {
      bold: "Title & Thumbnail Analyzer",
      rest: " before you publish.",
      lead: "Score with ",
      tag: "Per video",
    },
    {
      bold: "Script Review",
      rest: " for a second-pass quality check.",
      lead: "Run ",
      tag: "Per video",
    },
  ];

  return (
    <div className="font-sans text-[var(--abv-text)]">
      {/* Tools grid — 2 cols; 5th centers below */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-12">
        {tools.map((tool, i) => (
          <ToolCard
            key={tool.href}
            href={tool.href}
            name={tool.name}
            tag={tool.tag}
            icon={tool.icon}
            activity={tool.activity}
            loading={loading}
            orphan={tools.length % 2 === 1 && i === tools.length - 1}
          />
        ))}
      </section>

      {/* Workflow block */}
      <section className="bg-white border border-[var(--abv-border)] rounded-[14px] px-9 py-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="mb-[22px] max-w-[620px]">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--abv-azure-tint)] text-[var(--abv-azure)] text-[11px] font-bold uppercase tracking-[0.12em]">
            <span className="w-[5px] h-[5px] rounded-full bg-[var(--abv-azure)]" />
            Workflow
          </span>
          <h3 className="font-display text-[30px] font-extrabold tracking-[-0.025em] leading-[1.1] mt-3 mb-1.5">
            The order <span className="text-[var(--abv-azure)]">matters</span>.
          </h3>
          <p className="text-sm text-[var(--abv-text-muted)] leading-[1.55] m-0">
            Five tools, used in sequence, become muscle memory for shipping a channel that converts.
            Follow the order until you can run it from memory.
          </p>
        </div>
        <ol className="flex flex-col gap-3.5 list-none p-0 m-0">
          {workflow.map((s, i) => (
            <li
              key={i}
              className={[
                "flex gap-[18px] items-start py-3.5",
                i === workflow.length - 1 ? "border-b-0 pb-0" : "border-b border-[var(--abv-border)]",
              ].join(" ")}
            >
              <span className="flex-shrink-0 w-9 h-9 rounded-full bg-[var(--abv-bg-warm)] inline-flex items-center justify-center font-display font-extrabold text-[15px] text-[var(--abv-ink)] tracking-[-0.01em]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[14.5px] text-[var(--abv-text)] leading-[1.5] pt-1.5">
                {s.lead}
                <strong className="text-[var(--abv-text)] font-bold">{s.bold}</strong>
                {s.rest}
                <span className="inline-block ml-1.5 px-[7px] py-[2px] rounded-full bg-[var(--abv-bg-warm)] font-mono text-[9.5px] text-[var(--abv-text-dim)] tracking-[0.06em] uppercase font-semibold">
                  {s.tag}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
