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
 * Live control for the member's ACTIVE voice. The selector switches between the
 * built-in default register and the member's uploaded guide; the change persists
 * server-side and the Script Builder reads it on the next generation. This is the
 * ONLY interactive part of the panel — everything else is read-only display.
 */
export interface VoiceControl {
  mode: "default" | "custom";
  hasCustomGuide: boolean;
  busy?: boolean;
  manageHref: string;
  onSelect: (mode: "default" | "custom") => void;
}

/**
 * "What Jarvis knows about you" — popover surfacing the member's real
 * Voice / Avatar / Market context with an "Update my context" action. The Voice
 * row also carries a live Default/My-voice selector (the rest is read-only; the
 * orchestrator loads its own context server-side, so display can't drift the
 * generation loop).
 */
export default function ContextPanel({
  context,
  onClose,
  voiceControl,
}: {
  context: JarvisContext;
  onClose: () => void;
  voiceControl?: VoiceControl;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="What Jarvis knows about you"
        className="absolute right-0 top-full z-40 mt-2 flex max-h-[calc(100vh-7rem)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-abv-border bg-abv-card shadow-abv-lg"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-abv-border px-4 py-3">
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

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-4">
          {ROWS.map(({ key, label, icon: Icon }) => {
            const item = context[key];
            return (
              <div key={key} className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-500">
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
                          <span aria-hidden className="text-blue-500">
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
                  {key === "voice" && voiceControl ? (
                    <VoiceSelector control={voiceControl} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-abv-border px-4 py-3">
          <Link
            href={context.updateHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white transition hover:opacity-90"
          >
            Update my context
            <ArrowUpRightIcon className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </>
  );
}

/**
 * Default vs. custom voice toggle. The "My voice" option is only selectable when
 * a guide is on file; otherwise it links to the upload page instead. Switching is
 * persisted by the parent (optimistic), so the only local concern is layout.
 */
function VoiceSelector({ control }: { control: VoiceControl }) {
  const { mode, hasCustomGuide, busy, manageHref, onSelect } = control;
  const options: { value: "default" | "custom"; label: string }[] = [
    { value: "default", label: "Default" },
    { value: "custom", label: "My voice" },
  ];
  return (
    <div className="mt-2">
      <div
        role="group"
        aria-label="Active voice"
        className="inline-flex rounded-lg border border-abv-border bg-abv-bg p-0.5"
      >
        {options.map(({ value, label }) => {
          const active = mode === value && (value === "default" || hasCustomGuide);
          // "My voice" is only selectable once a substantive guide is on file;
          // until then it's disabled (the upload link below is the way in).
          const unavailable = value === "custom" && !hasCustomGuide;
          return (
            <button
              key={value}
              type="button"
              disabled={busy || unavailable}
              aria-pressed={active}
              title={unavailable ? "Upload a voice doc to use your own voice" : undefined}
              onClick={() => onSelect(value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "bg-blue-500 text-white"
                  : "text-abv-text-secondary hover:text-abv-text"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {!hasCustomGuide ? (
        <Link
          href={manageHref}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-blue-500 hover:underline"
        >
          Upload your voice doc
          <ArrowUpRightIcon className="h-3 w-3" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
