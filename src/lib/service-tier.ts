/**
 * Canonical service-tier definitions — the single source of truth.
 *
 * There are exactly FOUR tiers. Canonical values are snake_case lowercase to
 * match the existing Prisma enum / DB convention (e.g. `done_with_you`, not
 * camelCase `doneWithYou`). Human-readable names live in TIER_LABELS.
 *
 * The legacy enum was more granular (`editing_2`, `editing_4`, `mastery_2`,
 * `mastery_4`) encoding both the tier AND the edited-videos-per-month count.
 * The count is now a separate `User.editedVideosPerMonth` field; tier-gating
 * logic reads ONLY the 4-value enum below, never the count.
 */
export const SERVICE_TIERS = [
  "foundations",
  "production",
  "growth",
  "done_with_you",
] as const;

export type ServiceTier = (typeof SERVICE_TIERS)[number];

export const TIER_LABELS: Record<ServiceTier, string> = {
  foundations: "Foundations",
  production: "Production",
  growth: "Growth",
  done_with_you: "Done With You",
};

export function isServiceTier(value: unknown): value is ServiceTier {
  return (
    typeof value === "string" &&
    (SERVICE_TIERS as readonly string[]).includes(value)
  );
}

export function tierLabel(tier: string | null | undefined): string {
  return isServiceTier(tier) ? TIER_LABELS[tier] : (tier ?? "—");
}

/**
 * Map any legacy / display tier string to its canonical equivalent.
 * Returns null for unknown or genuinely ambiguous input (caller decides what
 * to do — e.g. surface for human review rather than auto-mapping).
 */
export function normalizeLegacyTier(input: string): ServiceTier | null {
  const n = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (n) {
    case "foundations":
      return "foundations";
    case "editing_2":
    case "editing_4":
    case "production":
      return "production";
    case "mastery_2":
    case "mastery_4":
    case "growth":
      return "growth";
    case "done_with_you":
    case "donewithyou":
    case "dwy":
      return "done_with_you";
    default:
      return null;
  }
}

/**
 * Extract the edited-videos-per-month count embedded in a legacy granular tier
 * value (`editing_2`/`mastery_2` → 2, `editing_4`/`mastery_4` → 4). Returns
 * null when the legacy value carried no count (foundations, done_with_you).
 */
export function legacyTierVideoCount(input: string): number | null {
  const n = input.trim().toLowerCase();
  if (n === "editing_2" || n === "mastery_2") return 2;
  if (n === "editing_4" || n === "mastery_4") return 4;
  return null;
}

// ── Per-tier configuration: monthly Anthropic caps + backfill windows ────────

export interface TierConfig {
  /** Hard monthly Anthropic spend cap (USD). Blocks further AI work when hit. */
  monthlyCapUsd: number;
  /** Soft-warning threshold (USD). Fires a non-blocking warning. */
  softWarningUsd: number;
  /** Market-data backfill window in months (current + N-1 prior). */
  backfillMonths: number;
}

export const TIER_CONFIG: Record<ServiceTier, TierConfig> = {
  foundations: { monthlyCapUsd: 25, softWarningUsd: 20, backfillMonths: 13 },
  production: { monthlyCapUsd: 25, softWarningUsd: 20, backfillMonths: 25 },
  growth: { monthlyCapUsd: 100, softWarningUsd: 80, backfillMonths: 25 },
  done_with_you: { monthlyCapUsd: 100, softWarningUsd: 80, backfillMonths: 25 },
};

export function tierMonthlyCapUsd(tier: ServiceTier): number {
  return TIER_CONFIG[tier].monthlyCapUsd;
}

export function tierSoftWarningUsd(tier: ServiceTier): number {
  return TIER_CONFIG[tier].softWarningUsd;
}

export function tierBackfillMonths(tier: ServiceTier): number {
  return TIER_CONFIG[tier].backfillMonths;
}

// ── AI usage cap bypass ──────────────────────────────────────────────────────
//
// THE single, adjustable source of truth for "which service tier is exempt from
// the monthly AI usage/cost cap" (treated as unlimited — no hard block, no soft
// warning). Done-With-You is high-touch: the team runs AI generations on the
// member's behalf, so a monthly spend cap must never interrupt them.
//
// Both AI-cap enforcement engines consult `tierBypassesAiCap()` BEFORE blocking:
//   • v2 `getCostCapStatus()`  — Jarvis, Script Builder v2, Content Engine v2,
//     idea validation, market-data, knowledge-base, planner wizard, etc.
//   • v1 `getMonthlyUsage()` / `checkCostCap()` — legacy AI tools
//     (description / theme / listing-video / ARC script builders).
// To uncap another tier, add it to this list — nothing else changes.
export const AI_CAP_BYPASS_TIERS: readonly ServiceTier[] = ["done_with_you"];

export function tierBypassesAiCap(tier: string | null | undefined): boolean {
  return isServiceTier(tier) && AI_CAP_BYPASS_TIERS.includes(tier);
}

// ── Feature gating matrix ────────────────────────────────────────────────────

export const TIER_FEATURES = [
  "content_planner",
  "drive_folder",
  "client_hub",
  "data_search_layer2",
  "thumbnail_comparison",
  "story_lead_generation",
  "idea_card_generation",
  "methodology_settings",
  "auto_enrichment",
  "on_demand_revalidation",
  "team_member_access",
  "academy",
  "generate_leads",
  "hire_a_human",
] as const;

export type TierFeature = (typeof TIER_FEATURES)[number];

const ALL_TIERS: ServiceTier[] = [...SERVICE_TIERS];
const PAID_TIERS: ServiceTier[] = ["production", "growth", "done_with_you"];

/**
 * Which tiers are allowed each feature. Only `drive_folder` and `client_hub`
 * exclude Foundations; everything else is all-tiers. Note: the Client Hub
 * sidebar LINK is still shown to Foundations — they land on an upgrade page —
 * but server endpoints enforce this allowlist (403 tier_restricted).
 */
export const FEATURE_TIER_MATRIX: Record<TierFeature, ServiceTier[]> = {
  content_planner: ALL_TIERS,
  drive_folder: PAID_TIERS,
  client_hub: PAID_TIERS,
  data_search_layer2: ALL_TIERS,
  thumbnail_comparison: ALL_TIERS,
  story_lead_generation: ALL_TIERS,
  idea_card_generation: ALL_TIERS,
  methodology_settings: ALL_TIERS,
  auto_enrichment: ALL_TIERS,
  on_demand_revalidation: ALL_TIERS,
  team_member_access: ALL_TIERS,
  academy: ALL_TIERS,
  generate_leads: ALL_TIERS,
  hire_a_human: ALL_TIERS,
};

export function tierAllowsFeature(
  tier: string | null | undefined,
  feature: TierFeature,
): boolean {
  return isServiceTier(tier) && FEATURE_TIER_MATRIX[feature].includes(tier);
}

/** Drive folder card (in the Content Editor) — hidden for Foundations. */
export function hasDriveFolderAccess(tier: string | null | undefined): boolean {
  return tierAllowsFeature(tier, "drive_folder");
}

/** Full Client Hub access — Foundations gets the upgrade page instead. */
export function hasClientHubAccess(tier: string | null | undefined): boolean {
  return tierAllowsFeature(tier, "client_hub");
}
