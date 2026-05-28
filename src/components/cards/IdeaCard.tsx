"use client";

import { IDEA_THEME_CLASSES, type IdeaThemeKey } from "./types";

export interface IntentChip {
  label: string;
  primary?: boolean;
}

export interface IdeaCardProps {
  title: string;
  themeKey: IdeaThemeKey;
  themeLabel: string;
  premise: string;
  clarityPremise: string;
  visualPeak: string;
  /** Hook chips — capped at 3 per the mockup spec. */
  hookChips: string[];
  /** Single frame chip per the mockup spec. */
  frameChip?: string | null;
  /** Intent chips — first is rendered as `primary` (azure-fill) per spec. */
  intentChips: IntentChip[];
  /** Avatar chips — rendered as neutral warm pills. */
  avatarChips: string[];
  citedFactCount: number;
  /** Tail of the source line (after "N cited facts ·"). */
  justification?: string | null;
  /** "Pick this idea" click handler. */
  onPick: () => void;
  pickLabel?: string;
}

/**
 * Variant 1 — Idea Card. Mirrors `cards-and-thinking-mockup.html` .idea
 * exactly (1px lift on hover, shadow-md, border darken, ink-fill pick
 * button with #2a2a2a hover and 0.98 press scale).
 */
export function IdeaCard({
  title,
  themeKey,
  themeLabel,
  premise,
  clarityPremise,
  visualPeak,
  hookChips,
  frameChip,
  intentChips,
  avatarChips,
  citedFactCount,
  justification,
  onPick,
  pickLabel = "Pick this idea →",
}: IdeaCardProps) {
  const theme = IDEA_THEME_CLASSES[themeKey];
  const hooks = hookChips.slice(0, 3);
  return (
    <article className="flex flex-col gap-3.5 rounded-[12px] border border-[var(--abv-border)] bg-white p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-[var(--abv-border-strong)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <header className="flex items-start justify-between gap-2.5">
        <h3 className="flex-1 min-w-0 font-display text-[20px] font-bold tracking-[-0.02em] leading-[1.2] text-[var(--abv-text)]">
          {title}
        </h3>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 px-[9px] py-[3px] rounded-full font-mono text-[9px] font-bold tracking-[0.08em] uppercase ${theme.pill}`}
        >
          <span className={`w-[5px] h-[5px] rounded-full ${theme.dot}`} />
          {themeLabel}
        </span>
      </header>

      <p className="m-0 text-sm italic leading-[1.45] text-[var(--abv-text-muted)]">
        {premise}
      </p>

      <Block label="Clarity premise" body={clarityPremise} />
      <Block label="Visual peak" body={visualPeak} />

      {hooks.length > 0 && (
        <ChipRow label="Hook">
          {hooks.map((c, i) => (
            <Chip key={i} tone="hook">
              {c}
            </Chip>
          ))}
        </ChipRow>
      )}
      {frameChip && (
        <ChipRow label="Frame">
          <Chip tone="frame">{frameChip}</Chip>
        </ChipRow>
      )}
      {intentChips.length > 0 && (
        <ChipRow label="Intent">
          {intentChips.map((c, i) => (
            <Chip key={i} tone="intent" primary={c.primary || i === 0}>
              {c.label}
            </Chip>
          ))}
        </ChipRow>
      )}
      {avatarChips.length > 0 && (
        <ChipRow label="Avatar">
          {avatarChips.map((c, i) => (
            <Chip key={i} tone="avatar">
              {c}
            </Chip>
          ))}
        </ChipRow>
      )}

      <footer className="mt-auto flex items-center justify-between gap-3 pt-3.5 border-t border-[var(--abv-border)]">
        <span className="flex-1 min-w-0 font-mono text-[10px] tracking-[0.04em] text-[var(--abv-text-dim)] leading-snug">
          <span className="font-semibold text-[var(--abv-text)]">
            {citedFactCount} cited fact{citedFactCount === 1 ? "" : "s"}
          </span>
          {justification ? ` · ${justification}` : null}
        </span>
        <button
          type="button"
          onClick={onPick}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--abv-ink)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2a2a2a] active:scale-[0.98]"
        >
          {pickLabel}
        </button>
      </footer>
    </article>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[9px] font-bold tracking-[0.10em] uppercase text-[var(--abv-text-dim)]">
        {label}
      </span>
      <p className="m-0 text-[13px] leading-[1.5] text-[var(--abv-text)]">
        {body}
      </p>
    </div>
  );
}

function ChipRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="shrink-0 font-mono text-[9px] font-bold tracking-[0.10em] uppercase text-[var(--abv-text-dim)]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  tone,
  primary,
  children,
}: {
  tone: "hook" | "frame" | "intent" | "avatar";
  primary?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    tone === "hook"
      ? "bg-[var(--abv-scores-tint)] text-[#B45309]"
      : tone === "frame"
        ? "bg-[var(--abv-academy-tint)] text-[#047857]"
        : tone === "intent"
          ? primary
            ? "bg-[var(--abv-azure)] text-[var(--abv-ink)] font-bold"
            : "bg-[var(--abv-azure-tint)] text-[#1E8FCC]"
          : "bg-[var(--abv-bg-warm)] text-[var(--abv-text-muted)] border border-[var(--abv-border)]";
  return (
    <span
      className={`inline-flex items-center rounded-full px-[9px] py-[3px] text-[11px] font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}
