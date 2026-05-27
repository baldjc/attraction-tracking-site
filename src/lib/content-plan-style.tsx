import type { CSSProperties, SVGProps } from "react";

/**
 * Content Planner colour grammar — mockup `content-planner-mockup_*.html`.
 * Maps both the GROWTH_DWY vocabulary (Future Idea → Live on YT) and the
 * FOUNDATIONS vocabulary (Idea → Published) onto the same nine-step palette
 * so a foundations member sees the same colour story as a growth member.
 *
 * grey (idea) → sky (not started) → purple (research) → amber (ready/post)
 *   → crimson (shooting) → azure (edited/scheduled) → emerald (live)
 */

type StatusKey =
  | "future" | "notstart" | "research" | "ready"
  | "shooting" | "post" | "edited" | "scheduled" | "live";

const STATUS_KEY: Record<string, StatusKey> = {
  "Future Idea":     "future",
  "Idea":            "future",
  "Not Started":     "notstart",
  "Scripted":        "notstart",
  "Needs Research":  "research",
  "Ready to Shoot":  "ready",
  "Shooting":        "shooting",
  "Filmed":          "shooting",
  "Shot - In Post":  "post",
  "Editing":         "post",
  "Edited":          "edited",
  "Scheduled":       "scheduled",
  "Scheduled on YT": "scheduled",
  "Live on YT":      "live",
  "Published":       "live",
};

const STATUS_DOT_VAR: Record<StatusKey, string> = {
  future:    "var(--abv-text-dim)",
  notstart:  "var(--abv-ai-tools)",
  research:  "var(--abv-hire)",
  ready:     "var(--abv-scores)",
  shooting:  "var(--abv-leads)",
  post:      "var(--abv-scores)",
  edited:    "var(--abv-azure)",
  scheduled: "var(--abv-azure)",
  live:      "var(--abv-academy)",
};

const STATUS_PILL_BG: Record<StatusKey, string> = {
  future:    "rgba(155,155,155,0.10)",
  notstart:  "var(--abv-ai-tools-tint)",
  research:  "var(--abv-hire-tint)",
  ready:     "var(--abv-scores-tint)",
  shooting:  "var(--abv-leads-tint)",
  post:      "var(--abv-scores-tint)",
  edited:    "var(--abv-azure-tint)",
  scheduled: "var(--abv-azure-tint-strong)",
  live:      "var(--abv-academy-tint)",
};

const STATUS_PILL_FG: Record<StatusKey, string> = {
  future:    "var(--abv-text-muted)",
  notstart:  "#3D7B9F",
  research:  "#6D3FD9",
  ready:     "#B45309",
  shooting:  "#C72533",
  post:      "#B45309",
  edited:    "#1E8FCC",
  scheduled: "#0E78B8",
  live:      "#047857",
};

export function getStatusDotColor(status: string): string {
  const k = STATUS_KEY[status] ?? "future";
  return STATUS_DOT_VAR[k];
}

export function getStatusPillStyle(status: string): { bg: string; fg: string; dot: string } {
  const k = STATUS_KEY[status] ?? "future";
  return { bg: STATUS_PILL_BG[k], fg: STATUS_PILL_FG[k], dot: STATUS_DOT_VAR[k] };
}

/* ---------------- Theme pills ---------------- */

export type ThemeVisual = {
  bg: string;
  fg: string;
  Icon: (p: SVGProps<SVGSVGElement>) => React.JSX.Element;
};

const baseSvg: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const SproutIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...baseSvg} {...p}>
    <path d="M12 3c-2 4 1 5 1 8a4 4 0 11-8 0c0-2 1-3 2-4 0 2 2 2 2 0 0-3 1-4 3-4zM17 8c2 2 3 4 3 7a4 4 0 11-8 0c0-2 2-4 3-4 0 2 2 1 2-3z" />
  </svg>
);
const BarsIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...baseSvg} {...p}>
    <path d="M3 21h18M5 21V10m4 11V13m4 8V7m4 14v-5m4 5V4" />
  </svg>
);
const HouseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...baseSvg} {...p}>
    <path d="M3 11l9-8 9 8v9a2 2 0 01-2 2h-4v-7H10v7H6a2 2 0 01-2-2z" />
  </svg>
);
const ArrowsIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...baseSvg} {...p}>
    <path d="M3 12h18M3 6l5 6-5 6M21 6l-5 6 5 6" />
  </svg>
);
const PathIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...baseSvg} {...p}>
    <path d="M12 22V12m0 0L4 7m8 5l8-5M4 7v10l8 5m0-15L4 7" />
  </svg>
);
const LinesIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...baseSvg} {...p}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);
const DotIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...baseSvg} {...p}>
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const NEUTRAL: ThemeVisual = {
  bg: "var(--abv-bg-warm)",
  fg: "var(--abv-text-muted)",
  Icon: DotIcon,
};

export function getThemeVisual(theme: string | null | undefined): ThemeVisual {
  if (!theme) return NEUTRAL;
  const t = theme.toLowerCase();
  if (t.includes("neighbour") || t.includes("neighbor"))
    return { bg: "var(--abv-leads-tint)", fg: "#C72533", Icon: SproutIcon };
  if (t.includes("market"))
    return { bg: "var(--abv-azure-tint)", fg: "#1E8FCC", Icon: BarsIcon };
  if (t.includes("listing") || t.includes("teardown"))
    return { bg: "var(--abv-academy-tint)", fg: "#047857", Icon: HouseIcon };
  if (t.includes("contrarian"))
    return { bg: "var(--abv-hire-tint)", fg: "#6D3FD9", Icon: ArrowsIcon };
  if (t.includes("how-to") || t.includes("howto") || t.includes("how to") || t.includes("buyer"))
    return { bg: "var(--abv-scores-tint)", fg: "#B45309", Icon: PathIcon };
  if (t.includes("story"))
    return { bg: "var(--abv-ai-tools-tint)", fg: "#3D7B9F", Icon: LinesIcon };
  return NEUTRAL;
}

/* ---------------- Inline-style helpers (so consumers don't redeclare) ---------------- */

export function statusPillStyle(status: string): CSSProperties {
  const s = getStatusPillStyle(status);
  return { backgroundColor: s.bg, color: s.fg };
}

export function themePillStyle(theme: string | null | undefined): CSSProperties {
  const v = getThemeVisual(theme);
  return { backgroundColor: v.bg, color: v.fg };
}
