"use client";

import Link from "next/link";

export interface LessonCardProps {
  href: string;
  title: string;
  /** Eyebrow tag rendered on the cover image, top-left. */
  coverEyebrow?: string | null;
  /** Bottom meta line (e.g. "⏱ ~12 min"). */
  meta?: string | null;
  /** Background for the cover. Accepts a CSS background value (gradient).
   *  Falls back to the canonical ink-to-azure gradient. */
  coverBackground?: string;
}

const DEFAULT_COVER_BG =
  "linear-gradient(135deg, var(--abv-ink) 0%, rgba(61,195,255,0.40) 100%)";

/**
 * Variant 5 — Lesson Card. Cover image with eyebrow chip + centered play
 * affordance, then body with title and mono meta line.
 */
export function LessonCard({
  href,
  title,
  coverEyebrow,
  meta,
  coverBackground,
}: LessonCardProps) {
  return (
    <Link
      href={href}
      className="bg-white border border-[var(--abv-border)] rounded-[10px] flex flex-col gap-2.5 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-px hover:border-[var(--abv-border-strong)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all p-3.5"
    >
      <div
        className="aspect-[16/9] rounded-md relative overflow-hidden"
        style={{ background: coverBackground ?? DEFAULT_COVER_BG }}
      >
        {coverEyebrow && (
          <span className="absolute top-1.5 left-2 font-mono text-[9px] font-bold text-white px-[7px] py-[2px] rounded-full bg-black/45 uppercase tracking-[0.06em]">
            {coverEyebrow}
          </span>
        )}
        <span className="absolute bottom-1.5 right-2 text-white text-[11px] opacity-85">
          ▶
        </span>
      </div>
      <div className="text-[13.5px] font-semibold text-[var(--abv-text)] leading-[1.35]">
        {title}
      </div>
      {meta && (
        <div className="font-mono text-[10.5px] text-[var(--abv-text-dim)] tracking-[0.04em] flex gap-1.5 items-center mt-auto">
          {meta}
        </div>
      )}
    </Link>
  );
}
