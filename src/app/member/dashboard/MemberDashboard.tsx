"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import OnboardingBanner from "@/components/onboarding/OnboardingBanner";
import { LinkButton } from "@/components/ui/Button";
import { writeJarvisSeed } from "@/lib/jarvis/seed";

// ── Helpers ───────────────────────────────────────────────────

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ── Payment Banner ────────────────────────────────────────────

function PaymentBanner() {
  const [pastDue, setPastDue] = useState(false);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/member/payment-retry-url")
      .then((r) => r.json())
      .then((d) => {
        if (d.pastDue) {
          setPastDue(true);
          setRetryUrl(d.url ?? null);
        }
      })
      .catch(() => {});
  }, []);

  if (!pastDue) return null;

  return (
    <div className="rounded-xl bg-[var(--abv-bg-warm)] border border-[var(--abv-border-strong)] px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between mb-6">
      <div>
        <p className="font-semibold text-[var(--abv-text)] text-sm">Your subscription payment is past due.</p>
        <p className="text-[var(--abv-text-secondary)] text-sm mt-0.5">Update your payment details to keep your access.</p>
      </div>
      <LinkButton
        href={retryUrl ?? "mailto:support@attractionbyvideo.com"}
        target={retryUrl ? "_blank" : undefined}
        className="shrink-0"
      >
        {retryUrl ? "Update payment" : "Contact support"}
      </LinkButton>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────

interface DashboardData {
  firstName: string | null;
  nextCoachingCall: { date: string; link: string | null; confirmed: boolean };
  jarvisStats: {
    ideasProposed: number;
    scriptsApproved: number;
    factsOnFile: number;
  };
  topVideos: {
    videoId: string;
    title: string;
    thumbnailUrl: string | null;
    viewCount: number;
  }[];
}

/** Deep-link to a single video's analytics inside the member's YouTube Studio. */
function studioUrl(videoId: string) {
  return `https://studio.youtube.com/video/${encodeURIComponent(videoId)}/analytics/tab-overview/period-default`;
}

interface FactChip {
  stat: string;
  label: string;
  source: string;
}

interface BriefingIdea {
  index: number;
  leadId: string;
  title: string;
  why: string;
  fact: FactChip | null;
  pattern: string;
  dataThreads: string[];
  rotationSlot: string | null;
  isThesis: boolean;
}

interface Briefing {
  empty: boolean;
  reason?: string;
  monthYear?: string;
  monthLabel?: string;
  factsValidated?: number;
  sources?: string[];
  ideas?: BriefingIdea[];
  estReadMinutes?: number;
  totalLeads?: number;
  browseHref?: string;
}

/** Humanize a RotationSlot enum value, e.g. "neighbourhood_fact" → "Neighbourhood fact". */
function slotLabel(slot: string | null): string | null {
  if (!slot) return null;
  const s = slot.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Jarvis avatar (blue gradient disc + light ring + clapperboard) ──
// Mirrors the Content Manager avatar in src/components/jarvis/JarvisChat.tsx.

function JarvisAvatar() {
  return (
    <span
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-500 text-white ring-2 ring-sky-200 ring-offset-2 ring-offset-[var(--abv-dark)]"
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
        <path d="m6.2 5.3 3.1 3.9" />
        <path d="m12.4 3.4 3.1 4" />
        <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      </svg>
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────

export default function MemberDashboard({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [jarvisEnabled, setJarvisEnabled] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [openThinking, setOpenThinking] = useState<number | null>(null);
  const ideasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/member/feature-flags")
      .then((r) => r.json())
      .then((d) => { if (d?.flags?.tool_jarvis) setJarvisEnabled(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/member/dashboard")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // The briefing reads the member's Story Lead pool directly — a cheap DB read,
  // no per-month generation — so a single fetch is enough.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/member/dashboard/briefing")
      .then((r) => (r.ok ? r.json() : { empty: true, reason: "error" }))
      .then((d: Briefing) => {
        if (cancelled) return;
        setBriefing(d);
        setBriefingLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setBriefing({ empty: true, reason: "error" });
        setBriefingLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const scrollToIdeas = useCallback(() => {
    ideasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // "Build a script" hand-off → seed the chat with the lead's grounding and
  // route to Jarvis, which auto-sends the seed and streams a draft script
  // (the Jarvis draft path). When Jarvis isn't enabled, deep-link straight
  // into the planner wizard for this lead instead.
  const buildScript = useCallback((idea: BriefingIdea) => {
    if (jarvisEnabled) {
      const threads = idea.dataThreads.slice(0, 3);
      const seed =
        `Build a script for this story lead: "${idea.title}".\n` +
        (idea.why ? `Why it matters: ${idea.why}\n` : "") +
        (idea.pattern ? `Pattern: ${idea.pattern}\n` : "") +
        (threads.length ? `Data: ${threads.join("; ")}\n` : "") +
        (idea.fact ? `Lead with this stat: ${idea.fact.stat} — ${idea.fact.label} (${idea.fact.source}).` : "");
      // Member-scoped, one-shot seed. Route to the explicit fresh-thread
      // sentinel so the chat lands genuinely empty and consumes the seed once
      // (never injecting into a pre-existing conversation).
      writeJarvisSeed(memberId, seed);
      router.push("/member/jarvis?thread=new");
    } else {
      router.push(`/member/content-planner/wizard?step=3&storyLeadId=${encodeURIComponent(idea.leadId)}`);
    }
  }, [jarvisEnabled, router, memberId]);

  const firstName = data?.firstName ?? null;
  const topVideos = data?.topVideos ?? [];

  const conversationHref = jarvisEnabled ? "/member/jarvis" : "/member/content-tools";
  const ideaCount = briefing?.ideas?.length ?? 0;
  const hasBriefing = !!briefing && !briefing.empty && ideaCount > 0;
  const ideaNoun = ideaCount === 1 ? "idea" : "ideas";
  const totalLeads = briefing?.totalLeads ?? 0;

  return (
    <div className="space-y-10 pb-12 max-w-5xl mx-auto">

      <OnboardingBanner />
      <PaymentBanner />

      {/* ── Greeting (font-sans / Satoshi, 30px — not the display face) ── */}
      <div className="pt-2">
        {loading ? (
          <div className="h-9 w-[26rem] max-w-full bg-gray-200 dark:bg-[#2a2a2a] rounded-lg animate-pulse" />
        ) : (
          <h1 className="font-sans font-bold tracking-tight text-[30px] leading-tight text-[var(--abv-text)]">
            {greetingWord()}{firstName ? `, ${firstName}` : ""}.
          </h1>
        )}
      </div>

      {/* ── Briefing card ── */}
      {briefingLoading ? (
        <div className="rounded-2xl bg-[var(--abv-dark)] p-6 sm:p-8 animate-pulse">
          <div className="h-4 w-56 bg-white/10 rounded-full mb-5" />
          <div className="h-8 w-full max-w-lg bg-white/10 rounded-lg mb-3" />
          <div className="h-5 w-72 bg-white/10 rounded mb-6" />
          <div className="h-10 w-64 bg-white/10 rounded-full" />
        </div>
      ) : hasBriefing ? (
        <div className="rounded-2xl bg-[var(--abv-dark)] text-white p-5 sm:p-8">
          <div className="flex items-start gap-4">
            <JarvisAvatar />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--abv-azure)]">
                Your {briefing!.monthLabel} briefing · from Jarvis
              </p>
              <h2 className="font-display text-2xl sm:text-3xl text-white mt-2">
                Your market moved — here {ideaCount === 1 ? "is" : "are"} {ideaCount}{" "}
                <span className="text-[var(--abv-azure)]">{ideaNoun}</span> worth exploring.
              </h2>

              {/* meta row */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3 text-sm text-white/70">
                <span className="font-mono tabular-nums text-white">{briefing!.factsValidated}</span>
                <span>validated facts</span>
                {(briefing!.sources?.length ?? 0) > 0 && (
                  <>
                    <span className="text-white/30">·</span>
                    <span>from {briefing!.sources!.join(" + ")}</span>
                  </>
                )}
                <span className="text-white/30">·</span>
                <span>~{briefing!.estReadMinutes} minutes</span>
              </div>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-2.5 mt-5">
                <button
                  onClick={scrollToIdeas}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-[var(--abv-dark)] font-semibold text-sm hover:bg-white/90 transition-colors"
                >
                  Review the {ideaCount === 1 ? "idea" : `${ideaCount} ideas`} ↓
                </button>
                <Link
                  href={conversationHref}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white/10 text-white font-semibold text-sm hover:bg-white/15 transition-colors"
                >
                  Open the conversation →
                </Link>
                {totalLeads > 0 && (
                  <Link
                    href="/member/content-planner/wizard?step=1"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[var(--abv-ink)] font-semibold text-sm transition-colors"
                    style={{ background: "var(--abv-azure)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#5BCEFF")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--abv-azure)")}
                  >
                    Browse all content ideas →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Empty state — no usable briefing yet
        <div className="rounded-2xl bg-[var(--abv-dark)] text-white p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <JarvisAvatar />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--abv-azure)]">
                From Jarvis
              </p>
              <h2 className="font-display text-2xl sm:text-3xl text-white mt-2">
                Let&apos;s get your <span className="text-[var(--abv-azure)]">briefing</span> started.
              </h2>
              <p className="text-white/70 text-sm sm:text-base mt-3 max-w-lg">
                {briefing?.reason === "no_market_config"
                  ? "Set up your market — your avatar, neighbourhoods, and keyword kit — so Jarvis can ground every idea in your data."
                  : "Upload your latest market data and Jarvis will turn it into grounded story ideas every month."}
              </p>
              <LinkButton
                href={briefing?.reason === "no_market_config" ? "/member/market-config" : "/member/market-data"}
                className="mt-5 !bg-white !text-[var(--abv-dark)] hover:!bg-white/90"
              >
                {briefing?.reason === "no_market_config" ? "Set up your market →" : "Upload market data →"}
              </LinkButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Ideas grid ── */}
      {hasBriefing && (
        <div ref={ideasRef} className="grid grid-cols-1 lg:grid-cols-3 gap-4 scroll-mt-6">
          {briefing!.ideas!.map((idea) => (
            <div
              key={idea.index}
              className="flex flex-col rounded-2xl border border-[var(--abv-border)] bg-[var(--abv-card)] p-5"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm text-[var(--abv-text-secondary)]">
                  {String(idea.index).padStart(2, "0")}
                </span>
                {idea.isThesis && (
                  <span className="rounded-full bg-[var(--abv-azure-tint)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--abv-azure)]">
                    Thesis
                  </span>
                )}
                {slotLabel(idea.rotationSlot) && (
                  <span className="rounded-full border border-[var(--abv-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--abv-text-secondary)]">
                    {slotLabel(idea.rotationSlot)}
                  </span>
                )}
              </div>
              <h3 className="font-display text-lg text-[var(--abv-text)] mt-2 leading-snug">
                {idea.title}
              </h3>
              <p className="text-sm text-[var(--abv-text-secondary)] mt-2 flex-1">
                {idea.why}
              </p>

              {idea.fact ? (
                <div className="mt-4 rounded-xl bg-[var(--abv-bg)] border border-[var(--abv-border)] p-3">
                  <p className="font-mono tabular-nums text-lg font-semibold text-[var(--abv-text)]">
                    {idea.fact.stat}
                  </p>
                  <p className="text-xs text-[var(--abv-text-secondary)] mt-0.5">{idea.fact.label}</p>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--abv-text)]/40 mt-1">
                    {idea.fact.source}
                  </p>
                </div>
              ) : idea.dataThreads.length > 0 ? (
                <div className="mt-4 rounded-xl bg-[var(--abv-bg)] border border-[var(--abv-border)] p-3">
                  <p className="font-mono text-sm text-[var(--abv-text)]">{idea.dataThreads[0]}</p>
                </div>
              ) : null}

              {openThinking === idea.index && (
                <div className="mt-3 rounded-xl bg-[var(--abv-bg)] border border-[var(--abv-border)] p-3 space-y-2 text-xs text-[var(--abv-text-secondary)]">
                  {idea.pattern && (
                    <p><span className="font-semibold text-[var(--abv-text)]">Pattern:</span> {idea.pattern}</p>
                  )}
                  {idea.dataThreads.length > 0 && (
                    <div>
                      <p className="font-semibold text-[var(--abv-text)]">Data threads</p>
                      <ul className="list-inside list-disc mt-0.5 space-y-0.5">
                        {idea.dataThreads.slice(0, 4).map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[var(--abv-border)]">
                <button
                  onClick={() => buildScript(idea)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--abv-dark)] text-white font-semibold text-sm hover:bg-black/90 transition-colors"
                >
                  Build a script →
                </button>
                <button
                  onClick={() => setOpenThinking(openThinking === idea.index ? null : idea.index)}
                  className="text-sm font-medium text-[var(--abv-text-secondary)] hover:text-[var(--abv-azure)] transition-colors"
                >
                  {openThinking === idea.index ? "Hide thinking" : "See thinking"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Bottom 2-col ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Top performing videos */}
        <div className="rounded-2xl border border-[var(--abv-border)] bg-[var(--abv-card)] p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <h2 className="text-sm font-semibold text-[var(--abv-text-secondary)] uppercase tracking-wider">
              This month&apos;s top videos
            </h2>
            <a
              href="https://studio.youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--abv-azure)] hover:underline shrink-0"
            >
              Open YouTube Studio
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <path d="M7 17 17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </a>
          </div>
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 bg-gray-100 dark:bg-[#1e1e1e] rounded-xl" />
              ))}
            </div>
          ) : topVideos.length === 0 ? (
            <p className="text-sm text-[var(--abv-text-secondary)] leading-relaxed">
              No videos yet. Once your channel syncs, your best performers will show up here.
            </p>
          ) : (
            <ul className="space-y-2">
              {topVideos.map((v, i) => (
                <li key={v.videoId}>
                  <a
                    href={studioUrl(v.videoId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-xl border border-[var(--abv-border)] bg-[var(--abv-bg)] p-2 transition hover:border-[var(--abv-text-secondary)]"
                  >
                    <span className="font-mono tabular-nums text-sm font-semibold text-[var(--abv-text-secondary)] w-4 text-center shrink-0">
                      {i + 1}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.thumbnailUrl ?? `https://i.ytimg.com/vi/${encodeURIComponent(v.videoId)}/mqdefault.jpg`}
                      alt=""
                      className="h-12 w-20 rounded-lg object-cover bg-[var(--abv-card)] shrink-0"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--abv-text)] truncate">
                        {v.title}
                      </p>
                      <p className="text-xs text-[var(--abv-text-secondary)] mt-0.5">
                        {v.viewCount.toLocaleString("en-CA")} views
                      </p>
                    </div>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 text-[var(--abv-text-secondary)] opacity-0 transition group-hover:opacity-100 shrink-0"
                      aria-hidden
                    >
                      <path d="M7 17 17 7" />
                      <path d="M7 7h10v10" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Hire a Human CTA */}
        <div className="rounded-2xl border border-[var(--abv-hire)]/30 bg-[var(--abv-hire-tint)] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--abv-hire)] mb-3">
            Want a hand with your content?
          </h2>
          <p className="text-lg font-bold text-[var(--abv-text)] leading-snug">
            You didn&apos;t get here to spend your evenings editing videos.
          </p>
          <p className="mt-2 text-sm text-[var(--abv-text-secondary)] leading-relaxed max-w-xl">
            From editing and thumbnails to fully done-for-you content, see all the ways
            our team can take the work off your plate.
          </p>
          <LinkButton
            href="/member/hire"
            className="mt-4 !bg-[var(--abv-hire)] !text-white hover:!opacity-90"
          >
            Explore Hire a Human →
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

