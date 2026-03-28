"use client";

import { useState, useCallback } from "react";
import {
  CheckCircleIcon,
  XMarkIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import PageHeader from "@/components/PageHeader";

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

// ── Production Card ───────────────────────────────────────────

function ProductionCard({ onGetStarted }: { onGetStarted: () => void }) {
  const [videos, setVideos] = useState<2 | 4>(2);
  const [addJared, setAddJared] = useState(false);

  const basePrice = videos === 2 ? 500 : 1000;
  const jaredAddon = videos === 2 ? 300 : 500;
  const totalPrice = addJared ? basePrice + jaredAddon : basePrice;

  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border border-[#eaeaea] dark:border-white/10 flex flex-col p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#2f3437]/40 dark:text-white/30 mb-2">Production</p>
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

      <button
        onClick={onGetStarted}
        className="w-full py-2.5 rounded-lg text-sm font-bold bg-[#2f3437] dark:bg-white text-white dark:text-[#1e2a38] hover:bg-[#1e2a38] dark:hover:bg-white/90 transition-colors"
      >
        Get Started
      </button>
    </div>
  );
}

// ── Growth Card ───────────────────────────────────────────────

function GrowthCard({ onGetStarted }: { onGetStarted: () => void }) {
  const [videos, setVideos] = useState<2 | 4>(2);
  const price = videos === 2 ? 1996 : 2996;

  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border-2 border-[#8B5CF6] flex flex-col p-5 relative">
      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
        <span className="text-[10px] font-bold uppercase tracking-widest bg-[#8B5CF6] text-white px-3 py-1 rounded-full">
          Most Popular
        </span>
      </div>

      <p className="text-[10px] font-bold uppercase tracking-widest text-[#8B5CF6]/60 mb-2 mt-1">Growth</p>
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

      <button
        onClick={onGetStarted}
        className="w-full py-2.5 rounded-lg text-sm font-bold bg-[#8B5CF6] hover:bg-[#7c3aed] text-white transition-colors"
      >
        Get Started
      </button>
    </div>
  );
}

// ── Done With You Card ────────────────────────────────────────

function DoneWithYouCard({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border border-[#eaeaea] dark:border-white/10 flex flex-col p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#2f3437]/40 dark:text-white/30">Done With You</p>
        <span className="text-[10px] font-bold uppercase tracking-widest bg-[#2f3437] dark:bg-white text-white dark:text-[#1e2a38] px-2 py-0.5 rounded-full">
          Full Service
        </span>
      </div>
      <h3 className="text-base font-bold text-[#2f3437] dark:text-white leading-tight">You film. We handle everything else.</h3>
      <div className="mt-3 mb-4">
        <span className="text-3xl font-extrabold text-[#2f3437] dark:text-white">$4,500</span>
        <span className="text-sm text-[#2f3437]/40 dark:text-white/30 ml-1">/mo</span>
      </div>

      <p className="text-[11px] font-semibold text-[#2f3437]/50 dark:text-white/40 uppercase tracking-wide mb-2">
        Includes everything in Growth, plus:
      </p>
      <ul className="space-y-2 mb-4 flex-1">
        <Feature>Unlimited video edits</Feature>
        <Feature>Full YouTube channel management</Feature>
        <Feature>Thumbnail design and A/B testing</Feature>
        <Feature>SEO optimisation and publishing</Feature>
      </ul>

      <button
        onClick={onGetStarted}
        className="w-full py-2.5 rounded-lg text-sm font-bold bg-[#2f3437] dark:bg-white text-white dark:text-[#1e2a38] hover:bg-[#1e2a38] dark:hover:bg-white/90 transition-colors mt-auto"
      >
        Get Started
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function HireAHumanPage() {
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  function handleGetStarted() {
    setToast("We'll reach out to get you set up — Jared will be in touch shortly.");
    setTimeout(() => setToast(null), 6000);
  }

  return (
    <>
      <div className="space-y-8 max-w-7xl pb-12">

        {/* Header */}
        <div>
          <PageHeader
            emoji="🤝"
            title="Hire a Human"
            description="Get the right people doing the things they're better at than you are."
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <ProductionCard onGetStarted={handleGetStarted} />
          <GrowthCard onGetStarted={handleGetStarted} />
          <DoneWithYouCard onGetStarted={handleGetStarted} />
        </div>

        {/* Info banner — below the cards */}
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
