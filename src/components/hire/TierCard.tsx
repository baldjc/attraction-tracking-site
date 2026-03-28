"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";

// ── Types ──────────────────────────────────────────────────────

export interface TierPackage {
  id: string;
  name: string;
  price: string;
  priceNote: string | null;
  badge: string | null;
  subtitle?: string | null;
  features: string[];
  highlightFeatures: string[] | null;
  stripeUrl: string | null;
  waitlist: boolean;
  videoCount: number | null;
  isAddonVariant: boolean;
  priceAmount: number | null;
  published?: boolean;
}

export interface TierCategory {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
  tagline: string | null;
  description?: string | null;
  highlighted: boolean;
  includesRef: string | null;
  cardExtras: string[] | null;
  addonLabel: string | null;
  addonPriceNote: string | null;
  footerNote: string | null;
  jaredIncludedNote: string | null;
  published: boolean;
  packages: TierPackage[];
}

// ── VideoToggle ────────────────────────────────────────────────

function VideoToggle({
  value,
  options,
  onChange,
}: {
  value: number;
  options: number[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[#2f3437]/15 dark:border-white/15 overflow-hidden text-[11px] font-semibold">
      {options.map((n) => (
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
  previewMode,
}: {
  pkg: TierPackage | undefined;
  interested: boolean;
  onInterested: (id: string, name: string) => Promise<void>;
  className: string;
  previewMode: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);

  if (previewMode) {
    return (
      <button disabled className={`${className} opacity-50 cursor-default`}>
        Preview Only
      </button>
    );
  }

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
    <span className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#6ba3c7] cursor-default">
      <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" /> Message us to get started
    </span>
  );
}

// ── TierCard ──────────────────────────────────────────────────

export default function TierCard({
  category,
  interested = new Set(),
  onInterested = async () => {},
  previewMode = false,
}: {
  category: TierCategory;
  interested?: Set<string>;
  onInterested?: (id: string, name: string) => Promise<void>;
  previewMode?: boolean;
}) {
  const packages = category.packages;

  // ── Active package selection ──────────────────────────────
  const videoCounts = [
    ...new Set(packages.map((p) => p.videoCount).filter((v): v is number => v !== null)),
  ].sort((a, b) => a - b);
  const hasToggle = videoCounts.length > 1;
  const [selectedVideos, setSelectedVideos] = useState<number | null>(videoCounts[0] ?? null);

  const hasAddon =
    !!category.addonLabel &&
    packages.some((p) => p.isAddonVariant) &&
    packages.some((p) => !p.isAddonVariant);
  const [addJared, setAddJared] = useState(false);

  const activePackage =
    packages.find(
      (p) =>
        (selectedVideos === null || p.videoCount === selectedVideos) &&
        (!hasAddon || p.isAddonVariant === addJared)
    ) ?? packages[0];

  // ── Price parsing: "$500/mo" → "$500" + "mo" ─────────────
  const priceParts = (activePackage?.price ?? "").split("/");
  const priceMain = priceParts[0] ?? "";
  const priceSuffix = priceParts[1] ?? null;

  // ── Addon price delta ─────────────────────────────────────
  const baseVariant = hasAddon
    ? packages.find((p) => p.videoCount === selectedVideos && !p.isAddonVariant)
    : null;
  const addonVariant = hasAddon
    ? packages.find((p) => p.videoCount === selectedVideos && p.isAddonVariant)
    : null;
  const addonPrice =
    addonVariant?.priceAmount != null && baseVariant?.priceAmount != null
      ? (addonVariant.priceAmount - baseVariant.priceAmount) / 100
      : null;

  // ── CTA style ─────────────────────────────────────────────
  const ctaClass = `w-full py-2.5 rounded-lg text-sm font-bold transition-colors ${
    category.highlighted
      ? "bg-[#8B5CF6] hover:bg-[#7c3aed] text-white"
      : "bg-[#2f3437] dark:bg-white text-white dark:text-[#1e2a38] hover:bg-[#1e2a38] dark:hover:bg-white/90"
  }`;

  // Badge: show alongside label for non-highlighted, non-addon packages
  const showBadge =
    !category.highlighted && !!activePackage?.badge && !activePackage.isAddonVariant;

  const cardExtras = category.cardExtras as string[] | null;

  return (
    <div
      className={`bg-white dark:bg-[#1a2433] rounded-xl flex flex-col h-full p-5 relative ${
        category.highlighted
          ? "border-2 border-[#8B5CF6]"
          : "border border-[#eaeaea] dark:border-white/10"
      }`}
    >
      {/* Most Popular pill */}
      {category.highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="text-[10px] font-bold uppercase tracking-widest bg-[#8B5CF6] text-white px-3 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}

      {/* Category label row */}
      <div className={`flex items-center mb-2 ${showBadge ? "justify-between" : ""} ${category.highlighted ? "mt-1" : ""}`}>
        <p className={`text-[10px] font-bold uppercase tracking-widest ${
          category.highlighted
            ? "text-[#8B5CF6]/60"
            : "text-[#2f3437]/40 dark:text-white/30"
        }`}>
          {category.emoji} {category.name}
        </p>
        {showBadge && (
          <span className="text-[10px] font-bold uppercase tracking-widest bg-[#2f3437] dark:bg-white text-white dark:text-[#1e2a38] px-2 py-0.5 rounded-full">
            {activePackage!.badge}
          </span>
        )}
      </div>

      {/* Tagline */}
      {category.tagline && (
        <h3 className="text-base font-bold text-[#2f3437] dark:text-white leading-tight">
          {category.tagline}
        </h3>
      )}

      {/* Video toggle (or spacing before price) */}
      {hasToggle ? (
        <div className="mt-3 mb-4">
          <VideoToggle
            value={selectedVideos!}
            options={videoCounts}
            onChange={setSelectedVideos}
          />
        </div>
      ) : (
        <div className="mt-3" />
      )}

      {/* Price */}
      <div className="mb-4">
        <span className="text-3xl font-extrabold text-[#2f3437] dark:text-white">{priceMain}</span>
        {priceSuffix && (
          <span className="text-sm text-[#2f3437]/40 dark:text-white/30 ml-1">/{priceSuffix}</span>
        )}
        {activePackage?.priceNote && (
          <span className="text-[11px] font-semibold text-[#2f3437]/30 dark:text-white/25 ml-1.5">
            {activePackage.priceNote}
          </span>
        )}
      </div>

      {/* Footer note */}
      {category.footerNote && (
        <p className="text-[12px] text-[#2f3437]/40 dark:text-white/30 -mt-2 mb-4">
          {category.footerNote}
        </p>
      )}

      {/* Includes ref */}
      {category.includesRef && (
        <p className="text-[11px] font-semibold text-[#2f3437]/50 dark:text-white/40 uppercase tracking-wide mb-2">
          {category.includesRef}
        </p>
      )}

      {/* Features list */}
      {activePackage && (
        <ul className={`space-y-2 ${cardExtras && cardExtras.length > 0 ? "mb-3" : activePackage.highlightFeatures && activePackage.highlightFeatures.length > 0 ? "mb-2" : "mb-4 flex-1"}`}>
          {activePackage.features.map((f) => (
            <Feature key={f}>{f}</Feature>
          ))}
        </ul>
      )}

      {/* Highlight features */}
      {activePackage?.highlightFeatures && activePackage.highlightFeatures.length > 0 && (
        <ul className={`space-y-2 ${cardExtras && cardExtras.length > 0 ? "mb-3" : "mb-4 flex-1"}`}>
          {activePackage.highlightFeatures.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <CheckCircleIcon className="w-3.5 h-3.5 text-[#8B5CF6] mt-0.5 shrink-0" />
              <span className="text-[13px] text-[#2f3437]/70 dark:text-white/60 leading-snug">{f}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Addon checkbox */}
      {hasAddon && (
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
                {category.addonLabel}
              </span>
              {addonPrice !== null && (
                <span className="text-[13px] text-[#8B5CF6] font-semibold ml-1">
                  +${addonPrice.toLocaleString()}/mo
                </span>
              )}
              {category.addonPriceNote && (
                <p className="text-[11px] text-[#2f3437]/50 dark:text-white/40 mt-0.5">
                  {category.addonPriceNote}
                </p>
              )}
            </div>
          </label>
        </div>
      )}

      {/* Jared included callout */}
      {category.jaredIncludedNote && (
        <div className="flex items-center gap-2 bg-[#8B5CF6]/8 rounded-lg px-3 py-2 mb-4">
          <CheckCircleIcon className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />
          <span className="text-[12px] font-medium text-[#8B5CF6]">{category.jaredIncludedNote}</span>
        </div>
      )}

      {/* Card extras (The real difference) */}
      {cardExtras && cardExtras.length > 0 && (
        <div className="border-t border-[#eaeaea] dark:border-white/10 pt-3 mb-4 flex-1">
          <p className="text-[11px] font-semibold text-[#2f3437]/50 dark:text-white/40 uppercase tracking-wide mb-2">
            The real difference:
          </p>
          <ul className="space-y-2">
            {cardExtras.map((text) => (
              <li key={text} className="flex items-start gap-2">
                <span className="text-sm leading-none mt-0.5 shrink-0">💎</span>
                <span className="text-[13px] text-[#2f3437] dark:text-white/80 leading-snug font-medium">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA */}
      <div className="mt-auto">
        <CtaButton
          pkg={activePackage}
          interested={activePackage ? interested.has(activePackage.id) : false}
          onInterested={onInterested}
          className={ctaClass}
          previewMode={previewMode}
        />
      </div>
    </div>
  );
}
