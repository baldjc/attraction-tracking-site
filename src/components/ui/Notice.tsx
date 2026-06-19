import type { ReactNode } from "react";

export type NoticeVariant = "info" | "warning" | "error" | "success";

/**
 * One shared notice / banner used app-wide. Replaces the ad-hoc amber/yellow
 * alert boxes with the brand's soft-tint severity system: tinted background,
 * darker on-tint text, 8px radius, a hairline border, ink heading + muted body.
 *
 * Severity:
 *   - info     → calm neutral/brand tint. Nudges & informational banners (most).
 *   - warning  → soft amber. Genuine cautions only.
 *   - error    → soft red. Failures.
 *   - success  → soft green. Confirmations.
 *
 * Keep CTAs as the ink pill — pass them via `action` (caller owns the href/logic).
 * Styling lives here so every future notice inherits the brand automatically.
 */
const VARIANT_STYLE: Record<
  NoticeVariant,
  { bg: string; heading: string; body: string }
> = {
  info: {
    bg: "var(--abv-notice-info-bg)",
    heading: "var(--abv-notice-info-heading)",
    body: "var(--abv-notice-info-text)",
  },
  warning: {
    bg: "var(--abv-notice-warning-bg)",
    heading: "var(--abv-notice-warning-text)",
    body: "var(--abv-notice-warning-text)",
  },
  error: {
    bg: "var(--abv-notice-error-bg)",
    heading: "var(--abv-notice-error-text)",
    body: "var(--abv-notice-error-text)",
  },
  success: {
    bg: "var(--abv-notice-success-bg)",
    heading: "var(--abv-notice-success-text)",
    body: "var(--abv-notice-success-text)",
  },
};

/** Shared ink-pill CTA class, so notice CTAs look identical everywhere. */
export const NOTICE_PILL_CLASS =
  "inline-flex items-center justify-center rounded-full bg-[var(--abv-ink)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 dark:bg-white dark:text-[var(--abv-dark)]";

interface NoticeProps {
  variant?: NoticeVariant;
  /** Bold heading line. Optional — a notice can be body-only. */
  title?: ReactNode;
  /** Body / supporting copy. */
  children?: ReactNode;
  /** Optional leading icon/emoji. */
  icon?: ReactNode;
  /** Trailing CTA region (e.g. an ink-pill Link). Caller owns the action. */
  action?: ReactNode;
  /** Renders a dismiss × when provided. */
  onDismiss?: () => void;
  /** Extra classes for the outer container (margins, etc.). */
  className?: string;
}

export default function Notice({
  variant = "info",
  title,
  children,
  icon,
  action,
  onDismiss,
  className = "",
}: NoticeProps) {
  const v = VARIANT_STYLE[variant];

  return (
    <div
      className={[
        "flex gap-3 rounded-[8px] border border-[var(--abv-border)] px-5 py-4",
        action ? "flex-col sm:flex-row sm:items-center sm:justify-between" : "items-start",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ backgroundColor: v.bg }}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="shrink-0 leading-none" style={{ color: v.heading }} aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {title && (
            <p className="text-sm font-semibold" style={{ color: v.heading }}>
              {title}
            </p>
          )}
          {children && (
            <div
              className={["text-sm", title ? "mt-0.5" : ""].filter(Boolean).join(" ")}
              style={{ color: v.body }}
            >
              {children}
            </div>
          )}
        </div>
      </div>

      {(action || onDismiss) && (
        <div className="flex shrink-0 items-center gap-3">
          {action}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="shrink-0 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100"
              style={{ color: v.heading }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
