"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FilmIcon,
  RocketLaunchIcon,
  SparklesIcon,
  PuzzlePieceIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  AcademicCapIcon,
  XMarkIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FilmIcon,
  RocketLaunchIcon,
  SparklesIcon,
  PuzzlePieceIcon,
  UserGroupIcon,
  AcademicCapIcon,
};

interface Package {
  id: string;
  name: string;
  price: string;
  priceNote: string | null;
  badge: string | null;
  subtitle: string | null;
  features: string[];
  highlightFeatures: string[] | null;
  stripeUrl: string | null;
  waitlist: boolean;
  sortOrder: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  accentColour: string;
  sortOrder: number;
  packages: Package[];
}

// ── Toast ─────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

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

// ── Accent config ─────────────────────────────────────────────

interface AccentConfig {
  border: string;
  calloutBg: string;
  calloutBorder: string;
  calloutText: string;
  highlightIcon: string;
  badgeBg: string;
  badgeText: string;
  button: string;
  interestedBtn: string;
}

const ACCENT: Record<string, AccentConfig> = {
  blue: {
    border: "border border-[#eaeaea] dark:border-white/10",
    calloutBg: "",
    calloutBorder: "",
    calloutText: "",
    highlightIcon: "text-amber-500",
    badgeBg: "bg-amber-100 dark:bg-amber-900/30",
    badgeText: "text-amber-700 dark:text-amber-300",
    button: "bg-[#6ba3c7] hover:bg-[#5490b5] text-white",
    interestedBtn: "border border-[#6ba3c7] text-[#6ba3c7] hover:bg-[#6ba3c7]/5",
  },
  slate: {
    border: "border-2 border-slate-200 dark:border-slate-600/40",
    calloutBg: "bg-slate-50 dark:bg-slate-800/30",
    calloutBorder: "border border-slate-200 dark:border-slate-700/40",
    calloutText: "text-slate-600 dark:text-slate-300",
    highlightIcon: "text-slate-600 dark:text-slate-300",
    badgeBg: "bg-slate-100 dark:bg-slate-700/50",
    badgeText: "text-slate-700 dark:text-slate-200",
    button: "bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white",
    interestedBtn: "border border-slate-600 text-slate-700 dark:border-slate-400 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30",
  },
  purple: {
    border: "border-2 border-purple-200 dark:border-purple-700/40",
    calloutBg: "bg-purple-50 dark:bg-purple-900/10",
    calloutBorder: "border border-purple-200 dark:border-purple-800/30",
    calloutText: "text-purple-700 dark:text-purple-300",
    highlightIcon: "text-purple-600 dark:text-purple-400",
    badgeBg: "bg-purple-100 dark:bg-purple-800/40",
    badgeText: "text-purple-700 dark:text-purple-200",
    button: "bg-purple-700 hover:bg-purple-800 dark:bg-purple-600 dark:hover:bg-purple-500 text-white",
    interestedBtn: "border border-purple-500 text-purple-700 dark:border-purple-400 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/10",
  },
  gray: {
    border: "border border-[#eaeaea] dark:border-white/10",
    calloutBg: "",
    calloutBorder: "",
    calloutText: "",
    highlightIcon: "text-gray-500",
    badgeBg: "bg-gray-100 dark:bg-gray-700/50",
    badgeText: "text-gray-700 dark:text-gray-200",
    button: "bg-[#6ba3c7] hover:bg-[#5490b5] text-white",
    interestedBtn: "border border-[#6ba3c7] text-[#6ba3c7] hover:bg-[#6ba3c7]/5",
  },
};

function getAccent(colour: string): AccentConfig {
  return ACCENT[colour] ?? ACCENT.blue;
}

// ── Package Card ──────────────────────────────────────────────

function PackageCard({
  pkg,
  accentColour,
  interested,
  onInterested,
}: {
  pkg: Package;
  accentColour: string;
  interested: boolean;
  onInterested: (id: string, name: string) => Promise<void>;
}) {
  const accent = getAccent(accentColour);
  const isGray = accentColour === "gray";
  const hasCallout = !isGray && accent.calloutBg && pkg.highlightFeatures && pkg.highlightFeatures.length > 0;
  const [submitting, setSubmitting] = useState(false);

  async function handleInterested() {
    setSubmitting(true);
    await onInterested(pkg.id, pkg.name);
    setSubmitting(false);
  }

  return (
    <div className={`bg-white dark:bg-[#1a2433] rounded-xl ${accent.border} overflow-hidden flex flex-col relative`}>
      {pkg.badge && (
        <div className="absolute top-4 right-4">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${accent.badgeBg} ${accent.badgeText}`}>
            {pkg.badge}
          </span>
        </div>
      )}

      <div className={`px-6 pt-6 ${isGray ? "pb-3" : "pb-4"}`}>
        <h3 className={`font-bold text-[#2f3437] dark:text-white ${isGray ? "text-sm" : "text-lg"} ${pkg.badge ? "pr-28" : ""}`}>{pkg.name}</h3>
        {pkg.subtitle && <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-0.5">{pkg.subtitle}</p>}
        <p className={`font-extrabold text-[#2f3437] dark:text-white mt-3 ${isGray ? "text-xl" : "text-3xl"}`}>
          {pkg.price}
          {pkg.priceNote && <span className="text-sm font-normal text-[#2f3437]/40 dark:text-white/30 ml-1">{pkg.priceNote}</span>}
        </p>
      </div>

      {hasCallout && (
        <div className={`mx-6 px-3 py-2 rounded-lg ${accent.calloutBg} ${accent.calloutBorder} mb-4`}>
          <p className={`text-xs font-medium ${accent.calloutText}`}>
            {accentColour === "slate" ? "Includes everything in Editing, plus:" : "Includes everything in Mastery 4, plus:"}
          </p>
        </div>
      )}

      <div className="px-6 pb-4 flex-1">
        {pkg.highlightFeatures && pkg.highlightFeatures.length > 0 && (
          <div className={hasCallout ? "mb-4" : "mb-3 pb-3 border-b border-[#eaeaea] dark:border-white/10"}>
            {!hasCallout && (
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${accent.highlightIcon}`}>
                {pkg.badge ?? "Highlights"}
              </p>
            )}
            <ul className="space-y-2">
              {pkg.highlightFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm font-medium text-[#2f3437] dark:text-white">
                  <CheckCircleIcon className={`w-4 h-4 mt-0.5 shrink-0 ${accent.highlightIcon}`} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="space-y-2">
          {pkg.features.map((f) => (
            <li key={f} className={`flex items-start gap-2 text-sm ${isGray ? "text-[#2f3437]/60 dark:text-white/50" : "text-[#2f3437]/70 dark:text-white/60"}`}>
              <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-6 pb-6">
        {pkg.waitlist ? (
          interested ? (
            <span className="flex items-center gap-2 w-full justify-center text-sm font-semibold py-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400 cursor-default">
              <CheckCircleIcon className="w-4 h-4" />
              We&apos;ll be in touch ✓
            </span>
          ) : (
            <button
              onClick={handleInterested}
              disabled={submitting}
              className={`flex items-center justify-center gap-2 w-full font-bold text-sm py-3 rounded-lg transition-colors bg-transparent disabled:opacity-50 ${accent.interestedBtn}`}
            >
              {submitting ? "Sending…" : "I'm Interested"}
            </button>
          )
        ) : pkg.stripeUrl ? (
          <a
            href={pkg.stripeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center justify-center gap-2 w-full font-bold text-sm py-3 rounded-lg transition-colors ${accent.button}`}
          >
            Get Started
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6ba3c7]">
            <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
            Message us to get started
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function HireAHumanPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/member/hire/categories").then((r) => r.ok ? r.json() : { categories: [] }),
      fetch("/api/member/hire/waitlist").then((r) => r.ok ? r.json() : { packageIds: [] }),
    ]).then(([catData, wlData]) => {
      setCategories(catData.categories ?? []);
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
      setToast(`Thanks for your interest in ${packageName}! Jared will reach out to you shortly to get you set up.`);
    }
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  if (loading) {
    return (
      <div className="space-y-12 max-w-7xl pb-12">
        <div>
          <div className="h-8 bg-[#eaeaea] dark:bg-white/10 rounded w-48 animate-pulse mb-2" />
          <div className="h-4 bg-[#eaeaea] dark:bg-white/10 rounded w-96 animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-4">
            <div className="h-6 bg-[#eaeaea] dark:bg-white/10 rounded w-40 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[1, 2].map((j) => <div key={j} className="h-64 bg-[#eaeaea] dark:bg-white/10 rounded-xl animate-pulse" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="max-w-7xl pb-12">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-[#6ba3c7]/10 rounded-lg">
            <UserGroupIcon className="w-6 h-6 text-[#6ba3c7]" />
          </div>
          <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">Hire a Human</h1>
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40">No services available yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-12 max-w-7xl pb-12">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#6ba3c7]/10 via-[#6ba3c7]/5 to-transparent dark:from-[#6ba3c7]/12 dark:via-[#6ba3c7]/5 dark:to-transparent border border-[#6ba3c7]/20 dark:border-[#6ba3c7]/15 px-8 py-8 md:px-10 md:py-10">
          {/* Decorative background circle */}
          <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[#6ba3c7]/8 dark:bg-[#6ba3c7]/6 blur-3xl" />

          {/* Label + heading */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="p-2 bg-[#6ba3c7]/15 dark:bg-[#6ba3c7]/20 rounded-lg">
              <UserGroupIcon className="w-5 h-5 text-[#6ba3c7]" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-[#6ba3c7]">Hire a Human</span>
          </div>

          {/* Hook */}
          <h1 className="text-2xl md:text-3xl font-bold text-[#2f3437] dark:text-white leading-snug max-w-2xl mb-6">
            You didn&apos;t get to where you are only to spend your weekends and evenings editing videos.
          </h1>

          {/* Body copy */}
          <div className="max-w-2xl space-y-4 border-l-2 border-[#6ba3c7]/30 pl-5">
            <p className="text-sm leading-relaxed text-[#2f3437]/60 dark:text-white/50">
              The biggest thing holding most agents back from consistent content isn&apos;t strategy — it&apos;s everything that comes after you hit record. The editing, the thumbnails, the SEO, the publishing. That&apos;s where the procrastination creeps in, and that&apos;s where your content calendar dies.
            </p>
            <p className="text-sm leading-relaxed text-[#2f3437]/60 dark:text-white/50">
              The most successful agents we work with figured out the same thing:{" "}
              <span className="font-semibold text-[#2f3437]/80 dark:text-white/75">
                you don&apos;t need to do it all yourself — you need the right people doing the things they&apos;re better at than you are.
              </span>
            </p>
            <p className="text-sm leading-relaxed text-[#2f3437]/60 dark:text-white/50">
              That&apos;s what Hire a Human is. You keep doing what only you can do — showing up on camera with your expertise and your personality. We handle everything else.
            </p>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-[#6ba3c7]/8 border border-[#6ba3c7]/20 rounded-lg px-5 py-4">
          <InformationCircleIcon className="w-4 h-4 text-[#6ba3c7] shrink-0 mt-0.5" />
          <p className="text-sm text-[#2f3437]/70 dark:text-white/60">
            <span className="font-semibold text-[#2f3437] dark:text-white">All packages are added to your existing Foundations membership</span>
            {" "}— one invoice, one billing date.
          </p>
        </div>

        {categories.map((category) => {
          const IconComponent = ICON_MAP[category.icon] ?? PuzzlePieceIcon;
          const isGray = category.accentColour === "gray";

          return (
            <section key={category.id}>
              <div className="flex items-center gap-3 mb-2">
                <IconComponent className={`w-5 h-5 ${isGray ? "text-[#2f3437]/40 dark:text-white/40" : "text-[#6ba3c7]"}`} />
                <h2 className={`font-bold text-[#2f3437] dark:text-white ${isGray ? "text-lg" : "text-xl"}`}>{category.name}</h2>
              </div>
              {category.description && (
                <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mb-6 max-w-2xl">{category.description}</p>
              )}
              <div className={`grid gap-5 ${isGray ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 md:grid-cols-2"}`}>
                {category.packages.map((pkg) => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    accentColour={category.accentColour}
                    interested={interestedIds.has(pkg.id)}
                    onInterested={handleInterested}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Toast */}
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
