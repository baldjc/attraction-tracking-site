"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircleIcon,
  XMarkIcon,
  InformationCircleIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import PageHeader from "@/components/PageHeader";

// ── Types ──────────────────────────────────────────────────────

interface PackageData {
  id: string;
  stripeUrl: string | null;
  waitlist: boolean;
  name: string;
}

// ── Package ID mapping ─────────────────────────────────────────

const PKG = {
  prod2:      "editing-1",
  prod2Jared: "editing-2",
  prod4:      "editing-3",
  prod4Jared: "editing-4",
  growth2:    "mastery-1",
  growth4:    "mastery-2",
  dwu:        "ultimate-1",
} as const;

// ── Toast ─────────────────────────────────────────────────────

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#1e2a38] text-white text-sm font-medium px-5 py-3.5 rounded-xl shadow-2xl max-w-md w-[calc(100vw-2rem)] animate-slide-up">
      <CheckCircleIcon className="w-5 h-5 text-green-400 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Segmented Toggle ──────────────────────────────────────────

function VideoToggle({ value, onChange }: { value: 2 | 4; onChange: (v: 2 | 4) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-[#2f3437]/15 dark:border-white/15 overflow-hidden text-[11px] font-semibold">
      {([2, 4] as const).map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`px-3 py-1.5 transition-colors ${
            value === n
              ? "bg-[#2f3437] dark:bg-white text-white dark:text-[#1e2a38]"
              : "text-[#2f3437]/50 dark:text-white/50 hover:text-[#2f3437] dark:hover:text-white"
          }`}
        >
          {n} videos/mo
        </button>
      ))}
    </div>
  );
}

// ── Feature Item ──────────────────────────────────────────────

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
      <span className="text-[13px] text-[#2f3437]/70 dark:text-white/60 leading-snug">{children}</span>
    </li>
  );
}

// ── CTA Button ────────────────────────────────────────────────

function CtaButton({
  pkg,
  interested,
  onInterested,
  className,
}: {
  pkg: PackageData | undefined;
  interested: boolean;
  onInterested: (id: string, name: string) => Promise<void>;
  className: string;
}) {
  const [submitting, setSubmitting] = useState(false);

  if (!pkg) {
    return (
      <button disabled className={`${className} opacity-50 cursor-default`}>
        Get Started
      </button>
    );
  }

  if (pkg.waitlist) {
    if (interested) {
      return (
        <span className={`flex items-center justify-center gap-2 ${className} bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400 cursor-default`}>
          <CheckCircleIcon className="w-4 h-4" /> We&apos;ll be in touch ✓
        </span>
      );
    }
    return (
      <button
        onClick={async () => { setSubmitting(true); await onInterested(pkg.id, pkg.name); setSubmitting(false); }}
        disabled={submitting}
        className={`${className} disabled:opacity-50`}
      >
        {submitting ? "Sending…" : "I'm Interested"}
      </button>
    );
  }

  if (pkg.stripeUrl) {
    return (
      <a href={pkg.stripeUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center justify-center gap-2 ${className}`}>
        Get Started <ArrowTopRightOnSquareIcon className="w-4 h-4" />
      </a>
    );
  }

  return (
    <span className={`flex items-center justify-center gap-1.5 text-xs font-semibold text-[#6ba3c7] cursor-default`}>
      <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" /> Message us to get started
    </span>
  );
}

// ── Production Card ───────────────────────────────────────────

function ProductionCard({
  packages,
  interested,
  onInterested,
}: {
  packages: Map<string, PackageData>;
  interested: Set<string>;
  onInterested: (id: string, name: string) => Promise<void>;
}) {
  const [videos, setVideos] = useState<2 | 4>(2);
  const [addJared, setAddJared] = useState(false);

  const basePrice = videos === 2 ? 500 : 1000;
  const jaredAddon = videos === 2 ? 300 : 500;
  const totalPrice = addJared ? basePrice + jaredAddon : basePrice;

  const pkgId = videos === 2
    ? (addJared ? PKG.prod2Jared : PKG.prod2)
    : (addJared ? PKG.prod4Jared : PKG.prod4);
  const pkg = packages.get(pkgId);

  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border border-[#eaeaea] dark:border-white/10 flex flex-col h-full p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#2f3437]/40 dark:text-white/30 mb-2">🎬 Production</p>
      <h3 className="text-base font-bold text-[#2f3437] dark:text-white leading-tight">We edit. You publish.</h3>
      <div className="mt-3 mb-4">
        <VideoToggle value={videos} onChange={setVideos} />
      </div>

      <div className="mb-4">
        <span className="text-3xl font-extrabold text-[#2f3437] dark:text-white">${totalPrice.toLocaleString()}</span>
        <span className="text-sm text-[#2f3437]/40 dark:text-white/30 ml-1">/mo</span>
      </div>

      <ul className="space-y-2 mb-4 flex-1">
        <Feature>Professional editing, graphics, titles, and b-roll</Feature>
        <Feature>Music and asset licensing</Feature>
        <Feature>Upload to Frame.io for review</Feature>
        <Feature>2–3 revisions per video</Feature>
        <Feature>Onboarding call to customise to your brand</Feature>
      </ul>

      <div className="border-t border-[#eaeaea] dark:border-white/10 pt-3 mb-4">
        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={addJared}
            onChange={(e) => setAddJared(e.target.checked)}
            className="mt-0.5 w-3.5 h-3.5 accent-[#8B5CF6] shrink-0 cursor-pointer"
          />
          <div>
            <span className="text-[13px] text-[#2f3437] dark:text-white font-medium group-hover:text-[#8B5CF6] transition-colors">
              Add Jared&apos;s personal feedback
            </span>
            <span className="text-[13px] text-[#8B5CF6] font-semibold ml-1">+${jaredAddon}/mo</span>
            <p className="text-[11px] text-[#2f3437]/50 dark:text-white/40 mt-0.5">1-on-1 coaching call + video-by-video review</p>
          </div>
        </label>
      </div>

      <div className="mt-auto">
        <CtaButton
          pkg={pkg}
          interested={pkg ? interested.has(pkg.id) : false}
          onInterested={onInterested}
          className="w-full py-2.5 rounded-lg text-sm font-bold bg-[#2f3437] dark:bg-white text-white dark:text-[#1e2a38] hover:bg-[#1e2a38] dark:hover:bg-white/90 transition-colors"
        />
      </div>
    </div>
  );
}

// ── Growth Card ───────────────────────────────────────────────

function GrowthCard({
  packages,
  interested,
  onInterested,
}: {
  packages: Map<string, PackageData>;
  interested: Set<string>;
  onInterested: (id: string, name: string) => Promise<void>;
}) {
  const [videos, setVideos] = useState<2 | 4>(2);
  const price = videos === 2 ? 1996 : 2996;
  const pkgId = videos === 2 ? PKG.growth2 : PKG.growth4;
  const pkg = packages.get(pkgId);

  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border-2 border-[#8B5CF6] flex flex-col h-full p-5 relative">
      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
        <span className="text-[10px] font-bold uppercase tracking-widest bg-[#8B5CF6] text-white px-3 py-1 rounded-full">
          Most Popular
        </span>
      </div>

      <p className="text-[10px] font-bold uppercase tracking-widest text-[#8B5CF6]/60 mb-2 mt-1">📈 Growth</p>
      <h3 className="text-base font-bold text-[#2f3437] dark:text-white leading-tight">Editing + strategy + funnels.</h3>
      <div className="mt-3 mb-4">
        <VideoToggle value={videos} onChange={setVideos} />
      </div>

      <div className="mb-4">
        <span className="text-3xl font-extrabold text-[#2f3437] dark:text-white">${price.toLocaleString()}</span>
        <span className="text-sm text-[#2f3437]/40 dark:text-white/30 ml-1">/mo</span>
      </div>

      <p className="text-[11px] font-semibold text-[#2f3437]/50 dark:text-white/40 uppercase tracking-wide mb-2">
        Includes everything in Production, plus:
      </p>
      <ul className="space-y-2 mb-4 flex-1">
        <Feature>Full funnel built at launch</Feature>
        <Feature>Lead magnet strategy and setup</Feature>
        <Feature>Monthly strategy session with Jared</Feature>
        <Feature>Content calendar planning</Feature>
      </ul>

      <div className="flex items-center gap-2 bg-[#8B5CF6]/8 rounded-lg px-3 py-2 mb-4">
        <CheckCircleIcon className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />
        <span className="text-[12px] font-medium text-[#8B5CF6]">Jared&apos;s feedback included</span>
      </div>

      <div className="mt-auto">
        <CtaButton
          pkg={pkg}
          interested={pkg ? interested.has(pkg.id) : false}
          onInterested={onInterested}
          className="w-full py-2.5 rounded-lg text-sm font-bold bg-[#8B5CF6] hover:bg-[#7c3aed] text-white transition-colors"
        />
      </div>
    </div>
  );
}

// ── Done With You Card ────────────────────────────────────────

function DoneWithYouCard({
  packages,
  interested,
  onInterested,
}: {
  packages: Map<string, PackageData>;
  interested: Set<string>;
  onInterested: (id: string, name: string) => Promise<void>;
}) {
  const pkg = packages.get(PKG.dwu);

  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border border-[#eaeaea] dark:border-white/10 flex flex-col h-full p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#2f3437]/40 dark:text-white/30">💎 Done With You</p>
        <span className="text-[10px] font-bold uppercase tracking-widest bg-[#2f3437] dark:bg-white text-white dark:text-[#1e2a38] px-2 py-0.5 rounded-full">
          Full Service
        </span>
      </div>
      <h3 className="text-base font-bold text-[#2f3437] dark:text-white leading-tight">You film and close deals. We build your entire YouTube engine.</h3>
      <div className="mt-3 mb-4">
        <span className="text-3xl font-extrabold text-[#2f3437] dark:text-white">$4,500</span>
        <span className="text-sm text-[#2f3437]/40 dark:text-white/30 ml-1">/mo</span>
      </div>

      <p className="text-[11px] font-semibold text-[#2f3437]/50 dark:text-white/40 uppercase tracking-wide mb-2">
        Includes everything in Growth, plus:
      </p>
      <ul className="space-y-2 mb-3">
        <Feature>Unlimited video edits (no monthly cap)</Feature>
        <Feature>Full YouTube channel management</Feature>
        <Feature>Thumbnail design and A/B testing</Feature>
        <Feature>SEO optimisation, descriptions, and publishing</Feature>
        <Feature>Weekly performance reporting</Feature>
      </ul>

      <div className="border-t border-[#eaeaea] dark:border-white/10 pt-3 mb-4 flex-1">
        <p className="text-[11px] font-semibold text-[#2f3437]/50 dark:text-white/40 uppercase tracking-wide mb-2">
          The real difference:
        </p>
        <ul className="space-y-2">
          {[
            "We own your entire content pipeline — from raw footage to live video",
            "You get back 15–20+ hours per month to focus on clients",
            "Your channel never misses a week, even when life gets busy",
          ].map((text) => (
            <li key={text} className="flex items-start gap-2">
              <span className="text-sm leading-none mt-0.5 shrink-0">💎</span>
              <span className="text-[13px] text-[#2f3437] dark:text-white/80 leading-snug font-medium">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto">
        <CtaButton
          pkg={pkg}
          interested={pkg ? interested.has(pkg.id) : false}
          onInterested={onInterested}
          className="w-full py-2.5 rounded-lg text-sm font-bold bg-[#2f3437] dark:bg-white text-white dark:text-[#1e2a38] hover:bg-[#1e2a38] dark:hover:bg-white/90 transition-colors"
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function HireAHumanPage() {
  const [packages, setPackages] = useState<Map<string, PackageData>>(new Map());
  const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    Promise.all([
      fetch("/api/member/hire/categories").then((r) => r.ok ? r.json() : { categories: [] }),
      fetch("/api/member/hire/waitlist").then((r) => r.ok ? r.json() : { packageIds: [] }),
    ]).then(([catData, wlData]) => {
      const map = new Map<string, PackageData>();
      for (const cat of catData.categories ?? []) {
        for (const pkg of cat.packages ?? []) {
          map.set(pkg.id, { id: pkg.id, stripeUrl: pkg.stripeUrl, waitlist: pkg.waitlist, name: pkg.name });
        }
      }
      setPackages(map);
      setInterestedIds(new Set(wlData.packageIds ?? []));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleInterested = useCallback(async (packageId: string, packageName: string) => {
    const res = await fetch("/api/member/hire/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId }),
    });
    if (res.ok) {
      setInterestedIds((prev) => new Set([...prev, packageId]));
      setToast(`Thanks for your interest in ${packageName}! Jared will reach out shortly.`);
    }
  }, []);

  return (
    <>
      <div className="space-y-8 max-w-7xl pb-12">

        {/* Header */}
        <div>
          <PageHeader
            emoji="🤝"
            title="Hire a Human"
          />

          <p className="text-2xl font-bold text-[#2f3437] dark:text-white leading-snug max-w-2xl mb-6">
            You didn&apos;t get to where you are only to spend your weekends and evenings editing videos.
          </p>

          <div
            className="pl-5 max-w-2xl"
            style={{ borderLeft: "3px solid rgba(139,92,246,0.30)" }}
          >
            <p className="text-sm text-[#2f3437]/60 dark:text-white/60 leading-relaxed">
              <span className="font-semibold text-[#2f3437] dark:text-white">You know what to say on camera.</span>{" "}
              It&apos;s everything after you hit stop that kills your momentum.
            </p>
            <p className="text-sm text-[#2f3437]/60 dark:text-white/60 leading-relaxed mt-4">
              <span className="font-semibold text-[#2f3437] dark:text-white">One skipped week becomes two.</span>{" "}
              Then a month. Then you&apos;re starting over.
            </p>
            <p className="text-sm text-[#2f3437]/60 dark:text-white/60 leading-relaxed mt-4">
              The agents who grow fastest aren&apos;t better on camera —{" "}
              <span className="font-semibold text-[#2f3437] dark:text-white">they just never stop publishing.</span>
            </p>
          </div>
        </div>

        {/* 3-tier cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-96 bg-[#eaeaea] dark:bg-white/10 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            <ProductionCard packages={packages} interested={interestedIds} onInterested={handleInterested} />
            <GrowthCard packages={packages} interested={interestedIds} onInterested={handleInterested} />
            <DoneWithYouCard packages={packages} interested={interestedIds} onInterested={handleInterested} />
          </div>
        )}

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-[#6ba3c7]/8 border border-[#6ba3c7]/20 rounded-lg px-5 py-4">
          <InformationCircleIcon className="w-4 h-4 text-[#6ba3c7] shrink-0 mt-0.5" />
          <p className="text-sm text-[#2f3437]/70 dark:text-white/60">
            <span className="font-semibold text-[#2f3437] dark:text-white">All packages are added to your existing Foundations membership</span>
            {" "}— one invoice, one billing date.
          </p>
        </div>

      </div>

      {toast && <Toast message={toast} onDismiss={dismissToast} />}

      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translate(-50%, 1rem); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slide-up { animation: slide-up 0.25s ease-out both; }
      `}</style>
    </>
  );
}
