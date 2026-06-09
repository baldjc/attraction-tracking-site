"use client";

import Link from "next/link";
import {
  MicrophoneIcon,
  UserCircleIcon,
  MapPinIcon,
  XMarkIcon,
  ArrowUpRightIcon,
} from "@heroicons/react/24/outline";
import type { JarvisContext } from "@/components/jarvis/JarvisChat";

const ROWS = [
  { key: "voice", label: "Voice", icon: MicrophoneIcon },
  { key: "avatar", label: "Avatar", icon: UserCircleIcon },
  { key: "market", label: "Market", icon: MapPinIcon },
] as const;

/**
 * "What Jarvis knows about you" — read-only popover surfacing the member's real
 * Voice / Avatar / Market context with an "Update my context" action. Purely
 * presentational: it never mutates anything and the orchestrator loads its own
 * context server-side, so this can't drift the generation loop.
 */
export default function ContextPanel({
  context,
  onClose,
}: {
  context: JarvisContext;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="What Jarvis knows about you"
        className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-abv-border bg-abv-card shadow-abv-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-abv-border px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-abv-text">
              What Jarvis knows about you
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-abv-text-secondary">
              The context behind every draft.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-abv-text-secondary transition hover:bg-abv-bg hover:text-abv-text"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-4 py-4">
          {ROWS.map(({ key, label, icon: Icon }) => {
            const item = context[key];
            return (
              <div key={key} className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-abv-ai-tools/10 text-abv-ai-tools">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-abv-text-secondary">
                    {label}
                  </p>
                  <p className="text-sm font-medium text-abv-text">{item.label}</p>
                  {item.bullets && item.bullets.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1">
                      {item.bullets.map((b, i) => (
                        <li
                          key={i}
                          className="flex gap-1.5 text-xs leading-relaxed text-abv-text-secondary"
                        >
                          <span aria-hidden className="text-abv-ai-tools">
                            •
                          </span>
                          <span className="min-w-0">{b}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-0.5 text-xs leading-relaxed text-abv-text-secondary">
                      {item.detail}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-abv-border px-4 py-3">
          <Link
            href={context.updateHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-abv-ai-tools px-3 py-2 text-xs font-medium text-white transition hover:opacity-90"
          >
            Update my context
            <ArrowUpRightIcon className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </>
  );
}
