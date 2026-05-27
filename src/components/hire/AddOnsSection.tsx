"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { type TierCategory, type TierPackage } from "./TierCard";

// ── CTA Button ────────────────────────────────────────────────

function AddonCta({
  pkg,
  interested,
  onInterested,
}: {
  pkg: TierPackage;
  interested: boolean;
  onInterested: (id: string, name: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  const base =
    "w-full mt-3 py-2 rounded-lg text-sm font-bold transition-colors text-center";

  if (pkg.waitlist) {
    if (interested) {
      return (
        <span className={`${base} flex items-center justify-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400 cursor-default`}>
          <CheckCircleIcon className="w-4 h-4" /> We&apos;ll be in touch ✓
        </span>
      );
    }
    return (
      <button
        onClick={async () => { setSubmitting(true); await onInterested(pkg.id, pkg.name); setSubmitting(false); }}
        disabled={submitting}
        className={`${base} bg-[var(--abv-text)] dark:bg-white text-white dark:text-[var(--abv-dark)] hover:bg-[var(--abv-dark)] dark:hover:bg-white/90 disabled:opacity-50`}
      >
        {submitting ? "Sending…" : "I'm Interested"}
      </button>
    );
  }

  if (pkg.stripeUrl) {
    return (
      <a
        href={pkg.stripeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} flex items-center justify-center gap-2 bg-[var(--abv-text)] dark:bg-white text-white dark:text-[var(--abv-dark)] hover:bg-[var(--abv-dark)] dark:hover:bg-white/90`}
      >
        Get Started <ArrowTopRightOnSquareIcon className="w-4 h-4" />
      </a>
    );
  }

  return (
    <span className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--abv-azure)] cursor-default">
      <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" /> Message us to get started
    </span>
  );
}

// ── Add-On Card ───────────────────────────────────────────────

function AddonCard({
  pkg,
  interested,
  onInterested,
}: {
  pkg: TierPackage;
  interested: boolean;
  onInterested: (id: string, name: string) => Promise<void>;
}) {
  const priceParts = pkg.price.split("/");
  const priceMain = priceParts[0] ?? "";
  const priceSuffix = priceParts[1] ?? null;

  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border border-[var(--abv-border-strong)] dark:border-white/10 p-5 flex flex-col">
      <p className="text-sm font-bold text-[var(--abv-text)] dark:text-white leading-tight mb-1">
        {pkg.name}
      </p>

      <div className="mb-1">
        <span className="text-xl font-extrabold text-[var(--abv-text)] dark:text-white">{priceMain}</span>
        {priceSuffix && (
          <span className="text-sm text-[var(--abv-text)]/40 dark:text-white/30 ml-1">/{priceSuffix}</span>
        )}
        {pkg.priceNote && (
          <span className="text-[11px] font-semibold text-[var(--abv-text)]/30 dark:text-white/25 ml-1.5">{pkg.priceNote}</span>
        )}
      </div>

      {pkg.subtitle && (
        <p className="text-[12px] text-[var(--abv-text)]/50 dark:text-white/40 mb-2 leading-snug">{pkg.subtitle}</p>
      )}

      {pkg.features.length > 0 && (
        <ul className="space-y-1.5 mt-1 flex-1">
          {pkg.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
              <span className="text-[13px] text-[var(--abv-text)]/70 dark:text-white/60 leading-snug">{f}</span>
            </li>
          ))}
        </ul>
      )}

      <AddonCta pkg={pkg} interested={interested} onInterested={onInterested} />
    </div>
  );
}

// ── AddOnsSection ─────────────────────────────────────────────

export default function AddOnsSection({
  category,
  interested,
  onInterested,
}: {
  category: TierCategory;
  interested: Set<string>;
  onInterested: (id: string, name: string) => Promise<void>;
}) {
  const published = category.packages.filter((p) => p.published !== false);
  if (published.length === 0) return null;

  return (
    <div>
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--abv-text)]/40 dark:text-white/30 mb-1">
          {category.emoji} {category.name}
        </p>
        {category.description && (
          <p className="text-sm text-[var(--abv-text)]/60 dark:text-white/50">{category.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {published.map((pkg) => (
          <AddonCard
            key={pkg.id}
            pkg={pkg}
            interested={interested.has(pkg.id)}
            onInterested={onInterested}
          />
        ))}
      </div>
    </div>
  );
}
