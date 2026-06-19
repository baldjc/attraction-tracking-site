"use client";

import { useState, type ReactNode } from "react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { upgradeYouTubeImage } from "@/lib/youtube";
import Notice from "@/components/ui/Notice";

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
  show_dont_tell: "Show Don't Tell (est.)",
  values_peppering: "Values Peppering",
  connection_language: "Connection Language",
  story_proof: "Story Proof",
  grade_5_language: "Grade 5 Language",
  binge_architecture: "Binge Architecture",
  consistency: "Consistency",
};

const LEARNING_PATH: Record<string, string> = {
  avatar_clarity: "Lessons 1.1 + 1.2",
  themes_over_topics: "Lesson 1.3",
  lead_magnet_system: "Lesson 1.4",
  values_peppering: "Lesson 2.1",
  connection_language: "Lesson 2.2",
  arc_attention: "Lessons 2.5 + 2.5a + 3.2",
  arc_revelation: "Lesson 2.5",
  arc_connection: "Lessons 2.2 + 2.5",
  curiosity_bridges: "Lesson 2.5",
  story_proof: "Lesson 2.5",
  show_dont_tell: "Lesson 3.3",
  approve_the_click: "Lessons 4.1 + 2.5",
  title_frameworks: "Lesson 4.2",
  binge_architecture: "Lesson 1.3",
  grade_5_language: "N/A (practice-based)",
  consistency: "Lessons 1.3 + 2.4",
};

const QA_ALWAYS: Record<string, string> = {
  lead_magnet_system: "Bring your lead magnet draft for feedback",
  avatar_clarity: "Bring your napkin test for review",
  connection_language: "Bring your next script for review",
  approve_the_click: "Bring your next 3 title/hook combos",
  curiosity_bridges: "Bring a recent script — we'll rewrite transitions live",
};

const QA_IF_LOW: Record<string, string> = {
  arc_attention: "Bring your most recent opening",
  arc_revelation: "Bring one insight — we'll Value Loop it",
  values_peppering: "Share 5 personal values/interests",
  story_proof: "Bring a client story to structure",
  title_frameworks: "Bring your next 5 title ideas",
};

const DIMENSIONS = [
  { label: "🎯 Channel Strategy", keys: ["avatar_clarity", "themes_over_topics", "consistency"] },
  { label: "🎬 Content Impact", keys: ["arc_attention", "arc_revelation", "arc_connection", "title_frameworks", "approve_the_click", "curiosity_bridges"] },
  { label: "📊 Transcript Estimated", keys: ["show_dont_tell"] },
  { label: "🤝 Viewer Connection", keys: ["connection_language", "values_peppering", "story_proof", "grade_5_language"] },
  { label: "📈 Lead Generation", keys: ["lead_magnet_system", "binge_architecture"] },
];

function scoreBg(score: number) {
  if (score >= 7) return "bg-[#e8f7ff] text-[#0ea5d9]";
  if (score >= 5) return "bg-[#fef3c7] text-amber-700";
  return "bg-[#ffe5ea] text-[#cc0029]";
}

function scoreBgBlock(score: number) {
  if (score >= 7) return "bg-[#e8f7ff]";
  if (score >= 5) return "bg-[#fef3c7]";
  return "bg-[#ffe5ea]";
}

function scoreText(score: number) {
  if (score >= 7) return "text-[#0ea5d9]";
  if (score >= 5) return "text-amber-600";
  return "text-[#cc0029]";
}

function deltaColor(d: number) {
  if (d > 0) return "text-green-600";
  if (d < 0) return "text-[#cc0029]";
  return "text-gray-400";
}

function deltaCellBg(d: number | null) {
  if (d == null) return "";
  if (d > 1) return "bg-green-50";
  if (d < -1) return "bg-red-50";
  return "";
}

function priority(score: number) {
  if (score < 4) return { label: "Critical", cls: "bg-[#ffe5ea] text-[#cc0029]" };
  if (score < 6.5) return { label: "Improvement Area", cls: "bg-[#fef3c7] text-amber-700" };
  return { label: "Fine-Tuning", cls: "bg-[#e8f7ff] text-[#0ea5d9]" };
}

function fmt(d: any) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AuditReportView({ audit, chrome }: { audit: any; chrome?: ReactNode }) {
  const [expandedPrinciple, setExpandedPrinciple] = useState<string | null>(null);

  const report = audit.reportContent as any;
  console.log("[AuditReport] reportContent keys:", report ? Object.keys(report) : "null/undefined", "| audit.scores:", audit.scores);
  const rawScores = audit.scores ?? report?.audit_results ?? report?.scores ?? null;
  const scores = (rawScores ?? {}) as Record<string, { score: number; evidence?: string }>;
  const hasScores = Object.keys(scores).length > 0;
  const videos = (audit.videosAnalysed as any[]) ?? [];
  const member = audit.user;
  const baselineScores = report?.baselineScores as any;
  const lastMonthScores = report?.lastMonthScores as any;
  const channelInfo = report?.channelInfo;
  const isSingleVideo = audit.auditType === "single_video";
  const isMonthly = audit.auditType === "monthly";
  const isLead = audit.auditType === "lead";
  const singleVideoTitle = isSingleVideo ? (videos[0]?.title ?? null) : null;
  const phaseReport = report?.phase_report as any;

  const typeLabel = audit.auditType === "baseline" ? "Baseline Audit"
    : audit.auditType === "monthly" ? "Monthly Audit"
    : isLead ? "Lead Audit"
    : "Single Video Audit";

  const whatsWorking: Array<{ strength: string; evidence: string }> =
    report?.whats_working?.length > 0
      ? report.whats_working
      : (report?.strengths ?? []).map((s: string) => ({ strength: s, evidence: "" }));

  const biggestGaps: Array<{ principle: string; score: number; description: string; current_example: string; improved_example: string }> =
    report?.three_biggest_gaps?.length > 0
      ? report.three_biggest_gaps
      : (report?.biggest_gaps ?? []).map((g: string, i: number) => ({
          principle: `Gap ${i + 1}`,
          score: 0,
          description: g,
          current_example: "",
          improved_example: "",
        }));

  const learningGaps = Object.entries(scores)
    .filter(([key, v]: [string, any]) => key !== "show_dont_tell" && v.score != null && v.score < 7)
    .sort(([, a]: [string, any], [, b]: [string, any]) => (a.score ?? 0) - (b.score ?? 0));

  const qaItems: Array<{ key: string; prompt: string; score: number }> = [];
  for (const key of Object.keys(QA_ALWAYS)) {
    if (scores[key]) qaItems.push({ key, prompt: QA_ALWAYS[key], score: scores[key].score });
  }
  for (const key of Object.keys(QA_IF_LOW)) {
    if (scores[key] && scores[key].score >= 4 && scores[key].score <= 6) {
      qaItems.push({ key, prompt: QA_IF_LOW[key], score: scores[key].score });
    }
  }

  // ----- LEAD AUDIT VIEW -----
  // Non-members see a thinner report: orange branding, problems + cost + which
  // membership asset solves it. No improved_example, no per-video deep dive,
  // no learning path, no Q&A. Closes with a conversion narrative + CTAs.
  if (isLead) {
    const leadGaps: Array<{
      principle: string;
      score: number;
      description: string;
      current_example: string;
      what_this_costs_you?: string;
      inside_attraction?: string;
    }> = report?.three_biggest_gaps ?? [];
    const leadVideoBreakdowns: any[] = report?.video_breakdowns ?? [];

    // CTA URLs — discovery call URL is configurable via NEXT_PUBLIC_DISCOVERY_CALL_URL
    const DISCOVERY_CALL_URL =
      process.env.NEXT_PUBLIC_DISCOVERY_CALL_URL ||
      "https://attractionbyvideo.com/discovery-call";
    const CHECKOUT_URL = "https://attractionbyvideo.com/#join";

    function leadDimBadge(score: number | undefined, label: string) {
      if (score == null) return null;
      const bg =
        score >= 7
          ? "bg-[#e8f7ff] text-[#0ea5d9]"
          : score >= 5
          ? "bg-[#fef3c7] text-amber-700"
          : "bg-[#ffe5ea] text-[#cc0029]";
      return (
        <span key={label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${bg}`}>
          {label} {score.toFixed(1)}
        </span>
      );
    }

    return (
      <div className="abv-report max-w-4xl space-y-5 md:space-y-7 print-full-width" id="audit-report">
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@900,800,700,500&f[]=satoshi@400,500,600,700&display=swap"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .abv-report {
                --abv-primary: #1A1A1A;
                --abv-secondary: #6B6B6B;
                --abv-muted: #9B9B9B;
                --abv-azure: var(--abv-azure);
                --abv-crimson: #d64545;
                --abv-border: rgba(0,0,0,0.06);
                font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                color: var(--abv-secondary);
              }
              .abv-report h1, .abv-report h2, .abv-report h3, .abv-report h4 {
                font-family: 'Cabinet Grotesk', 'Satoshi', sans-serif !important;
                letter-spacing: -0.025em !important;
                line-height: 1.1 !important;
              }
              .abv-report h1 { font-weight: 800 !important; font-size: clamp(28px, 4.4vw, 44px) !important; }
              .abv-report h2 { font-weight: 800 !important; font-size: clamp(22px, 3vw, 32px) !important; line-height: 1.15 !important; }
              .abv-report h3 { font-weight: 700 !important; font-size: clamp(18px, 1.6vw, 22px) !important; letter-spacing: -0.02em !important; line-height: 1.25 !important; }
              .abv-report .text-6xl { font-family: 'Cabinet Grotesk', 'Satoshi', sans-serif !important; font-weight: 900 !important; letter-spacing: -0.03em !important; line-height: 1 !important; font-size: clamp(56px, 8vw, 88px) !important; }
              .abv-report .text-3xl { font-family: 'Cabinet Grotesk', 'Satoshi', sans-serif !important; font-weight: 900 !important; letter-spacing: -0.025em !important; }
              .abv-report p { line-height: 1.65; }
              .abv-report .display-num {
                font-family: 'Cabinet Grotesk', 'Satoshi', sans-serif;
                font-weight: 900;
                letter-spacing: -0.03em;
                line-height: 1;
              }
              .abv-report .eyebrow {
                font-family: 'Satoshi', sans-serif;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.18em;
                text-transform: uppercase;
              }
              .abv-report .rounded-lg { border-radius: 18px; }
              .abv-report .rounded-md { border-radius: 12px; }
              .abv-report .border-gray-200 { border-color: var(--abv-border); }
              .abv-report .border-gray-100 { border-color: var(--abv-border); }
              .abv-report a { transition: color 180ms cubic-bezier(0.16, 1, 0.3, 1); }
              .abv-report .text-\\[\\var(--abv-text)\\] { color: var(--abv-primary); }
              .abv-report .border-t.border-gray-200 { border-top-color: var(--abv-border); }
              @media (min-width: 768px) {
                .abv-report > * + * { margin-top: 28px; }
              }
            `,
          }}
        />
        {chrome}

        {/* Print-only logo header */}
        <div className="hidden print:block text-center py-4 border-b border-gray-200 mb-2">
          <p className="text-lg font-black text-[var(--abv-text)] tracking-tight">Attraction by Video</p>
          <p className="text-xs text-[var(--abv-text)]/50">Lead Audit — for {member?.fullName ?? member?.email}</p>
        </div>

        {/* Channel banner — YouTube-style with overlapping avatar */}
        <div className="print-avoid-break">
          <div className="relative w-full h-[120px] sm:h-[200px] rounded-lg overflow-hidden">
            {channelInfo?.bannerUrl ? (
              <img
                src={upgradeYouTubeImage(channelInfo.bannerUrl, 2560) ?? channelInfo.bannerUrl}
                alt="Channel banner"
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = "none";
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-[#2c4a6e] via-[#3a6f9e] to-[var(--abv-azure)]" />
            )}
            {/* Bottom dark gradient for contrast */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent pointer-events-none" />
            <span className="absolute top-3 right-3 inline-block px-2.5 py-0.5 rounded-full bg-orange-500 text-white text-[11px] font-bold uppercase tracking-wider shadow">
              Attraction by Video Channel Audit
            </span>
          </div>
          {/* Avatar overlaps banner */}
          <div className="px-1 -mt-8 sm:-mt-10 relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-white bg-gray-200 overflow-hidden shrink-0 shadow">
              {channelInfo?.thumbnailUrl ? (
                <img
                  src={channelInfo.thumbnailUrl}
                  alt={channelInfo?.title ?? "Channel thumbnail"}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[var(--abv-azure)] to-[#2c4a6e]" />
              )}
            </div>
          </div>
          {/* Identity — sits in the light area below the banner */}
          <div className="px-1 mt-4 sm:mt-5 min-w-0">
            <h1 className="text-[var(--abv-text)] leading-tight">
              {member?.youtubeChannelName || channelInfo?.title || member?.fullName || member?.email}
            </h1>
            <p className="text-xs text-[var(--abv-text)]/55 mt-2 flex flex-wrap items-center gap-x-1.5">
              {(member?.youtubeChannelUrl ||
                member?.youtubeHandle ||
                channelInfo?.handle) && (
                <>
                  <a
                    href={
                      member?.youtubeChannelUrl ??
                      `https://youtube.com/${(member?.youtubeHandle ?? channelInfo?.handle ?? "").replace(/^@?/, "@")}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--abv-crimson)] hover:text-[#cc0029] font-medium underline underline-offset-2"
                  >
                    {member?.youtubeHandle ||
                      channelInfo?.handle ||
                      "View channel on YouTube"}
                    <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                  </a>
                  <span>·</span>
                </>
              )}
              <span>Audited {fmt(audit.createdAt)}</span>
            </p>
          </div>
        </div>

        {/* Inside Attraction by Video — membership frame */}
        <div className="rounded-lg bg-[#0f1216] p-6 sm:p-8 print-avoid-break">
          <p className="text-[11px] font-bold text-white/50 uppercase tracking-[0.18em] mb-3">
            Inside Attraction by Video
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">
            Every gap in this audit has a specific fix inside the Attraction Membership.
          </h2>
          <p className="text-sm text-white/55 mt-2 leading-relaxed max-w-2xl">
            Attraction by Video is the platform that turns this diagnosis into results. You'll find every tool, framework, and training needed to close the gaps this report surfaces and turn your YouTube channel into a lead magnet that attracts the right clients.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            {[
              { icon: "🤖", label: "6 Custom Tools", desc: "Avatar Architect, Content Engine, Title & Thumbnail Analyzer, Script Builder, Script Review, Repurposing Content — and more coming. These aren't generic ChatGPT prompts; they're custom-built for real estate agents doing YouTube." },
              { icon: "🎓", label: "Foundations Academy", desc: "Teaching you how to build a YouTube channel that attracts clients instead of you chasing them. We cover: Channel Strategy → Content Pillars → The ARC Script → Thumbnails & SEO." },
              { icon: "📞", label: "Weekly Live Calls", desc: "Group coaching and hot-seat reviews with the Attraction team. We learn from each other and grow as a community of agents doing YouTube." },
              { icon: "👥", label: "Community of Realtor Creators", desc: "Other entrepreneurs using YouTube to attract clients." },
            ].map((b) => (
              <div key={b.label} className="flex items-start gap-3">
                <span className="text-xl shrink-0 leading-none mt-0.5">{b.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{b.label}</p>
                  <p className="text-xs text-white/55 leading-relaxed">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TOP CTA — discovery call (replaces the old in-widget "Join" button) */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 print-avoid-break">
          <p className="text-sm sm:text-base text-[var(--abv-text)]/85 leading-relaxed max-w-2xl">
            Whenever you&apos;re ready, book a 15-minute discovery call. We&apos;ll get clear on what you&apos;re building, answer your questions about Attraction, and figure out if the membership is the right fit for you.
          </p>
          <div className="mt-5 flex flex-col items-start gap-3">
            <a
              href={DISCOVERY_CALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-6 py-3 rounded-lg bg-[#185FA5] hover:bg-[#0f4d8c] text-white text-sm font-bold transition-colors shadow"
            >
              Book Your 15-Min Discovery Call →
            </a>
            <a
              href={CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--abv-text)]/60 italic hover:text-[var(--abv-azure)] underline-offset-2 hover:underline"
            >
              Already decided? Skip the call and join Attraction now →
            </a>
          </div>
          <p className="text-[11px] text-[var(--abv-text)]/45 italic mt-4">Or keep reading. Your audit starts below.</p>
        </div>

        {/* Founder note from Jared */}
        <div className="bg-[#fdf8f0] border border-[#e8dfd1] rounded-lg p-6 sm:p-8 print-avoid-break">
          <div className="flex flex-col sm:flex-row gap-5 sm:gap-6">
            <div className="w-32 sm:w-[180px] sm:shrink-0 mx-auto sm:mx-0">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-gradient-to-br from-[var(--abv-azure)] to-[#2c4a6e] shadow">
                <img
                  src="https://attractionbyvideo.com/images/jared-headshot.png"
                  alt="Jared Chamberlain"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.style.display = "none";
                    const fb = img.nextElementSibling as HTMLElement | null;
                    if (fb) fb.style.display = "flex";
                  }}
                />
                <div className="w-full h-full hidden items-center justify-center text-white text-3xl font-black" aria-hidden="true">JC</div>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-[var(--abv-text)]/55 uppercase tracking-[0.18em] mb-2">A Note From Jared</p>
              <h3 className="text-xl sm:text-2xl font-bold text-[var(--abv-text)] leading-snug mb-3">
                "I'm not a YouTube guru who's never sold a house."
              </h3>
              <p className="text-sm text-[var(--abv-text)]/80 leading-relaxed">
                Hey — I'm Jared Chamberlain. I built Attraction by Video because YouTube became the most profitable thing in my real estate business: <strong>$171M+ in volume sold</strong> and <strong>$4M+ in GCI</strong> from my channel with <strong>a consistent weekly video since June of 2020</strong> and recently, <strong>one video that generated 230+ leads in 2 days</strong>.
              </p>
              <p className="text-sm text-[var(--abv-text)]/80 leading-relaxed mt-3">
                My channel isn&apos;t the biggest real estate channel out there. Not close. But on the number that actually matters, the deals it brings in, it out-produces almost all of them. That&apos;s not the channel. That&apos;s the system.
              </p>
              <p className="text-sm text-[var(--abv-text)]/80 leading-relaxed mt-3">
                The 16-point framework you see below is the exact same one I run on my own channel, and all our members' channels, every month. If any of the gaps in this report feel impossible to close on your own — that's exactly the reason I built the membership and the reason you should join.
              </p>
              <p className="text-xs text-[var(--abv-text)]/55 italic mt-4">— Jared Chamberlain, Founder of Attraction by Video</p>
            </div>
          </div>
        </div>

        {/* Score + diagnosis */}
        <div className="flex flex-col md:flex-row gap-4 print-avoid-break">
          <div className={`rounded-lg p-5 text-center md:w-44 shrink-0 ${scoreBgBlock(audit.overallScore)}`}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1 text-[var(--abv-text)]/60">Channel Score</p>
            <p className={`text-6xl font-black ${scoreText(Number(audit.overallScore))}`}>
              {audit.overallScore != null ? Number(audit.overallScore).toFixed(1) : "—"}
            </p>
            <p className="text-sm font-medium mt-0.5 text-[var(--abv-text)]/50">/ 10</p>
          </div>
          <div className="flex-1 bg-white rounded-lg border border-gray-200 p-5 flex items-center">
            <p className="text-base text-[var(--abv-text)] leading-relaxed">
              {report?.one_sentence_diagnosis ?? "Diagnosis pending."}
            </p>
          </div>
        </div>

        {/* SECTION A — Score Outcome Bridge */}
        {(() => {
          const scoreNum = audit.overallScore != null ? Number(audit.overallScore) : null;
          const scoreDisplay = scoreNum != null ? scoreNum.toFixed(1) : "—";
          // Band selection: <4, 4-6, 6-8, 8+. Default to 4-6 when score is unknown.
          const band: "under4" | "mid" | "upper" | "top" =
            scoreNum == null ? "mid"
            : scoreNum < 4 ? "under4"
            : scoreNum < 6 ? "mid"
            : scoreNum < 8 ? "upper"
            : "top";
          const rangeLabel =
            band === "under4" ? "1 to 4"
            : band === "mid"   ? "4 to 6"
            : band === "upper" ? "6 to 8"
            : "8+";
          const isHighScore = scoreNum != null && scoreNum >= 8;
          return (
        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 print-avoid-break">
          <p className="text-[11px] font-bold text-[var(--abv-azure)] uppercase tracking-[0.18em] mb-2">Score Analysis</p>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--abv-text)] leading-snug mb-6">
            Here&apos;s what your score actually means.
          </h2>

          {band === "under4" && (
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
              A score of <strong>{scoreDisplay}</strong> means your channel is essentially invisible to the audience you&apos;re trying to reach. People aren&apos;t finding it, aren&apos;t converting, and aren&apos;t coming back. The good news is that almost everything in this report is fixable, and you haven&apos;t been doing this wrong for long enough to dig a deep hole.
            </p>
          )}
          {band === "mid" && (
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
              A score of <strong>{scoreDisplay}</strong> means your channel is visible but invisible. People are watching, but nothing about the experience is telling them what to do next, who you are, or why they should pick up the phone.
            </p>
          )}
          {band === "upper" && (
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
              A score of <strong>{scoreDisplay}</strong> means your channel has real momentum but is leaving leads on the table. You&apos;re attracting and holding viewers. The gap is the conversion layer. Most of the work from here is sharpening the system that already works, not rebuilding from scratch.
            </p>
          )}
          {band === "top" && (
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
              A score of <strong>{scoreDisplay}</strong> means your channel is one of the strongest we audit. You&apos;ve built something that most agents only theorise about. From here, the opportunity is scaling what you already have. More lead capture, deeper binge architecture, and the kind of upsell mechanics that turn an audience into a real business.
            </p>
          )}

          <div className="mt-4">
            <p className="text-sm font-bold text-[var(--abv-text)] mb-1">What channels in the {rangeLabel} range typically produce:</p>
            {band === "under4" && (
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                Very few views, very few comments, and zero leads. Most agents in this range are six months in, frustrated, and starting to wonder if YouTube is even the right channel for them. It is. The system around the videos just hasn&apos;t been built yet.
              </p>
            )}
            {band === "mid" && (
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                Views without leads. The occasional comment or DM. A channel that feels like it should be working harder than it is. The content is on the platform, but it isn&apos;t pulling viewers toward you in any deliberate way. Most agents in this range are six to twelve months into their channel and wondering if it is worth continuing.
              </p>
            )}
            {band === "upper" && (
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                Consistent viewership, a growing subscriber base, and the occasional inbound. The content is doing its job. The system around it hasn&apos;t caught up. Agents at this level usually need targeted fixes in two or three principles, not a full rebuild.
              </p>
            )}
            {band === "top" && (
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                Predictable inbound. Subscribers who behave like prospects. A real lead-to-deal pipeline running off the channel. Agents at this level are usually past the question of whether YouTube works and into the question of how to scale it without breaking what&apos;s already working.
              </p>
            )}
          </div>

          {isHighScore ? (
            <p className="text-sm font-semibold text-[var(--abv-text)] leading-relaxed mt-4">
              You&apos;re already past most of the bar. Here is exactly what&apos;s still holding the number back.
            </p>
          ) : (
            <>
              <div className="mt-4">
                <p className="text-sm font-bold text-[var(--abv-text)] mb-1">What channels at an 8 or higher look like:</p>
                <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                  A predictable trickle of inbound conversations each week. Viewers who reach out already pre-sold, asking specific questions about working with you instead of cold &quot;what&apos;s your fee&quot; inquiries. The channel becomes the primary lead source for the business, not a side project that occasionally produces something.
                </p>
              </div>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-4">
                The gap between the two isn&apos;t talent. It isn&apos;t luck. It isn&apos;t how big your channel is or how many videos you&apos;ve shipped. It&apos;s whether the system around the videos is doing its job.
              </p>
              <p className="text-sm font-semibold text-[var(--abv-text)] leading-relaxed mt-3">
                Here is exactly what is pulling your number down right now.
              </p>
            </>
          )}
        </div>
          );
        })()}

        {/* What's working — 2 strengths only */}
        {whatsWorking.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 print-avoid-break">
            <h2 className="text-base font-semibold text-green-800 mb-3">✅ What&apos;s Working</h2>
            <div className="space-y-3">
              {whatsWorking.slice(0, 2).map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-1 text-green-500 shrink-0">•</span>
                  <div>
                    <p className="text-sm text-green-800 font-medium">{item.strength}</p>
                    {item.evidence && (
                      <p className="text-xs text-green-700/70 mt-0.5 italic">"{item.evidence}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Three biggest problems — current + cost + inside attraction */}
        {leadGaps.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-[var(--abv-text)] mb-4">🎯 Three Biggest Problems</h2>
            <div className="space-y-6">
              {leadGaps.map((gap, i) => (
                <div key={i} className="border-l-4 border-orange-500 pl-4 print-avoid-break">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{i + 1}</span>
                    <span className="text-sm font-bold text-[var(--abv-text)]">{gap.principle}</span>
                    {gap.score > 0 && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(gap.score)}`}>
                        {gap.score.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--abv-text)]/80 mb-3 leading-relaxed">{gap.description}</p>

                  {gap.current_example && (
                    <div className="bg-[#ffe5ea] rounded-lg px-3 py-2 mb-2">
                      <p className="text-xs font-semibold text-[var(--abv-crimson)] mb-1">Current</p>
                      <p className="text-xs text-[var(--abv-text)]/80 italic">"{gap.current_example}"</p>
                    </div>
                  )}

                  {gap.what_this_costs_you && (
                    <Notice variant="warning" title="What this costs you" className="mb-2">
                      {gap.what_this_costs_you}
                    </Notice>
                  )}

                  {gap.inside_attraction && (
                    <div className="bg-[#e8f7ff] border border-[var(--abv-azure)]/30 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-[#0ea5d9] mb-1">Inside Attraction by Video</p>
                      <p className="text-xs text-[var(--abv-text)]/80">{gap.inside_attraction}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MIDDLE CTA — discovery call (no secondary link at this placement) */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 print-avoid-break">
          <p className="text-sm sm:text-base text-[var(--abv-text)]/85 leading-relaxed max-w-2xl">
            You just saw the three biggest gaps in your channel. Every one of them has a fix inside Attraction. If you want to talk through whether the membership is the right move for where you want to take your channel, book a quick call.
          </p>
          <div className="mt-5">
            <a
              href={DISCOVERY_CALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-6 py-3 rounded-lg bg-[#185FA5] hover:bg-[#0f4d8c] text-white text-sm font-bold transition-colors shadow"
            >
              Book Your 15-Min Discovery Call →
            </a>
          </div>
        </div>

        {/* SECTION B — The Attraction Method */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 print-avoid-break">
          <p className="text-[11px] font-bold text-[var(--abv-azure)] uppercase tracking-[0.18em] mb-2">The Attraction Method</p>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--abv-text)] leading-snug mb-6">
            Three loops. One system.
          </h2>
          <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
            The 16 principles in your audit are not a checklist. They are the components of a system. We call it <strong>The Attraction Method</strong>, and it runs on three loops that work together.
          </p>
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-sm font-bold text-[var(--abv-text)] mb-1">
                <span className="mr-2">🧲</span>Attract.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                Get the right viewer to click on your video and stay long enough to be moved. This is where titles, thumbnails, video openings, and the ARC structure live. If this loop is broken, nothing else matters. You can have the best market knowledge in the world and the best closing technique on the planet, but if the right viewer never makes it past the first fifteen seconds, the rest of the system has nothing to work on. Inside Attraction, this is run by the Title and Thumbnail Analyzer, the ARC Script Builder, and the Script Review tool.
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--abv-text)] mb-1">
                <span className="mr-2">🏗️</span>Build.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                Create a library that compounds. The viewer who watched one of your videos has to find a second one that pulls them deeper, and a third one that starts building trust. This is where avatar clarity, content themes, and consistency live. Random topics for random audiences will never build a real library, no matter how many videos you ship. Inside Attraction, this is run by the Avatar Architect, the Content Engine, and the Foundations Academy weeks on Channel Strategy and Content Pillars.
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--abv-text)] mb-1">
                <span className="mr-2">🎣</span>Convert.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                Turn warm viewers into a real conversation. This is where lead magnets, binge architecture, and the trust moments inside the content live. Without this loop, even the best content channel just produces views, not leads. This is the part most YouTube coaches skip entirely. Inside Attraction, this is run by the Lead Magnet System taught in Foundations Week 3, the binge architecture training, and the weekly coaching calls that walk you through it on your own channel.
              </p>
            </div>
          </div>
          <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-5">
            Every principle in your audit maps to one of these three loops. The reason the audit feels overwhelming when you look at it for the first time is not that the principles are complicated. It is that most agents are trying to fix one loop at a time and end up with a channel that is great at attracting and terrible at converting, or great at building and terrible at attracting.
          </p>
          <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-3">
            The Attraction Method makes the three loops run together. That is when a YouTube channel stops feeling like an output and starts feeling like a business.
          </p>
        </div>

        {/* 16-Principle Scorecard — full breakdown with Inside Attraction chips */}
        {hasScores && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 print-page-break print-avoid-break">
            <h2 className="text-base font-semibold text-[var(--abv-text)] mb-1">Your Attraction Score — 16 Principles</h2>
            <p className="text-xs text-[var(--abv-text)]/50 mb-4">Every low score below has a specific tool or training inside Attraction by Video that addresses it.</p>
            <div className="space-y-4">
              {DIMENSIONS.map((dim) => (
                <div key={dim.label}>
                  <h3 className="text-sm font-bold text-[var(--abv-text)] uppercase tracking-wide mb-2 pt-1">{dim.label}</h3>
                  <div className="space-y-1.5">
                    {dim.keys.filter((k) => scores[k]).map((key) => {
                      const val = scores[key] as { score: number | null; evidence?: string; inside_attraction?: string };
                      const isNA = val.score == null;
                      const pct = isNA ? 0 : Math.max(0, Math.min(100, (val.score ?? 0) * 10));
                      const barColor =
                        isNA ? "bg-gray-200"
                        : (val.score ?? 0) >= 7 ? "bg-[#0ea5d9]"
                        : (val.score ?? 0) >= 5 ? "bg-amber-400"
                        : "bg-[#cc0029]";
                      return (
                        <div key={key} className="rounded-lg border border-gray-100 p-3 print-avoid-break">
                          <div className="flex items-center gap-3">
                            <span className={`flex-1 text-sm font-medium ${isNA ? "text-[var(--abv-text)]/40" : "text-[var(--abv-text)]"}`}>
                              {PRINCIPLE_LABELS[key] ?? key}
                            </span>
                            <span className="w-14 text-right">
                              {isNA
                                ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-400">N/A</span>
                                : <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(val.score!)}`}>{val.score!.toFixed(1)}</span>
                              }
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          {val.evidence && (
                            <p className="text-xs text-[var(--abv-text)]/65 mt-2 leading-relaxed">{val.evidence}</p>
                          )}
                          {val.inside_attraction && (
                            <div className="mt-2 inline-flex items-start gap-1.5 bg-[#e8f7ff] border border-[var(--abv-azure)]/30 rounded-md px-2 py-1">
                              <span className="text-[10px] font-bold text-[#0ea5d9] uppercase tracking-wider mt-0.5 shrink-0">Inside Attraction →</span>
                              <span className="text-[11px] text-[var(--abv-text)]/80">{val.inside_attraction}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Videos Analysed — merged: thumbnail + scores + observations + deep dive in one card per video */}
        {videos.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 print-page-break">
            <h2 className="text-base font-semibold text-[var(--abv-text)] mb-4">Videos Analysed</h2>
            <div className="space-y-5">
              {videos.map((v: any, i: number) => {
                const breakdown =
                  leadVideoBreakdowns[i] ??
                  leadVideoBreakdowns.find(
                    (b: any) =>
                      b.video_id === v.videoId ||
                      b.title?.trim().toLowerCase() === v.title?.trim().toLowerCase()
                  );
                const dimScores = breakdown?.dimension_scores as {
                  channel_strategy?: number;
                  content_impact?: number;
                  viewer_connection?: number;
                  lead_generation?: number;
                } | undefined;
                const youtubeUrl = `https://youtube.com/watch?v=${v.videoId}`;

                return (
                  <div key={i} className="border border-gray-100 rounded-lg p-4 print-avoid-break">
                    {/* Top block: thumbnail (left) + meta/scores/observations (right) */}
                    <div className="flex flex-col sm:flex-row gap-4">
                      <a
                        href={youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full sm:w-[160px] sm:shrink-0 aspect-video rounded-md overflow-hidden border border-gray-200 bg-gray-100 relative group"
                      >
                        <img
                          src={`https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`}
                          alt={v.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const img = e.currentTarget;
                            img.style.display = "none";
                            const fb = img.nextElementSibling as HTMLElement | null;
                            if (fb) fb.style.display = "flex";
                          }}
                        />
                        <div
                          className="absolute inset-0 hidden items-center justify-center bg-gray-200 text-gray-400"
                          aria-hidden="true"
                        >
                          <svg viewBox="0 0 24 24" className="w-10 h-10" fill="currentColor">
                            <path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.27 5 12 5 12 5s-6.27 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.73 19 12 19 12 19s6.27 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3-5.2 3z" />
                          </svg>
                        </div>
                      </a>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                          <a
                            href={youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-[var(--abv-azure)] hover:underline flex items-center gap-1"
                          >
                            {v.title}
                            <ArrowTopRightOnSquareIcon className="w-3 h-3 shrink-0 no-print" />
                          </a>
                        </div>
                        <p className="text-xs text-[var(--abv-text)]/40">
                          {fmtDuration(v.durationSeconds)} · {fmt(v.uploadDate)} · {v.viewCount?.toLocaleString()} views
                        </p>
                        {!v.hadTranscript && (
                          <p className="text-xs text-amber-500 mt-1">(no transcript available)</p>
                        )}
                        {dimScores && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {leadDimBadge(dimScores.channel_strategy, "🎯 Strategy")}
                            {leadDimBadge(dimScores.content_impact, "🎬 Content")}
                            {leadDimBadge(dimScores.viewer_connection, "🤝 Connection")}
                            {leadDimBadge(dimScores.lead_generation, "📈 Lead Gen")}
                          </div>
                        )}
                        {breakdown?.whats_working && (
                          <p className="text-xs text-[var(--abv-text)]/75 mt-2">
                            <span className="mr-1 text-green-500">✅</span>{breakdown.whats_working}
                          </p>
                        )}
                        {breakdown?.whats_missing && (
                          <p className="text-xs text-[var(--abv-text)]/75 mt-1">
                            <span className="mr-1 text-amber-500">⚠️</span>{breakdown.whats_missing}
                          </p>
                        )}
                        {breakdown?.inside_attraction && (
                          <div className="mt-2 bg-[#e8f7ff] border border-[var(--abv-azure)]/30 rounded-md px-2.5 py-1.5">
                            <span className="text-[10px] font-bold text-[#0ea5d9] uppercase tracking-wider">Inside Attraction → </span>
                            <span className="text-[11px] text-[var(--abv-text)]/80">{breakdown.inside_attraction}</span>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION C — Your First 30 Days */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 print-avoid-break">
          <p className="text-[11px] font-bold text-[var(--abv-azure)] uppercase tracking-[0.18em] mb-2">Your First 30 Days</p>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--abv-text)] leading-snug mb-6">
            From day one to your first re-audit.
          </h2>
          <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
            We get asked a lot of &quot;what does my first month actually look like.&quot; Here it is, in literal terms.
          </p>
          <div className="mt-5 space-y-5">
            <div className="border-l-2 border-[var(--abv-azure)] pl-4">
              <p className="text-sm font-bold text-[var(--abv-text)] mb-1">Day 1</p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                You get instant access to the platform. The system walks you through your first setup: running the Avatar Architect on your channel, identifying your ideal viewer, and locking your content theme. By the end of day one, you have a written profile of who you should actually be talking to in your videos. Most agents come out of this with a different avatar than they thought they had.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                If you are in our Growth or Done With You program, you also get weekly setup calls for your first 30 days where we build the system with you and remove the guesswork.
              </p>
            </div>
            <div className="border-l-2 border-[var(--abv-azure)] pl-4">
              <p className="text-sm font-bold text-[var(--abv-text)] mb-1">Week 1</p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                Foundations Academy Week 1: Channel Strategy. You learn how to anchor every future video to the right avatar and content theme. By the end of the week, you have used the ARC Script Builder to write your first script on the new framework. This is the first time most members realise the production part is actually faster, not slower, once the strategy is locked.
              </p>
            </div>
            <div className="border-l-2 border-[var(--abv-azure)] pl-4">
              <p className="text-sm font-bold text-[var(--abv-text)] mb-1">Week 2</p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                You ship your first video using the framework. The Title and Thumbnail Analyzer scores your packaging before you publish. If you want feedback on it, you can request a Hot Seat review on the weekly live call. This is where the data starts coming in on what actually changed: better click-through, longer watch time, real comments instead of crickets.
              </p>
            </div>
            <div className="border-l-2 border-[var(--abv-azure)] pl-4">
              <p className="text-sm font-bold text-[var(--abv-text)] mb-1">Week 3</p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                You install your first lead magnet using the Lead Magnet System taught in Foundations Week 3. Now your videos have somewhere for a warm viewer to go. This is the single biggest swing for most agents in the first month. Before this week, your viewers had nothing to do at the end of a video. After this week, they have a reason to give you their email.
              </p>
            </div>
            <div className="border-l-2 border-[var(--abv-azure)] pl-4">
              <p className="text-sm font-bold text-[var(--abv-text)] mb-1">Week 4</p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                You ship your second video. We run the monthly re-audit on your channel using the same 16 principles you were scored on at the start. You get to see exactly which numbers moved, by how much, and which gaps are next on the list. By day 30, you have a system installed, two videos in the new framework, a lead magnet running, and a clear picture of what month 2 should focus on.
              </p>
            </div>
          </div>
          <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-5">
            This is not a hopeful timeline. This is the standard onboarding rhythm we run with every new member.
          </p>
        </div>

        {/* SECTION D — The Math */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 print-avoid-break">
          <p className="text-[11px] font-bold text-[var(--abv-azure)] uppercase tracking-[0.18em] mb-2">The Math</p>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--abv-text)] leading-snug mb-6">
            Let&apos;s do the math out loud.
          </h2>
          <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
            I&apos;d rather show this in real numbers than make a pitch about value. So here is the math out loud.
          </p>
          <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-3">
            This system has been the foundation of my own real estate business since 2020. My YouTube channel is the single most profitable thing I&apos;ve built. Right now it produces <strong>70+ deals a year</strong>, roughly <strong>$45M in volume</strong>, and around <strong>$800K in gross commission income</strong> annually. That is not a one-off. That is an average year, on a channel I&apos;ve published to every single week since June 2020.
          </p>
          <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-3">
            I don&apos;t share those numbers as a brag. I share them as the receipt. The system you&apos;ve just been scored against is the same one running on a channel that&apos;s been in market for years.
          </p>
          <div className="mt-5">
            <p className="text-sm font-bold text-[var(--abv-text)] mb-2">What members commonly aim for</p>
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
              A YouTube channel built on the 16 principles, run consistently, should produce <strong>one closed deal per month from inbound</strong>. Members who hit that benchmark are generally adding <strong>$100K+ in GCI per year</strong> on top of their existing business.
            </p>
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
              That is not a guarantee. It is the conservative target the system is designed around, and it&apos;s the line where the math gets very hard to argue with.
            </p>
          </div>
          <div className="mt-5">
            <p className="text-sm font-bold text-[var(--abv-text)] mb-2">The actual math</p>
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
              Attraction by Video is <strong>$495 USD / $595 CAD per month</strong>. About $5,940 USD or $7,140 CAD per year.
            </p>
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
              The average commission cheque on a closed residential transaction, after broker splits, lands around <strong>$10,000</strong> in most US and Canadian markets in 2026. Give or take, depending on price point and split structure.
            </p>
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
              One YouTube-attributed deal in your first year covers your full year of membership and still leaves $3,000 to $4,000 in your pocket.
            </p>
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
              One deal a month puts you at <strong>$120K+ in additional GCI annually</strong>, on a $6K to $7K spend.
            </p>
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
              If YouTube brings you a single extra deal in the next 12 months, your membership has more than paid for itself. If it does what we&apos;d expect, the math stops being a question and becomes a problem you&apos;ll wish you&apos;d solved sooner.
            </p>
            <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-3">
              The real question isn&apos;t <em>is $495 a lot of money</em>. The question is <em>what is it costing me to keep operating without this system in place</em>.
            </p>
          </div>
        </div>

        {/* How It Works — 3 step path from audit to attracting clients */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 print-avoid-break">
          <p className="text-[11px] font-bold text-[var(--abv-azure)] uppercase tracking-[0.18em] mb-2">How It Works</p>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--abv-text)] leading-snug mb-6">
            From audit to attracting clients — here's the path.
          </h2>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { n: "01", title: "Join", body: "Lock in your rate today (never increases) and get instant access to the full Attraction platform." },
              { n: "02", title: "Build", body: "Work through the Foundations Academy and use the 6 custom AI tools to craft videos designed to attract real estate clients — not just views." },
              { n: "03", title: "Attract", body: "Ship videos consistently with weekly coaching from the Attraction team. Watch your channel turn into a lead magnet that brings clients to you." },
            ].map((s) => (
              <div key={s.n} className="border border-gray-100 rounded-lg p-5">
                <div className="w-12 h-12 rounded-full bg-[var(--abv-dark)]/15 text-[var(--abv-azure)] font-black text-base flex items-center justify-center mb-3">
                  {s.n}
                </div>
                <h3 className="text-base font-bold text-[var(--abv-text)] mb-1.5">{s.title}</h3>
                <p className="text-sm text-[var(--abv-text)]/70 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Member testimonials */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 print-avoid-break">
          <p className="text-[11px] font-bold text-[var(--abv-azure)] uppercase tracking-[0.18em] mb-2">What Members Are Saying</p>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--abv-text)] leading-snug mb-6">
            Real agents. Real results.
          </h2>
          <div className="grid sm:grid-cols-2 gap-5">
            {[
              {
                name: "Julie Roth",
                role: "Foundations Member",
                photo: "https://attractionbyvideo.com/images/avatars/julie-roth.png",
                initials: "JR",
                quote: "Working with Jared has been exactly what I needed to finally take YouTube seriously. I had wanted to do YouTube for years, but lacked clear direction and the motivation to stay consistent. Jared's coaching changed that. His classes are incredibly tactical, practical, and step-by-step — making the entire process easy to understand and actually implement. He doesn't hold anything back. He truly shares his playbook, which has been a game-changer for me.",
              },
              {
                name: "Phil Martin",
                role: "Growth + Foundations Member",
                photo: "https://attractionbyvideo.com/images/avatars/phil-martin.png",
                initials: "PM",
                quote: "Jared is the first person I've ever met that can actually explain the rhyme and the reason — A plus B equals C, meaning leads. Consistent leads. He's cracked a code that takes all the voodoo out and all the complexity out. Forget the hype. Have an approach, do the work, stay consistent. I know for a fact this is passive marketing that consistently generates quality leads.",
              },
            ].map((t) => (
              <div key={t.name} className="border border-gray-100 rounded-lg p-5 flex flex-col">
                <span className="text-4xl leading-none text-[var(--abv-azure)]/40 font-serif mb-1">"</span>
                <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed flex-1">{t.quote}</p>
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-[var(--abv-azure)] to-[#2c4a6e] shrink-0 relative">
                    <img
                      src={t.photo}
                      alt={t.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const img = e.currentTarget;
                        img.style.display = "none";
                        const fb = img.nextElementSibling as HTMLElement | null;
                        if (fb) fb.style.display = "flex";
                      }}
                    />
                    <div className="absolute inset-0 hidden items-center justify-center text-white text-xs font-bold" aria-hidden="true">
                      {t.initials}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--abv-text)] truncate">{t.name}</p>
                    <p className="text-xs text-[var(--abv-text)]/55 truncate">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION E — Honest Answers (FAQ) */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 print-avoid-break">
          <p className="text-[11px] font-bold text-[var(--abv-azure)] uppercase tracking-[0.18em] mb-2">Honest Answers</p>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--abv-text)] leading-snug mb-2">
            The questions every agent has at this point.
          </h2>
          <p className="text-sm text-[var(--abv-text)]/70 leading-relaxed mb-6">
            Here are the real answers.
          </p>
          <div className="space-y-6">
            <div className="border-b border-gray-100 last:border-0 pb-6 last:pb-0 print-avoid-break">
              <h3 className="text-sm font-bold text-[var(--abv-text)] mb-3">&quot;I&apos;m flat out already. I don&apos;t have time to add a YouTube production job on top of selling houses.&quot;</h3>
              <div>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                This is the most common objection we hear, and there&apos;s actually a different way to look at it.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                When you have clear direction, content gets easier, not harder. The reason most agents feel like YouTube is a time sink is because they&apos;re guessing. They sit down to film without knowing who they&apos;re talking to, how to talk to them, or what the video is supposed to do. Half the time spent making a video gets eaten by the figuring-it-out part, not the actual production.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                Inside Attraction by Video, you stop guessing. The frameworks tell you who you&apos;re speaking to (Avatar Architect), how to open the video (ARC Script Builder), and what content to make next (Content Engine). When the strategy is clear, the production part takes a fraction of the time it used to.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                There&apos;s an honest second layer to this question too. Sometimes time isn&apos;t actually the real issue. Sometimes the real bottleneck is the editing, the thumbnails, or the channel strategy itself, and more YouTube knowledge on your plate won&apos;t fix that. For agents in that situation, we run Growth and Done With You programs that handle the production and channel management for you. You shoot the content. We run the rest.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                So the honest answer to the time question: if strategy is your blocker, Foundations and the AI tools solve it inside the first 30 days. If production is your blocker, that is what Growth and Done With You exist for. Either way, time is a fixable problem, not a deal-breaker.
              </p>
              </div>
            </div>
            <div className="border-b border-gray-100 last:border-0 pb-6 last:pb-0 print-avoid-break">
              <h3 className="text-sm font-bold text-[var(--abv-text)] mb-3">&quot;My channel has 40 videos and a couple thousand subscribers, but it isn&apos;t working. Should I delete it and start clean?&quot;</h3>
              <div>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">Almost never.</p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                If your channel has views, you&apos;ve already built something that matters. You have an audience that is interested in who you are. The hard part of YouTube, getting strangers to care, you&apos;ve already done. What you&apos;re dealing with isn&apos;t a viewership problem. It&apos;s a lead generation problem. Viewers are showing up. They&apos;re just not converting into people that you or your team are meeting with.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                That distinction matters because the fix is completely different. Starting over throws away the audience you&apos;ve already built. Pointing your existing channel in the right direction lets you keep everything you&apos;ve earned and start converting it.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                The road back is probably easier than you think. You don&apos;t need to delete old videos, hide the past, or relaunch with a big announcement. You shift what you publish next. The 16 principles in your audit are the levers. Pull the right ones and the same channel that has been quietly underperforming starts producing leads.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                The algorithm doesn&apos;t punish you for what you posted last year. It responds to what you publish this week.
              </p>
              </div>
            </div>
            <div className="border-b border-gray-100 last:border-0 pb-6 last:pb-0 print-avoid-break">
              <h3 className="text-sm font-bold text-[var(--abv-text)] mb-3">&quot;I&apos;ve done YouTube training before. I bought a course from a guy with 500K subs, did the camera and SEO stuff, posted for 6 months, and it didn&apos;t move my business. Why is this different?&quot;</h3>
              <div>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                Fair question. And honestly, you probably weren&apos;t taught the wrong things. You were taught the wrong goal.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                Most YouTube coaching, especially the ones at the top of the search results, treats your channel like an entertainment property. Views, subscribers, likes, watch time. Those are the metrics, and the success story is hitting some monetisation tier or going viral. That works great if your business is YouTube. It does very little for a real estate agent whose business is closing deals.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                The hardest part of YouTube isn&apos;t getting views. It is turning views into a real person who gives you their phone number and their email and shows up for a conversation. That move, view to lead, is where most agents stall. A generic &quot;call me for a free consult&quot; or a phone number on the screen will not get you there. People do not call strangers from the internet. They have to feel like they already know you first.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                What we teach instead is how to create the micro trust moments inside your content that move a viewer from curious to committed. A real lead generation system is built around three things working together: high-quality videos that act as the first interaction, lead magnets that match what the viewer actually came to learn, and funnels that capture them at the moment they are most engaged. The channel becomes the front door of your business, not a YouTube hobby on the side.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                This is the part most YouTube gurus skip, as they have never had to convert a viewer into an actual paying client. I have. The system you are being audited against was built from doing that 70+ times a year for the last four years. It is a lead generation system that happens to use YouTube. Not a YouTube course that hopes for leads.
              </p>
              </div>
            </div>
            <div className="border-b border-gray-100 last:border-0 pb-6 last:pb-0 print-avoid-break">
              <h3 className="text-sm font-bold text-[var(--abv-text)] mb-3">&quot;If I join today and start implementing the 16 principles, when am I realistically going to see something change? When does the first lead come in?&quot;</h3>
              <div>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                This feels like the right question to ask. It usually isn&apos;t.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                What you are about to learn is a new system, and a new system takes time to install. You can either implement it yourself inside the membership, or work with us in our Growth or Done With You programs where we build it for you and with you. Either path works. Neither path is overnight.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                Here is the honest piece most YouTube coaches won&apos;t tell you. When the full system is implemented and operating the way it is supposed to, leads start coming in even from your lowest-viewed videos. The signal isn&apos;t a big viral video. The signal is that the system around the video is doing its job: the right viewer is finding the right content, the lead magnet is matching what they came for, and the funnel is converting them into a real person you can talk to.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                If you give yourself a real runway, somewhere in the three to six month range of doing this correctly, you can take a channel that is currently producing zero leads and turn it into one that is producing real buyers and sellers showing up at your door, in your emails, and in your DMs. Ready to work with you. Not cold strangers you have to convince.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                The agents who get there faster are usually the ones who stop trying to rush the next video and start trusting the system. The ones who stay stuck are the ones who join, change one or two things, post one video, and bail when the leads don&apos;t show up by Friday. This is a build. Not a hack.
              </p>
              </div>
            </div>
            <div className="border-b border-gray-100 last:border-0 pb-6 last:pb-0 print-avoid-break">
              <h3 className="text-sm font-bold text-[var(--abv-text)] mb-3">&quot;This looks great, but I&apos;m not selling Calgary detached homes. I do luxury, or commercial, or rural, or I&apos;m in a smaller market. Is this actually built for me?&quot;</h3>
              <div>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                The system is built to work off of your own channel, talking to your own audience.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                That is the part most agents miss when they look at this from the outside. You are not learning my market, my buyers, or my style. You are using your own data, your own city, your own niche, and your own avatar to create content that speaks to the people you actually want sitting across from you. Whether that is a first-time buyer in a $400K market or a luxury client in a $4M neighbourhood, the framework is the same. The inputs are yours.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                This isn&apos;t a copy and paste system. The 16 principles are universal. The way they get applied to your channel is not. We use custom AI tools that learn your audience and your market over time. The Avatar Architect builds your buyer profile from what you actually do. The Content Engine recommends topics that fit your market, not mine. The Script Builder writes openings that sound like you, not like a Calgary realtor.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                What you put in is what shapes the output. The system gets sharper the more it learns about you, your clients, and what is actually working in your channel. That is how a luxury specialist, a commercial agent, and a brand-new agent can all run the same framework and end up with completely different content engines that work for their specific business.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                If you have a channel and a market, this works. The system meets you where you already are.
              </p>
              </div>
            </div>
            <div className="border-b border-gray-100 last:border-0 pb-6 last:pb-0 print-avoid-break">
              <h3 className="text-sm font-bold text-[var(--abv-text)] mb-3">&quot;I&apos;m not a tech person. I built my business on relationships, not tools. Realistically, am I going to be able to use the AI tools, or will I be the one who joins and never figures it out?&quot;</h3>
              <div>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                If you can have a text or chat conversation on your phone, this will work for you.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                The whole system has been built to be easy to use, no matter your age or your tech level. The AI tools work like a conversation. You answer a few questions in plain English, the tool does the heavy lifting, and you get something usable back. There is no code, no settings to configure, no learning curve that takes weeks. Most members are creating their first usable output inside the tool on day one.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                If you ever get stuck, you have two safety nets. The first is the community and the help inside the platform itself, where you can reach out anytime and get pointed in the right direction. The second is our weekly live coaching calls, where we will walk through anything you are unsure about, on screen, with you. Nobody gets left behind over a tech issue.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                The agents I see hesitate the most about the tech side are usually the ones who get the most leverage from it once they start using it. The tools do the work you would have been guessing at on your own. You don&apos;t need to be a tech expert to use them. You just need to be willing to ask the question.
              </p>
              </div>
            </div>
            <div className="border-b border-gray-100 last:border-0 pb-6 last:pb-0 print-avoid-break">
              <h3 className="text-sm font-bold text-[var(--abv-text)] mb-3">&quot;What happens if I join and decide in 30 or 60 days that it isn&apos;t for me? Am I locked in? Do I lose my rate if I cancel and come back later?&quot;</h3>
              <div>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed">
                The membership is set up as a simple month-to-month, on purpose.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                Some agents only need a couple of months to get traction and start moving forward on their own. Others want to stay longer for the community, the weekly coaching, and the ongoing access to the tools as they evolve. We didn&apos;t want to force anyone into a year-long commitment to find out which one they were. There is no contract. You can cancel anytime, with no fees, no penalty, no questions.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                The one thing worth knowing: when you join today, your rate is locked for as long as you remain a member. If you decide to leave and the membership rate goes up between now and when you come back, you would have to rejoin at the new rate. That is not a pressure tactic. That is just how the rate-lock works for everyone who stays in.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                So the real worst case is this. You join, give the system a fair shot for 30 or 60 days, and if it is not for you, you cancel. You are out one or two months at $495 or $595. No buyout fees. No fine print. Same way you would treat a brokerage tool or a marketing subscription that did not pan out.
              </p>
              <p className="text-sm text-[var(--abv-text)]/85 leading-relaxed mt-2">
                The downside is small. The upside is a YouTube channel that brings you deals for years.
              </p>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM CTA — replaces the old "Ready to Close the Gaps?" card */}
        <div className="rounded-lg bg-[#0f1216] p-6 sm:p-12 text-center print-avoid-break">
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            Ready to close the gaps?
          </h2>
          <p className="text-sm sm:text-base text-white/75 mt-4 leading-relaxed max-w-2xl mx-auto">
            Every gap in this report has a fix inside the membership. Every fix runs on a system that has been built and tested on real estate channels, not just taught in theory.
          </p>
          <p className="text-sm sm:text-base text-white/75 mt-3 leading-relaxed max-w-2xl mx-auto">
            The next step is a 15-minute discovery call where we get clear on your goals, answer your questions about the membership, and confirm fit before you join. No pressure, no pitch. Just a conversation about whether Attraction is the right move for what you&apos;re trying to build.
          </p>
          <div className="mt-7 flex flex-col items-center gap-3">
            <a
              href={DISCOVERY_CALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-6 py-3 rounded-lg bg-[#185FA5] hover:bg-[#0f4d8c] text-white text-sm font-bold transition-colors shadow"
            >
              Book Your 15-Min Discovery Call →
            </a>
            <a
              href={CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/60 italic hover:text-white underline-offset-2 hover:underline"
            >
              Already decided? Skip the call and join Attraction now →
            </a>
            <p className="text-[12px] text-white/55 text-center mt-2">
              $495 USD / $595 CAD per month · Cancel anytime · Rate locked for life.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-6 text-sm text-[var(--abv-text)]/40 border-t border-gray-200">
          Prepared for {member?.fullName ?? member?.email} by Jared Chamberlain ~ Founder of Attraction by Video
        </div>
      </div>
    );
  }

  return (
    <div className="abv-report max-w-4xl space-y-5 md:space-y-7 print-full-width" id="audit-report">
      <link
        rel="stylesheet"
        href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@900,800,700,500&f[]=satoshi@400,500,600,700&display=swap"
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .abv-report {
              --abv-primary: #1A1A1A;
              --abv-secondary: #6B6B6B;
              --abv-muted: #9B9B9B;
              --abv-azure: var(--abv-azure);
              --abv-crimson: #d64545;
              --abv-border: rgba(0,0,0,0.06);
              font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
              color: var(--abv-secondary);
            }
            .abv-report h1, .abv-report h2, .abv-report h3, .abv-report h4 {
              font-family: 'Cabinet Grotesk', 'Satoshi', sans-serif !important;
              letter-spacing: -0.025em !important;
              line-height: 1.1 !important;
            }
            .abv-report h1 { font-weight: 800 !important; font-size: clamp(28px, 4.4vw, 44px) !important; }
            .abv-report h2 { font-weight: 800 !important; font-size: clamp(22px, 3vw, 32px) !important; line-height: 1.15 !important; }
            .abv-report h3 { font-weight: 700 !important; font-size: clamp(18px, 1.6vw, 22px) !important; letter-spacing: -0.02em !important; line-height: 1.25 !important; }
            .abv-report .text-6xl { font-family: 'Cabinet Grotesk', 'Satoshi', sans-serif !important; font-weight: 900 !important; letter-spacing: -0.03em !important; line-height: 1 !important; font-size: clamp(56px, 8vw, 88px) !important; }
            .abv-report .text-3xl { font-family: 'Cabinet Grotesk', 'Satoshi', sans-serif !important; font-weight: 900 !important; letter-spacing: -0.025em !important; }
            .abv-report p { line-height: 1.65; }
            .abv-report .display-num {
              font-family: 'Cabinet Grotesk', 'Satoshi', sans-serif;
              font-weight: 900;
              letter-spacing: -0.03em;
              line-height: 1;
            }
            .abv-report .eyebrow {
              font-family: 'Satoshi', sans-serif;
              font-size: 11px;
              font-weight: 600;
              letter-spacing: 0.18em;
              text-transform: uppercase;
            }
            .abv-report .rounded-lg { border-radius: 18px; }
            .abv-report .rounded-md { border-radius: 12px; }
            .abv-report .border-gray-200 { border-color: var(--abv-border); }
            .abv-report .border-gray-100 { border-color: var(--abv-border); }
            .abv-report a { transition: color 180ms cubic-bezier(0.16, 1, 0.3, 1); }
            .abv-report .text-\\[\\var(--abv-text)\\] { color: var(--abv-primary); }
            .abv-report .border-t.border-gray-200 { border-top-color: var(--abv-border); }
            @media (min-width: 768px) {
              .abv-report > * + * { margin-top: 28px; }
            }
          `,
        }}
      />

      {chrome}

      {/* Print-only logo header */}
      <div className="hidden print:block text-center py-4 border-b border-gray-200 mb-2">
        <p className="text-lg font-black text-[var(--abv-text)] tracking-tight">Attraction by Video</p>
        <p className="text-xs text-[var(--abv-text)]/50">YouTube Channel Audit Report</p>
      </div>

      {/* Banner */}
      {channelInfo?.bannerUrl ? (
        <div className="w-full h-32 rounded-lg overflow-hidden print-avoid-break">
          <img src={upgradeYouTubeImage(channelInfo.bannerUrl, 2560) ?? channelInfo.bannerUrl} alt="Channel banner" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-28 rounded-lg bg-gradient-to-r from-[var(--abv-text)] via-[#2c4a6e] to-[var(--abv-azure)] print-avoid-break" />
      )}

      {/* Header callout */}
      <div className="bg-[var(--abv-dark)]/10 border border-[var(--abv-azure)]/30 rounded-lg p-6 print-avoid-break">
        <div className="flex flex-col md:flex-row md:items-start gap-5 md:gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[var(--abv-azure)] uppercase tracking-wider mb-1">
              Attraction by Video — {typeLabel}
            </p>
            <h1 className="text-2xl font-bold text-[var(--abv-text)]">{member?.fullName ?? member?.email}</h1>
            {isSingleVideo && singleVideoTitle ? (
              <p className="text-[var(--abv-text)]/80 font-medium mt-1">"{singleVideoTitle}"</p>
            ) : (
              (member?.youtubeChannelName || channelInfo?.title || member?.youtubeHandle) && (
                <p className="text-[var(--abv-text)]/60 mt-1">
                  {member?.youtubeChannelName || channelInfo?.title || member?.youtubeHandle}
                </p>
              )
            )}
            <p className="text-sm text-[var(--abv-text)]/50 mt-1">{fmt(audit.createdAt)}</p>
          </div>
          {isSingleVideo && videos[0]?.videoId && (
            <div className="w-full md:w-72 lg:w-80 shrink-0 no-print">
              <div className="relative aspect-video rounded-md overflow-hidden bg-black shadow-md">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${videos[0].videoId}?rel=0&modestbranding=1`}
                  title={videos[0].title ?? "Audited video"}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full border-0"
                />
              </div>
              <a
                href={`https://youtube.com/watch?v=${videos[0].videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[11px] text-[var(--abv-text)]/55 hover:text-[var(--abv-azure)] mt-1.5 text-right"
              >
                Watch on YouTube ↗
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Score + Diagnosis — side-by-side on desktop */}
      <div className="flex flex-col md:flex-row gap-4 print-avoid-break">
        <div className={`rounded-lg p-5 text-center md:w-44 shrink-0 ${scoreBgBlock(audit.overallScore)}`}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1 text-[var(--abv-text)]/60">
            {isSingleVideo ? "Video Score" : "Channel Score"}
          </p>
          <p className={`text-6xl font-black ${scoreText(Number(audit.overallScore))}`}>
            {audit.overallScore != null ? Number(audit.overallScore).toFixed(1) : "—"}
          </p>
          <p className="text-sm font-medium mt-0.5 text-[var(--abv-text)]/50">/ 10</p>
          {report?.raw_average != null && (
            <p className="text-xs text-[var(--abv-text)]/40 mt-1.5">Raw avg: {Number(report.raw_average).toFixed(1)}</p>
          )}
        </div>
        {report?.one_sentence_diagnosis && (
          <div className="bg-[#111] rounded-lg p-5 flex-1 flex flex-col justify-center">
            <p className="text-xs font-semibold text-[var(--abv-azure)] uppercase tracking-wider mb-2">Diagnosis</p>
            <p className="text-base font-medium text-white leading-relaxed italic">
              "{report.one_sentence_diagnosis}"
            </p>
          </div>
        )}
      </div>

      {/* Single Video: Phase Report */}
      {isSingleVideo && phaseReport && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 print-page-break">
          <h2 className="text-base font-semibold text-[var(--abv-text)] mb-5">Video Phase Analysis</h2>
          <div className="space-y-5">
            {[
              { key: "opening", label: "🎬 Opening", description: "First 60–90 seconds" },
              { key: "body", label: "📖 Body", description: "Main content & insights" },
              { key: "connection_and_voice", label: "🤝 Connection & Voice", description: "Emotional resonance & personality" },
              { key: "channel_strategy", label: "📈 Channel Strategy", description: "Title, lead magnet & binge hooks" },
            ].map(({ key, label, description }) => {
              const phase = phaseReport[key];
              if (!phase) return null;
              return (
                <div key={key} className="border border-gray-100 rounded-lg p-5 print-avoid-break">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="font-bold text-[var(--abv-text)] text-sm">{label}</h3>
                      <p className="text-xs text-[var(--abv-text)]/40">{description}</p>
                    </div>
                    {phase.score != null && (
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold shrink-0 ${scoreBg(phase.score)}`}>
                        {Number(phase.score).toFixed(1)}
                      </span>
                    )}
                  </div>
                  {phase.analysis && (
                    <p className="text-sm text-[var(--abv-text)]/80 mb-3 leading-relaxed">{phase.analysis}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {phase.strengths?.length > 0 && (
                      <div className="bg-[#e8f7ff] rounded-lg p-3">
                        <p className="text-xs font-semibold text-[var(--abv-azure)] uppercase tracking-wider mb-1.5">✅ Strong</p>
                        {phase.strengths.map((s: string, i: number) => (
                          <p key={i} className="text-xs text-[var(--abv-text)]/70">{s}</p>
                        ))}
                      </div>
                    )}
                    {phase.gaps?.length > 0 && (
                      <div className="bg-[#ffe5ea] rounded-lg p-3">
                        <p className="text-xs font-semibold text-[var(--abv-crimson)] uppercase tracking-wider mb-1.5">⚠️ Gap</p>
                        {phase.gaps.map((g: string, i: number) => (
                          <p key={i} className="text-xs text-[var(--abv-text)]/70">{g}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Single Video: Three Improvements */}
      {isSingleVideo && report?.three_improvements?.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-[var(--abv-text)] mb-5">💡 Three Ideas for Improvement</h2>
          <div className="space-y-5">
            {report.three_improvements.map((item: any, i: number) => (
              <div key={i} className="border-l-4 border-[var(--abv-azure)] pl-4 print-avoid-break">
                <p className="text-xs font-bold text-[var(--abv-azure)] uppercase tracking-wider mb-2">{i + 1}. {item.principle}</p>
                <div className="space-y-2">
                  <div className="bg-[#ffe5ea] rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-[var(--abv-crimson)] mb-1">Current</p>
                    <p className="text-xs text-[var(--abv-text)]/80 italic">"{item.current}"</p>
                  </div>
                  <div className="bg-[#e8f7ff] rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-[var(--abv-azure)] mb-1">Improved</p>
                    <p className="text-xs text-[var(--abv-text)]/80 italic">"{item.improved}"</p>
                  </div>
                  {item.why && (
                    <p className="text-xs text-[var(--abv-text)]/60 italic">{item.why}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single Video: Quick Wins */}
      {isSingleVideo && report?.quick_wins?.length > 0 && (
        <Notice variant="info" title="⚡ Quick Win for Next Video" className="print-avoid-break">
          <ul className="space-y-2">
            {report.quick_wins.slice(0, 1).map((win: string, i: number) => (
              <li key={i} className="leading-relaxed">{win}</li>
            ))}
          </ul>
        </Notice>
      )}

      {/* Monthly progress summary */}
      {isMonthly && baselineScores && (
        <div className="bg-[var(--abv-dark)]/10 border border-[var(--abv-azure)]/30 rounded-lg p-6 print-avoid-break">
          <h2 className="text-base font-semibold text-[var(--abv-text)] mb-4">📊 Progress Summary</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-[var(--abv-text)]/50 uppercase tracking-wider mb-1">This Month</p>
              <p className={`text-3xl font-bold ${scoreText(Number(audit.overallScore))}`}>{audit.overallScore != null ? Number(audit.overallScore).toFixed(1) : "—"}</p>
            </div>
            {baselineScores && (() => {
              const baseAvg = (Object.values(baselineScores) as Array<{ score: number }>).reduce((a, b) => a + b.score, 0) / Object.keys(baselineScores).length;
              const delta = audit.overallScore - baseAvg;
              return (
                <div>
                  <p className="text-xs text-[var(--abv-text)]/50 uppercase tracking-wider mb-1">Δ Baseline</p>
                  <p className={`text-3xl font-bold ${deltaColor(delta)}`}>
                    {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}{Math.abs(delta).toFixed(1)}
                  </p>
                </div>
              );
            })()}
            {lastMonthScores && (() => {
              const lastAvg = (Object.values(lastMonthScores) as Array<{ score: number }>).reduce((a, b) => a + b.score, 0) / Object.keys(lastMonthScores).length;
              const delta = audit.overallScore - lastAvg;
              return (
                <div>
                  <p className="text-xs text-[var(--abv-text)]/50 uppercase tracking-wider mb-1">Δ Last Month</p>
                  <p className={`text-3xl font-bold ${deltaColor(delta)}`}>
                    {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}{Math.abs(delta).toFixed(1)}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 16-Principle Scorecard */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 print-page-break print-avoid-break">
        <h2 className="text-base font-semibold text-[var(--abv-text)] mb-4">16-Principle Scorecard</h2>

        {!hasScores ? (
          <p className="text-sm text-[var(--abv-text)]/50 italic">Score data unavailable for this audit. The report content may have been saved in an older format — check the browser console for the raw keys.</p>
        ) : isMonthly && baselineScores ? (
          <div className="space-y-0.5">
            {/* Column headers */}
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100 px-3">
              <span className="flex-1 text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider">Principle</span>
              <span className="w-14 text-center text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider">Base</span>
              {lastMonthScores && <span className="w-14 text-center text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider">Last</span>}
              <span className="w-14 text-center text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider">Now</span>
              <span className="w-10 text-center text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider">Δ</span>
              <span className="w-4" />
            </div>
            {Object.entries(scores).map(([key, val]: [string, any]) => {
              const base = baselineScores?.[key]?.score;
              const last = lastMonthScores?.[key]?.score;
              const curr = val.score;
              const isNA = curr == null;
              const delta = !isNA && base != null ? curr - base : null;
              const isOpen = expandedPrinciple === key;
              return (
                <div key={key} className={`rounded-lg ${deltaCellBg(delta)}`}>
                  <button
                    onClick={() => setExpandedPrinciple(isOpen ? null : key)}
                    className="w-full flex items-center gap-2 py-2.5 px-3 hover:bg-black/5 transition-colors rounded-lg text-left"
                  >
                    <span className={`flex-1 text-sm ${isNA ? "text-[var(--abv-text)]/40" : "text-[var(--abv-text)]"}`}>{PRINCIPLE_LABELS[key] ?? key}</span>
                    <span className="w-14 text-center">
                      {base != null ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(base)}`}>{base.toFixed(1)}</span> : <span className="text-[var(--abv-text)]/30 text-xs">—</span>}
                    </span>
                    {lastMonthScores && (
                      <span className="w-14 text-center">
                        {last != null ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(last)}`}>{last.toFixed(1)}</span> : <span className="text-[var(--abv-text)]/30 text-xs">—</span>}
                      </span>
                    )}
                    <span className="w-14 text-center">
                      {isNA
                        ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-400">N/A</span>
                        : <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(curr)}`}>{curr.toFixed(1)}</span>}
                    </span>
                    <span className="w-10 text-center text-xs font-bold">
                      {isNA ? <span className="text-gray-400">—</span> : delta == null ? <span className="text-gray-400">—</span> : delta > 0 ? <span className={deltaColor(delta)}>+{delta.toFixed(1)}</span> : delta < 0 ? <span className={deltaColor(delta)}>{delta.toFixed(1)}</span> : <span className="text-gray-400">0.0</span>}
                    </span>
                    <span className="w-4 text-[var(--abv-text)]/30 text-xs no-print">{isOpen ? "▲" : "▼"}</span>
                  </button>
                  {isOpen && val.evidence && (
                    <div className="mx-3 mb-2 px-3 py-2 bg-white/70 rounded-lg text-xs text-[var(--abv-text)]/70 italic">
                      {val.evidence}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {DIMENSIONS.map((dim) => (
              <div key={dim.label}>
                <h3 className="text-sm font-bold text-[var(--abv-text)] uppercase tracking-wide mb-2 pt-1">{dim.label}</h3>
                <div className="space-y-1">
                  {dim.keys.filter((k) => scores[k]).map((key) => {
                    const val = scores[key];
                    const isOpen = expandedPrinciple === key;
                    const isNA = val.score == null;
                    return (
                      <div key={key}>
                        <button
                          onClick={() => setExpandedPrinciple(isOpen ? null : key)}
                          className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <span className={`text-sm ${isNA ? "text-[var(--abv-text)]/40" : "text-[var(--abv-text)]"}`}>{PRINCIPLE_LABELS[key]}</span>
                          <div className="flex items-center gap-2">
                            {isNA
                              ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-400">N/A</span>
                              : <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(val.score)}`}>{val.score.toFixed(1)}</span>
                            }
                            <span className="text-[var(--abv-text)]/30 text-xs no-print">{isOpen ? "▲" : "▼"}</span>
                          </div>
                        </button>
                        {isOpen && val.evidence && (
                          <div className="mx-3 mb-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-[var(--abv-text)]/70 italic">
                            {val.evidence}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Videos Analysed — merged: thumbnail + scores + observations + deep dive in one card per video */}
      {videos.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 print-page-break">
          <h2 className="text-base font-semibold text-[var(--abv-text)] mb-4">Videos Analysed</h2>
          {!report?.video_breakdowns?.length && (
            <Notice variant="warning" className="mb-4">
              Per-video analysis unavailable for this audit. Delete and re-run to see dimension scores, strengths, and improvements per video.
            </Notice>
          )}
          <div className="space-y-5">
            {videos.map((v: any, i: number) => {
              const breakdown =
                report?.video_breakdowns?.[i] ??
                report?.video_breakdowns?.find(
                  (b: any) =>
                    b.video_id === v.videoId ||
                    b.title?.trim().toLowerCase() === v.title?.trim().toLowerCase()
                );
              const dimScores = breakdown?.dimension_scores as {
                channel_strategy?: number;
                content_impact?: number;
                viewer_connection?: number;
                lead_generation?: number;
              } | undefined;
              const strong = breakdown?.strength ?? breakdown?.opening_analysis;
              const improve = breakdown?.improvement ??
                [breakdown?.insights_analysis, breakdown?.connection_analysis].filter(Boolean)[0];
              function dimBadge(score: number | undefined, label: string) {
                if (score == null) return null;
                const bg =
                  score >= 7
                    ? "bg-[#e8f7ff] text-[#0ea5d9]"
                    : score >= 5
                    ? "bg-[#fef3c7] text-amber-700"
                    : "bg-[#ffe5ea] text-[#cc0029]";
                return (
                  <span key={label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${bg}`}>
                    {label} {score.toFixed(1)}
                  </span>
                );
              }

              return (
                <div key={i} className="border border-gray-100 rounded-lg p-4 sm:p-5 print-avoid-break">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <a
                      href={`https://youtube.com/watch?v=${v.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full sm:w-44 md:w-52 shrink-0 group"
                    >
                      <div className="relative aspect-video rounded-md overflow-hidden bg-gray-100 shadow-sm">
                        <img
                          src={`https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`}
                          alt={v.title ?? "Video thumbnail"}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => {
                            const img = e.currentTarget;
                            img.style.display = "none";
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 rounded-full bg-black/60 group-hover:bg-[#cc0029] transition-colors flex items-center justify-center shadow-lg">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white ml-0.5" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </a>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                        <a
                          href={`https://youtube.com/watch?v=${v.videoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-[var(--abv-azure)] hover:underline flex items-center gap-1"
                        >
                          {v.title}
                          <ArrowTopRightOnSquareIcon className="w-3 h-3 shrink-0 no-print" />
                        </a>
                        <span className="text-xs text-[var(--abv-text)]/40 whitespace-nowrap">
                          {fmtDuration(v.durationSeconds)} · {fmt(v.uploadDate)} · {v.viewCount?.toLocaleString()} views
                        </span>
                      </div>
                      {!v.hadTranscript && (
                        <p className="text-xs text-amber-500 mb-1">(no transcript available)</p>
                      )}
                      {dimScores && (
                        <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
                          {dimBadge(dimScores.channel_strategy, "🎯 Strategy")}
                          {dimBadge(dimScores.content_impact, "🎬 Content")}
                          {dimBadge(dimScores.viewer_connection, "🤝 Connection")}
                          {dimBadge(dimScores.lead_generation, "📈 Lead Gen")}
                        </div>
                      )}
                      {strong && (
                        <p className="text-xs text-[var(--abv-text)]/70 mt-1">
                          <span className="mr-1">✅</span>{strong}
                        </p>
                      )}
                      {improve && (
                        <p className="text-xs text-[var(--abv-text)]/70 mt-1">
                          <span className="mr-1">⚠️</span>{improve}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* What's Working */}
      {whatsWorking.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 print-page-break print-avoid-break">
          <h2 className="text-base font-semibold text-green-800 mb-3">✅ What&apos;s Working</h2>
          <div className="space-y-3">
            {whatsWorking.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-1 text-green-500 shrink-0">•</span>
                <div>
                  <p className="text-sm text-green-800 font-medium">{item.strength}</p>
                  {item.evidence && (
                    <p className="text-xs text-green-700/70 mt-0.5 italic">"{item.evidence}"</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Three Biggest Gaps */}
      {biggestGaps.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-[var(--abv-text)] mb-4">🎯 Three Biggest Gaps</h2>
          <div className="space-y-5">
            {biggestGaps.map((gap, i) => (
              <div key={i} className="border-l-4 border-[var(--abv-crimson)] pl-4 print-avoid-break">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-[var(--abv-crimson)]/10 text-[var(--abv-crimson)] text-xs font-bold px-2 py-0.5 rounded-full">{i + 1}</span>
                  <span className="text-sm font-bold text-[var(--abv-text)]">{gap.principle}</span>
                  {gap.score > 0 && (
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(gap.score)}`}>
                      {gap.score.toFixed(1)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--abv-text)]/80 mb-3 leading-relaxed">{gap.description}</p>
                {gap.current_example && (
                  <div className="space-y-2">
                    <div className="bg-[#ffe5ea] rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-[var(--abv-crimson)] mb-1">Current</p>
                      <p className="text-xs text-[var(--abv-text)]/80 italic">"{gap.current_example}"</p>
                    </div>
                    {gap.improved_example && (
                      <div className="bg-[#e8f7ff] rounded-lg px-3 py-2">
                        <p className="text-xs font-semibold text-[var(--abv-azure)] mb-1">Improved</p>
                        <p className="text-xs text-[var(--abv-text)]/80 italic">"{gap.improved_example}"</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Learning Path */}
      {learningGaps.length > 0 && (
        <div className="bg-[var(--abv-dark)]/10 border border-[var(--abv-azure)]/30 rounded-lg p-6 print-page-break">
          <h2 className="text-base font-semibold text-[var(--abv-text)] mb-1">📚 Learning Path</h2>
          <p className="text-xs text-[var(--abv-text)]/50 mb-4">Principles below 7 — sorted by priority</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--abv-azure)]/20">
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider">Principle</th>
                  <th className="text-center py-2 px-2 text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider">Score</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider">Lesson</th>
                  <th className="text-center py-2 pl-2 text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider">Priority</th>
                </tr>
              </thead>
              <tbody>
                {learningGaps.map(([key, val]: [string, any]) => {
                  const p = priority(val.score);
                  return (
                    <tr key={key} className="border-b border-[var(--abv-azure)]/10 last:border-0">
                      <td className="py-2 pr-3 text-[var(--abv-text)] font-medium">{PRINCIPLE_LABELS[key]}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(val.score)}`}>
                          {val.score.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs text-[var(--abv-text)]/70">{LEARNING_PATH[key]}</td>
                      <td className="py-2 pl-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${p.cls}`}>
                          {p.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Q&A Topics */}
      {(() => {
        const allItems = isSingleVideo && report?.qa_prep?.length > 0
          ? report.qa_prep.map((q: string) => ({ key: "", prompt: q, score: 0 }))
          : qaItems;
        if (allItems.length === 0) return null;
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6 print-avoid-break">
            <h2 className="text-base font-semibold text-[var(--abv-text)] mb-1">❓ Q&amp;A Topics for Coaching Call</h2>
            <p className="text-xs text-[var(--abv-text)]/50 mb-4">Things to bring or prepare before the next call</p>
            <div className="space-y-2">
              {allItems.map((item: any, i: number) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="w-2 h-2 rounded-full bg-[var(--abv-dark)] mt-1.5 shrink-0" />
                  <div className="flex-1">
                    {item.key && (
                      <span className="text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wide mr-2">
                        {PRINCIPLE_LABELS[item.key]}
                        {item.score > 0 && ` (${item.score.toFixed(1)})`}:
                      </span>
                    )}
                    <span className="text-sm text-[var(--abv-text)]/80">{item.prompt}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Footer */}
      <div className="text-center py-6 text-sm text-[var(--abv-text)]/40 border-t border-gray-200">
        Prepared for {member?.fullName ?? member?.email} by Jared Chamberlain ~ Founder of Attraction by Video
      </div>
    </div>
  );
}
