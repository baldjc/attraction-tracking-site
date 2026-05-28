export type IdeaThemeKey =
  | "market"
  | "neighbourhood"
  | "contrarian"
  | "do-not"
  | "how-to"
  | "story";

export const IDEA_THEME_CLASSES: Record<
  IdeaThemeKey,
  { pill: string; dot: string }
> = {
  market: {
    pill: "bg-[var(--abv-azure-tint)] text-[#1E8FCC]",
    dot: "bg-[var(--abv-azure)]",
  },
  neighbourhood: {
    pill: "bg-[var(--abv-leads-tint)] text-[#C72533]",
    dot: "bg-[var(--abv-leads)]",
  },
  contrarian: {
    pill: "bg-[var(--abv-hire-tint)] text-[#6D3FD9]",
    dot: "bg-[var(--abv-hire)]",
  },
  "do-not": {
    pill: "bg-[var(--abv-crimson-tint)] text-[var(--abv-crimson)]",
    dot: "bg-[var(--abv-crimson)]",
  },
  "how-to": {
    pill: "bg-[var(--abv-scores-tint)] text-[#B45309]",
    dot: "bg-[var(--abv-scores)]",
  },
  story: {
    pill: "bg-[var(--abv-ai-tools-tint)] text-[#3D7B9F]",
    dot: "bg-[var(--abv-ai-tools)]",
  },
};

export type PipelineStatusKey = "ready" | "shooting" | "edited";

export const PIPELINE_STATUS_CLASSES: Record<
  PipelineStatusKey,
  { pill: string; dot: string }
> = {
  ready: {
    pill: "bg-[var(--abv-scores-tint)] text-[#B45309]",
    dot: "bg-[var(--abv-scores)]",
  },
  shooting: {
    pill: "bg-[var(--abv-leads-tint)] text-[#C72533]",
    dot: "bg-[var(--abv-leads)]",
  },
  edited: {
    pill: "bg-[var(--abv-azure-tint)] text-[#1E8FCC]",
    dot: "bg-[var(--abv-azure)]",
  },
};

export type MemberTierKey = "Foundations" | "Production" | "Growth" | "DWY";

/** Avatar circle background per tier. Uses the tier-tint backgrounds with
 *  the matching tier-pill text colour so the initials sit at WCAG-safe
 *  contrast on 15px display and harmonize with the tier pill in the same
 *  card. (Saturated mid-tone tier backgrounds with white initials measured
 *  below AA for the small text size.) */
export const MEMBER_TIER_AVATAR: Record<
  MemberTierKey,
  { bg: string; text: string }
> = {
  Foundations: { bg: "bg-[var(--abv-bg-warm)]", text: "text-[var(--abv-text)]" },
  Production: { bg: "bg-[var(--abv-azure-tint)]", text: "text-[#1E8FCC]" },
  Growth: { bg: "bg-[var(--abv-academy-tint)]", text: "text-[#047857]" },
  DWY: { bg: "bg-[var(--abv-hire-tint)]", text: "text-[#6D3FD9]" },
};

export const MEMBER_TIER_PILL: Record<MemberTierKey, string> = {
  Foundations:
    "bg-[var(--abv-bg-warm)] text-[var(--abv-text-muted)] border border-[var(--abv-border)]",
  Production: "bg-[var(--abv-azure-tint)] text-[#1E8FCC]",
  Growth: "bg-[var(--abv-academy-tint)] text-[#047857]",
  DWY: "bg-[var(--abv-hire-tint)] text-[var(--abv-hire)]",
};

export type AuditTier = "academy" | "amber" | "crimson" | "dim";

export const AUDIT_TIER_TEXT: Record<AuditTier, string> = {
  academy: "text-[var(--abv-academy)]",
  amber: "text-[var(--abv-scores)]",
  crimson: "text-[var(--abv-crimson)]",
  dim: "text-[var(--abv-text-dim)]",
};

/** Maps the in-codebase RotationSlotKey enum to the mockup's themeKey set.
 *  `should_you` collapses to the mockup's "how-to" colourway since both
 *  carry the same advice/instructional tone. Unknown slots fall back to
 *  the neutral "story" colourway so a future slot still renders. */
export function rotationSlotToThemeKey(
  slot: string | null | undefined,
): IdeaThemeKey {
  switch (slot) {
    case "market_update":
      return "market";
    case "neighbourhood_fact":
      return "neighbourhood";
    case "contrarian_take":
      return "contrarian";
    case "do_not":
      return "do-not";
    case "should_you":
      return "how-to";
    default:
      return "story";
  }
}
