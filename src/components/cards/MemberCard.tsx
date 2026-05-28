"use client";

import {
  MEMBER_TIER_AVATAR,
  MEMBER_TIER_PILL,
  type MemberTierKey,
} from "./types";

export interface MemberStatusRow {
  label: string;
  /** When `true`, renders the green check; when `false`, the dim dash. */
  on: boolean;
}

export interface MemberActionButton {
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Disable while a network request is in-flight. */
  disabled?: boolean;
}

export interface MemberCardProps {
  name: string;
  email: string;
  initials: string;
  tier: MemberTierKey;
  statusRows?: MemberStatusRow[];
  actions?: MemberActionButton[];
}

/**
 * Variant 4 — Member Card. Used in the admin beta-cohort grid. Tier-coloured
 * initial avatar, tier pill aligned to the top-right, an optional status
 * column with green checks / dim dashes, and a flexible action row.
 */
export function MemberCard({
  name,
  email,
  initials,
  tier,
  statusRows,
  actions,
}: MemberCardProps) {
  const avatar = MEMBER_TIER_AVATAR[tier] ?? MEMBER_TIER_AVATAR.Foundations;
  const pill = MEMBER_TIER_PILL[tier] ?? MEMBER_TIER_PILL.Foundations;
  return (
    <article className="flex flex-col gap-3 rounded-[12px] border border-[var(--abv-border)] bg-white p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-[var(--abv-border-strong)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <header className="flex items-start gap-3">
        <span
          className={`shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full font-display font-extrabold text-[15px] tracking-[-0.02em] ${avatar.bg} ${avatar.text}`}
        >
          {initials || "?"}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className="font-display text-[16px] font-extrabold tracking-[-0.015em] leading-[1.2] text-[var(--abv-text)] truncate"
            title={name}
          >
            {name}
          </div>
          <div
            className="font-mono text-[11px] text-[var(--abv-text-muted)] mt-0.5 truncate"
            title={email}
          >
            {email}
          </div>
        </div>
        <span
          className={`shrink-0 self-start inline-flex items-center gap-1 px-2 py-[3px] rounded-full font-mono text-[9px] font-bold tracking-[0.08em] uppercase ${pill}`}
        >
          {tier}
        </span>
      </header>

      {statusRows && statusRows.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-2.5 border-t border-[var(--abv-border)]">
          {statusRows.map((row, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-xs ${
                row.on
                  ? "text-[var(--abv-text)]"
                  : "text-[var(--abv-text-muted)]"
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold ${
                  row.on
                    ? "bg-[var(--abv-academy)] text-white"
                    : "bg-[var(--abv-bg-warm)] text-[var(--abv-text-dim)] border border-[var(--abv-border)]"
                }`}
              >
                {row.on ? "✓" : "—"}
              </span>
              {row.label}
            </div>
          ))}
        </div>
      )}

      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              className={`px-[11px] py-[5px] rounded-full bg-white border text-[10.5px] font-semibold tracking-[0.02em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                a.danger
                  ? "border-[var(--abv-border-strong)] text-[var(--abv-text)] hover:border-[var(--abv-crimson)] hover:text-[var(--abv-crimson)]"
                  : "border-[var(--abv-border-strong)] text-[var(--abv-text)] hover:border-[var(--abv-ink)]"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
