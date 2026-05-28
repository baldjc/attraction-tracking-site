"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export interface ToolCardProps {
  href: string;
  name: string;
  /** Short tagline rendered under the name. */
  tag: string;
  icon: ReactNode;
  /** Optional last-activity hint shown bottom-left. Hidden when null. */
  activity?: string | null;
  /** Used to keep the bottom row layout consistent while the activity
   *  summary is still loading — renders an invisible placeholder. */
  loading?: boolean;
  /** When the tool grid has an odd count, the last card stretches
   *  centered. Existing AIToolsHub computes this and passes it in. */
  orphan?: boolean;
}

/**
 * Variant 3 — Tool Card. Canonical implementation already shipping on the
 * AI Tools hub. Extracted into the shared module so other surfaces
 * (notifications, hub embeds) can reuse it.
 */
export function ToolCard({
  href,
  name,
  tag,
  icon,
  activity,
  loading,
  orphan,
}: ToolCardProps) {
  return (
    <Link
      href={href}
      className={[
        "bg-white border border-[var(--abv-border)] rounded-[14px] p-[22px] flex gap-[18px] items-start shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        "hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-[var(--abv-border-strong)] hover:-translate-y-px transition-all",
        orphan
          ? "sm:col-span-2 sm:max-w-[calc(50%-7px)] sm:justify-self-center w-full"
          : "",
      ].join(" ")}
    >
      <span className="w-16 h-16 flex-shrink-0 rounded-[14px] bg-[var(--abv-ai-tools-tint)] text-[var(--abv-ai-tools)] inline-flex items-center justify-center">
        {icon}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="font-display text-[20px] font-extrabold tracking-[-0.02em] text-[var(--abv-text)] leading-[1.2]">
          {name}
        </div>
        <div className="text-sm text-[var(--abv-text-muted)] leading-[1.45]">
          {tag}
        </div>
        <div className="flex items-center justify-between gap-3 mt-2.5 pt-3 border-t border-[var(--abv-border)]">
          {activity ? (
            <span className="font-mono text-[10.5px] text-[var(--abv-text-dim)] tracking-[0.04em] inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--abv-academy)]" />
              {activity}
            </span>
          ) : (
            <span className="font-mono text-[10.5px] text-[var(--abv-text-dim)] tracking-[0.04em] opacity-0">
              {loading ? "Loading…" : "·"}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-4 py-[7px] bg-transparent text-[var(--abv-text)] border-[1.5px] border-[var(--abv-ink)] rounded-full text-[11px] font-semibold uppercase tracking-[0.04em] hover:bg-[var(--abv-ink)] hover:text-white transition-colors">
            Open →
          </span>
        </div>
      </div>
    </Link>
  );
}
