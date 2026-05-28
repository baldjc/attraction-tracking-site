"use client";

import Link from "next/link";
import { AUDIT_TIER_TEXT, type AuditTier } from "./types";

export interface AuditCardProps {
  href: string;
  title: string;
  /** Numeric overall score, or null when not yet computed. */
  score: number | null;
  /** Tier band controlling the score colour. */
  tier: AuditTier;
  /** Bottom-right meta line (e.g. "Audited May 28"). */
  dateLabel: string;
  /** Optional YouTube-style thumbnail. When omitted, the canonical
   *  ink-to-azure gradient is shown. */
  thumbUrl?: string | null;
  /** Set on the horizontally-scrolling carousel layout to keep cards a
   *  fixed width. Defaults to true to match the existing Scores page. */
  fixedWidth?: boolean;
}

/**
 * Variant 6 — Audit Card. Thumbnail (or gradient placeholder), title,
 * tier-coloured score, and audited date.
 */
export function AuditCard({
  href,
  title,
  score,
  tier,
  dateLabel,
  thumbUrl,
  fixedWidth = true,
}: AuditCardProps) {
  return (
    <Link
      href={href}
      className={`bg-white border border-[var(--abv-border)] rounded-[12px] p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-[var(--abv-border-strong)] hover:-translate-y-px transition-all cursor-pointer ${
        fixedWidth ? "flex-shrink-0 w-[280px]" : ""
      }`}
    >
      <div
        className="aspect-[16/9] rounded-md flex items-end justify-end p-1.5 mb-3 relative overflow-hidden"
        style={{
          background: thumbUrl
            ? undefined
            : "linear-gradient(135deg, var(--abv-ink) 0%, rgba(61,195,255,0.25) 100%)",
        }}
      >
        {thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
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
          className={`font-display font-extrabold text-[22px] tracking-[-0.02em] leading-none tabular-nums ${AUDIT_TIER_TEXT[tier]}`}
        >
          {score != null ? score.toFixed(1) : "—"}
        </span>
        <span className="font-mono text-[10px] text-[var(--abv-text-dim)] tracking-[0.04em]">
          {dateLabel}
        </span>
      </div>
    </Link>
  );
}
