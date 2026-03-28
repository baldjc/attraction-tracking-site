"use client";

import { useState, useEffect } from "react";
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
  },
};

function getAccent(colour: string): AccentConfig {
  return ACCENT[colour] ?? ACCENT.blue;
}

// ── Package Card ──────────────────────────────────────────────

function PackageCard({ pkg, accentColour }: { pkg: Package; accentColour: string }) {
  const accent = getAccent(accentColour);
  const isGray = accentColour === "gray";
  const hasCallout = !isGray && accent.calloutBg && pkg.highlightFeatures && pkg.highlightFeatures.length > 0;

  return (
    <div className={`bg-white dark:bg-[#1a2433] rounded-xl ${accent.border} overflow-hidden flex flex-col relative`}>
      {/* Badge */}
      {pkg.badge && (
        <div className="absolute top-4 right-4">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${accent.badgeBg} ${accent.badgeText}`}>
            {pkg.badge}
          </span>
        </div>
      )}

      <div className={`px-6 pt-6 ${isGray ? "pb-3" : "pb-4"}`}>
        <h3 className={`font-bold text-[#2f3437] dark:text-white ${isGray ? "text-sm" : "text-lg"}`}>{pkg.name}</h3>
        {pkg.subtitle && (
          <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-0.5">{pkg.subtitle}</p>
        )}
        <p className={`font-extrabold text-[#2f3437] dark:text-white mt-3 ${isGray ? "text-xl" : "text-3xl"}`}>
          {pkg.price}
          {pkg.priceNote && (
            <span className="text-sm font-normal text-[#2f3437]/40 dark:text-white/30 ml-1">{pkg.priceNote}</span>
          )}
        </p>
      </div>

      {/* Callout box for highlight features (slate/purple) */}
      {hasCallout && (
        <div className={`mx-6 px-3 py-2 rounded-lg ${accent.calloutBg} ${accent.calloutBorder} mb-4`}>
          <p className={`text-xs font-medium ${accent.calloutText}`}>
            {accentColour === "slate" ? "Includes everything in Editing, plus:" : "Includes everything in Mastery 4, plus:"}
          </p>
        </div>
      )}

      <div className="px-6 pb-4 flex-1">
        {/* Highlight features */}
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

        {/* Standard features */}
        <ul className="space-y-2">
          {pkg.features.map((f) => (
            <li key={f} className={`flex items-start gap-2 text-sm ${isGray ? "text-[#2f3437]/60 dark:text-white/50" : "text-[#2f3437]/70 dark:text-white/60"}`}>
              <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="px-6 pb-6">
        {pkg.stripeUrl ? (
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

  useEffect(() => {
    fetch("/api/member/hire/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .finally(() => setLoading(false));
  }, []);

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
              {[1, 2].map((j) => (
                <div key={j} className="h-64 bg-[#eaeaea] dark:bg-white/10 rounded-xl animate-pulse" />
              ))}
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
    <div className="space-y-12 max-w-7xl pb-12">
      {/* Hero */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-[#6ba3c7]/10 rounded-lg">
            <UserGroupIcon className="w-6 h-6 text-[#6ba3c7]" />
          </div>
          <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">Hire a Human</h1>
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-2 max-w-2xl">
          You film, we handle the rest. Add editing, coaching, or full implementation support based on how fast you want to grow.
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
                <PackageCard key={pkg.id} pkg={pkg} accentColour={category.accentColour} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
