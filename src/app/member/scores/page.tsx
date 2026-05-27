"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

const AUDIT_KEY_TO_ACADEMY_SLUG: Record<string, string> = {
  lead_magnet_system: "lead_magnet",
};
const toAcademySlug = (k: string) => AUDIT_KEY_TO_ACADEMY_SLUG[k] ?? k;

type Tier = "academy" | "amber" | "crimson" | "dim";
function tier(score: number | null | undefined): Tier {
  if (score == null) return "dim";
  if (score >= 7.5) return "academy";
  if (score >= 5) return "amber";
  return "crimson";
}
const tierText: Record<Tier, string> = {
  academy: "text-[var(--abv-academy)]",
  amber: "text-[var(--abv-scores)]",
  crimson: "text-[var(--abv-crimson)]",
  dim: "text-[var(--abv-text-dim)]",
};
const tierStroke: Record<Tier, string> = {
  academy: "var(--abv-academy)",
  amber: "var(--abv-scores)",
  crimson: "var(--abv-crimson)",
  dim: "rgba(0,0,0,0.2)",
};
const tierBarBg: Record<Tier, string> = {
  academy: "bg-[var(--abv-academy)]",
  amber: "bg-[var(--abv-scores)]",
  crimson: "bg-[var(--abv-crimson)]",
  dim: "bg-black/10",
};

const LP_THUMB_BG = [
  "linear-gradient(135deg, #1A1A1A 0%, rgba(61,195,255,0.40) 100%)",
  "linear-gradient(135deg, #1A1A1A 0%, rgba(245,158,11,0.40) 100%)",
  "linear-gradient(135deg, #1A1A1A 0%, rgba(16,185,129,0.40) 100%)",
];

function fmtShort(date: string | Date) {
  return new Date(date).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

type RangeKey = "4w" | "12w" | "6m" | "all";
const RANGE_LIMIT: Record<RangeKey, number | null> = {
  "4w": 4,
  "12w": 12,
  "6m": 24,
  all: null,
};

export default function MemberScoresPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [principlesWithLessons, setPrinciplesWithLessons] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<RangeKey>("12w");

  function load() {
    setLoading(true);
    fetch("/api/member/scores")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    fetch("/api/member/academy/principles")
      .then((r) => r.json())
      .then((d) => {
        const slugs = new Set<string>(
          (d.principles ?? [])
            .filter((p: any) => p.lessonCount > 0)
            .map((p: any) => p.slug),
        );
        setPrinciplesWithLessons(slugs);
      })
      .catch(() => {});
  }, []);

  // Computed views (defensive — always defined so hook order stays stable)
  const latestChannelAudit = useMemo(() => {
    const audits = (data?.audits ?? []) as any[];
    return audits.find((a) => a.auditType === "baseline" || a.auditType === "monthly") ?? null;
  }, [data]);

  const baselineAudit = data?.baselineAudit ?? null;

  const channelAuditsAsc = useMemo(() => {
    const audits = ((data?.audits ?? []) as any[])
      .filter(
        (a) =>
          (a.auditType === "baseline" || a.auditType === "monthly") &&
          a.overallScore != null,
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    return audits;
  }, [data]);

  const trajectoryPoints = useMemo(() => {
    const limit = RANGE_LIMIT[range];
    const slice = limit ? channelAuditsAsc.slice(-limit) : channelAuditsAsc;
    return slice.map((a) => ({
      score: Number(a.overallScore),
      date: new Date(a.createdAt),
    }));
  }, [channelAuditsAsc, range]);

  const principleRows = useMemo(() => {
    const scores = (latestChannelAudit?.scores ?? {}) as Record<
      string,
      { score: number | null; evidence?: string }
    >;
    return Object.entries(scores).map(([key, val]) => ({ key, ...val }));
  }, [latestChannelAudit]);

  const learningPath = useMemo(() => {
    return [...principleRows]
      .filter((r) => r.key !== "show_dont_tell" && r.score != null)
      .sort((a, b) => (a.score! - b.score!))
      .slice(0, 3);
  }, [principleRows]);

  const recentVideoAudits = useMemo(() => {
    const sixty = Date.now() - 60 * 86_400_000;
    return ((data?.audits ?? []) as any[])
      .filter(
        (a) =>
          a.auditType === "single_video" &&
          new Date(a.createdAt).getTime() >= sixty,
      )
      .slice(0, 12);
  }, [data]);

  const overallScore =
    latestChannelAudit?.overallScore != null
      ? Number(latestChannelAudit.overallScore)
      : null;
  const overallTier = tier(overallScore);
  const trendVsBaseline =
    overallScore != null && baselineAudit?.overallScore != null
      ? overallScore - Number(baselineAudit.overallScore)
      : null;

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-[var(--abv-azure)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="font-sans text-[var(--abv-text)]">
      {/* PageHeader */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div className="flex-1 min-w-[280px]">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--abv-azure-tint)] text-[var(--abv-azure)] text-[11px] font-bold uppercase tracking-[0.12em]">
            <span className="w-[5px] h-[5px] rounded-full bg-[var(--abv-azure)]" />
            Weekly review
          </span>
          <h1 className="font-display font-black tracking-[-0.03em] leading-[1.05] text-[44px] mt-3.5 mb-2 max-w-[600px] text-pretty">
            Your score, <span className="text-[var(--abv-azure)]">this week</span>.
          </h1>
          <p className="text-[15px] text-[var(--abv-text-muted)] m-0 max-w-[540px] leading-[1.55]">
            Where you stand against the 16 principles that move channels forward.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-4 py-[9px] bg-white border border-[var(--abv-border-strong)] rounded-full text-xs font-semibold text-[var(--abv-text)] hover:border-[var(--abv-ink)] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[13px] h-[13px]">
              <path d="M21 12a9 9 0 11-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            Refresh
          </button>
          {data?.youtubeChannelUrl && (
            <a
              href={data.youtubeChannelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-[9px] bg-white border border-[var(--abv-border-strong)] rounded-full text-xs font-semibold text-[var(--abv-text)] hover:border-[var(--abv-ink)] transition-colors"
            >
              View Channel
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[13px] h-[13px]">
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </a>
          )}
        </div>
      </header>

      {/* Hero score + chart */}
      {!latestChannelAudit ? (
        <section className="mb-8 bg-white border border-[var(--abv-border)] rounded-[14px] p-10 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="font-medium text-[var(--abv-text)] mb-1">No channel audit yet</p>
          <p className="text-sm text-[var(--abv-text-muted)]">
            Your Attraction Scores will appear here after your first audit is completed.
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-5 mb-8">
          {/* Score card */}
          <div className="bg-white border border-[var(--abv-border)] rounded-[14px] px-6 py-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col items-center gap-3.5">
            <ScoreArc score={overallScore!} tier={overallTier} />
            <span className="font-mono text-[10.5px] text-[var(--abv-text-muted)] uppercase tracking-[0.08em]">
              Channel score · last 90 days
            </span>
            {trendVsBaseline != null && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10.5px] font-bold tracking-[0.04em] ${
                  trendVsBaseline >= 0
                    ? "bg-[var(--abv-academy-tint)] text-[#047857]"
                    : "bg-[rgba(255,0,51,0.10)] text-[var(--abv-crimson)]"
                }`}
              >
                {trendVsBaseline >= 0 ? "↑" : "↓"} {trendVsBaseline >= 0 ? "+" : ""}
                {trendVsBaseline.toFixed(1)} vs. start
              </span>
            )}
          </div>

          {/* Chart card */}
          <div className="bg-white border border-[var(--abv-border)] rounded-[14px] px-6 py-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col gap-3.5">
            <div className="flex justify-between items-baseline">
              <h3 className="font-display text-[18px] font-extrabold tracking-[-0.015em] m-0">
                Score trajectory
              </h3>
              <div className="inline-flex gap-[2px] p-[2px] bg-[var(--abv-bg-warm)] rounded-full">
                {(["4w", "12w", "6m", "all"] as RangeKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setRange(k)}
                    className={`font-mono text-[10.5px] font-semibold px-[11px] py-[5px] rounded-full transition-colors ${
                      range === k
                        ? "bg-[var(--abv-ink)] text-white"
                        : "bg-transparent text-[var(--abv-text-muted)]"
                    }`}
                  >
                    {k === "all" ? "All" : k}
                  </button>
                ))}
              </div>
            </div>
            <TrajectoryChart points={trajectoryPoints} />
          </div>
        </section>
      )}

      {/* 16 principles */}
      {principleRows.length > 0 && (
        <section className="bg-white border border-[var(--abv-border)] rounded-[14px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-8">
          <div className="grid grid-cols-[1fr_200px_120px_90px] gap-4 px-[22px] py-3.5 bg-[var(--abv-bg-warm)] border-b border-[var(--abv-border)] font-mono text-[9.5px] font-bold tracking-[0.10em] uppercase text-[var(--abv-text-muted)]">
            <span>Principle</span>
            <span>Score</span>
            <span className="text-right">/ 10</span>
            <span className="text-right" />
          </div>
          {principleRows.map((row) => {
            const t = tier(row.score);
            const academySlug = toAcademySlug(row.key);
            const hasLesson = principlesWithLessons.has(academySlug);
            const inner = (
              <>
                <span className="text-sm text-[var(--abv-text)] font-medium">
                  {PRINCIPLE_LABELS[row.key] ?? row.key}
                </span>
                <span className="h-[5px] rounded-full bg-black/5 overflow-hidden self-center">
                  <span
                    className={`block h-full rounded-full ${tierBarBg[t]}`}
                    style={{ width: row.score != null ? `${(row.score / 10) * 100}%` : "0%" }}
                  />
                </span>
                <span className="font-mono text-[13.5px] font-semibold text-[var(--abv-text)] text-right tabular-nums">
                  {row.score != null ? row.score.toFixed(1) : "—"}
                </span>
                <span className="text-[11px] font-semibold text-right opacity-0 group-hover:opacity-100 text-[var(--abv-text-dim)] group-hover:text-[var(--abv-azure)] transition-opacity">
                  View report →
                </span>
              </>
            );
            return hasLesson ? (
              <Link
                key={row.key}
                href={`/member/academy?tab=browse&tag=${academySlug}`}
                className="group grid grid-cols-[1fr_200px_120px_90px] gap-4 px-[22px] py-3.5 items-center border-b border-[var(--abv-border)] last:border-b-0 hover:bg-[var(--abv-bg-warm)] transition-colors cursor-pointer"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={row.key}
                className="group grid grid-cols-[1fr_200px_120px_90px] gap-4 px-[22px] py-3.5 items-center border-b border-[var(--abv-border)] last:border-b-0 hover:bg-[var(--abv-bg-warm)] transition-colors"
              >
                {inner}
              </div>
            );
          })}
        </section>
      )}

      {/* Learning Path */}
      {learningPath.length > 0 && (
        <section className="bg-[var(--abv-azure-tint)] border border-[var(--abv-azure)] rounded-[14px] px-7 pt-7 pb-6 mb-8">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-[18px]">
            <div className="max-w-[600px]">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--abv-azure-tint)] text-[var(--abv-azure)] text-[11px] font-bold uppercase tracking-[0.12em]">
                <span className="w-[5px] h-[5px] rounded-full bg-[var(--abv-azure)]" />
                Learning Path
              </span>
              <h3 className="font-display text-[24px] font-extrabold tracking-[-0.025em] leading-[1.15] mt-2.5 mb-1 max-w-[540px]">
                Your next 3 lessons, picked from your{" "}
                <span className="text-[var(--abv-azure)]">lowest scores</span>.
              </h3>
              <p className="text-[13.5px] text-[var(--abv-text-muted)] m-0">
                Targeted at the three principles dragging your score the most. About 35 minutes total.
              </p>
            </div>
            <Link
              href="/member/academy"
              className="inline-flex items-center gap-1.5 px-4 py-[9px] bg-white border border-[var(--abv-border-strong)] rounded-full text-xs font-semibold text-[var(--abv-text)] hover:border-[var(--abv-ink)] transition-colors"
            >
              View all lessons →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {learningPath.map((p, i) => {
              const academySlug = toAcademySlug(p.key);
              const hasLesson = principlesWithLessons.has(academySlug);
              const href = hasLesson
                ? `/member/academy?tab=browse&tag=${academySlug}`
                : `/member/academy`;
              return (
                <Link
                  key={p.key}
                  href={href}
                  className="bg-white border border-[var(--abv-border)] rounded-[10px] p-3.5 flex flex-col gap-2.5 hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all"
                >
                  <div
                    className="aspect-[16/9] rounded-md relative overflow-hidden"
                    style={{ background: LP_THUMB_BG[i] }}
                  >
                    <span className="absolute top-1.5 left-2 font-mono text-[9px] font-bold text-white px-[7px] py-[2px] rounded-full bg-black/45 uppercase tracking-[0.06em]">
                      {(PRINCIPLE_LABELS[p.key] ?? p.key)} · {p.score?.toFixed(1)}
                    </span>
                    <span className="absolute bottom-1.5 right-2 text-white text-[11px] opacity-85">▶</span>
                  </div>
                  <div className="text-[13.5px] font-semibold text-[var(--abv-text)] leading-[1.35]">
                    {PRINCIPLE_LABELS[p.key] ?? p.key}
                  </div>
                  <div className="font-mono text-[10.5px] text-[var(--abv-text-dim)] tracking-[0.04em] flex gap-1.5 items-center mt-auto">
                    <span>⏱ ~12 min</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent video audits */}
      <section className="mb-8">
        <div className="flex justify-between items-baseline mb-3.5">
          <h3 className="font-display text-[22px] font-extrabold tracking-[-0.02em] m-0">
            Recent video audits.
          </h3>
          {recentVideoAudits.length > 0 && (
            <Link
              href="/member/audits"
              className="text-xs text-[var(--abv-text-muted)] hover:text-[var(--abv-text)]"
            >
              View all {recentVideoAudits.length} →
            </Link>
          )}
        </div>
        {recentVideoAudits.length === 0 ? (
          <div className="bg-white border border-[var(--abv-border)] rounded-[14px] p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-sm font-medium text-[var(--abv-text)]">
              No video audits in the last 60 days
            </p>
            <p className="text-xs text-[var(--abv-text-muted)] mt-1">
              When the Attraction team runs a single video audit, you&apos;ll see them show up here.
            </p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {recentVideoAudits.map((a: any) => {
              const v = (a.videosAnalysed as any[])?.[0];
              const videoId = v?.videoId;
              const thumbUrl = videoId
                ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
                : null;
              const title = v?.title ?? "Untitled video";
              const score = a.overallScore != null ? Number(a.overallScore) : null;
              const t = tier(score);
              return (
                <Link
                  key={a.id}
                  href={`/member/audits/${a.id}`}
                  className="flex-shrink-0 w-[280px] bg-white border border-[var(--abv-border)] rounded-[12px] p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all cursor-pointer"
                >
                  <div
                    className="aspect-[16/9] rounded-md flex items-end justify-end p-1.5 mb-3 relative overflow-hidden"
                    style={{
                      background: thumbUrl
                        ? undefined
                        : "linear-gradient(135deg, #1A1A1A 0%, rgba(61,195,255,0.25) 100%)",
                    }}
                  >
                    {thumbUrl && (
                      <img
                        src={thumbUrl}
                        alt={title}
                        className="absolute inset-0 w-full h-full object-cover rounded-md"
                      />
                    )}
                  </div>
                  <div className="text-[13.5px] font-semibold text-[var(--abv-text)] leading-[1.35] mb-2 min-h-[36px] line-clamp-2">
                    {title}
                  </div>
                  <div className="flex items-baseline justify-between pt-2 border-t border-[var(--abv-border)]">
                    <span
                      className={`font-display font-extrabold text-[22px] tracking-[-0.02em] leading-none tabular-nums ${tierText[t]}`}
                    >
                      {score != null ? score.toFixed(1) : "—"}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--abv-text-dim)] tracking-[0.04em]">
                      Audited {fmtShort(a.createdAt)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function ScoreArc({ score, tier: t }: { score: number; tier: Tier }) {
  const R = 44;
  const circumference = 2 * Math.PI * R;
  const filled = (score / 10) * circumference;
  const stroke = tierStroke[t];
  return (
    <div className="relative w-[220px] h-[220px]">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="rgba(0,0,0,0.05)"
          strokeWidth={8}
        />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={stroke}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-black text-[76px] tracking-[-0.04em] text-[var(--abv-text)] leading-[0.9] tabular-nums">
          {score.toFixed(1)}
        </span>
        <span className="text-sm text-[var(--abv-text-dim)] mt-2 font-medium">/ 10</span>
      </div>
    </div>
  );
}

function TrajectoryChart({
  points,
}: {
  points: { score: number; date: Date }[];
}) {
  if (points.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-sm text-[var(--abv-text-muted)]">
        No channel audits yet
      </div>
    );
  }
  const W = 720;
  const H = 220;
  const padL = 32;
  const padR = 32;
  const xMin = padL + 24;
  const xMax = W - padR;
  const yTop = 0;
  const yBottom = 200;
  const xFor = (i: number) =>
    points.length === 1 ? xMax : xMin + (i * (xMax - xMin)) / (points.length - 1);
  const yFor = (s: number) => yBottom - (s / 10) * (yBottom - yTop);
  const lastIdx = points.length - 1;
  const last = points[lastIdx];
  const lastTier = tier(last.score);
  const lineD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)},${yFor(p.score).toFixed(1)}`)
    .join(" ");
  const areaD = `${lineD} L ${xMax},${yBottom} L ${xMin},${yBottom} Z`;
  const tooltipX = Math.min(W - 84, xFor(lastIdx) - 28);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-[220px]"
    >
      {/* gridlines */}
      <line x1={padL} x2={W - padR} y1={200} y2={200} stroke="rgba(0,0,0,0.10)" strokeWidth={1} />
      {[160, 120, 80, 40].map((y) => (
        <line
          key={y}
          x1={padL}
          x2={W - padR}
          y1={y}
          y2={y}
          stroke="rgba(0,0,0,0.10)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      ))}
      {/* y labels */}
      {[
        [0, 204],
        [2, 164],
        [4, 124],
        [6, 84],
        [8, 44],
        [10, 14],
      ].map(([val, y]) => (
        <text
          key={val}
          x={val === 10 ? 10 : 14}
          y={y}
          className="font-mono"
          style={{ fontSize: 10, fill: "var(--abv-text-dim)" }}
        >
          {val}
        </text>
      ))}
      {/* area + line */}
      <path d={areaD} fill="var(--abv-azure-tint)" />
      <path
        d={lineD}
        fill="none"
        stroke="var(--abv-text)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* dots */}
      {points.map((p, i) =>
        i === lastIdx ? null : (
          <circle key={i} cx={xFor(i)} cy={yFor(p.score)} r={3} fill="var(--abv-text)" />
        ),
      )}
      {/* end cursor */}
      <circle
        cx={xFor(lastIdx)}
        cy={yFor(last.score)}
        r={5}
        fill="white"
        stroke={tierStroke[lastTier]}
        strokeWidth={2}
      />
      {/* tooltip on last point */}
      <g transform={`translate(${tooltipX}, 18)`}>
        <rect width={74} height={38} rx={6} fill="var(--abv-ink)" />
        <text
          x={8}
          y={14}
          style={{ fill: "rgba(255,255,255,0.65)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: "var(--font-mono)" }}
        >
          {fmtShort(last.date)}
        </text>
        <text
          x={8}
          y={30}
          style={{ fill: "white", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)" }}
        >
          {last.score.toFixed(1)} / 10
        </text>
      </g>
      {/* x labels */}
      {points.map((p, i) => (
        <text
          key={i}
          x={xFor(i)}
          y={218}
          textAnchor="middle"
          className="font-mono"
          style={{ fontSize: 10, fill: "var(--abv-text-dim)" }}
        >
          {fmtShort(p.date)}
        </text>
      ))}
    </svg>
  );
}
