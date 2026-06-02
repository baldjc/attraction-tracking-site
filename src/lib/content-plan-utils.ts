import { TIER_LABELS as CANONICAL_TIER_LABELS } from "@/lib/service-tier";

export const FOUNDATIONS_PRODUCTION_TIERS = ["foundations", "production"];
export const GROWTH_DWY_TIERS = ["growth", "done_with_you"];
export const PRODUCTION_TIERS = ["production", "growth", "done_with_you"];

export const TIER_LABELS: Record<string, string> = { ...CANONICAL_TIER_LABELS };

export function formatTierLabel(tier: string): string {
  return TIER_LABELS[tier] ?? tier;
}

/**
 * Tier badge colors. Mirrors the palette used on the admin member detail page
 * so every surface that shows a tier reads the same.
 */
export type PlanSortKey =
  | "default"
  | "publish-asc"
  | "publish-desc"
  | "shoot-asc"
  | "shoot-desc";

function dateValue(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Sort plans by shoot or publish date. Plans missing the chosen date sink to
 * the bottom regardless of direction so empty cards never crowd the top.
 */
export function sortPlansByDate<T extends { shootDate?: string | Date | null; publishDate?: string | Date | null }>(
  plans: T[],
  sortBy: PlanSortKey
): T[] {
  if (sortBy === "default") return plans;
  const [field, dir] = sortBy.split("-") as ["publish" | "shoot", "asc" | "desc"];
  const key = field === "publish" ? "publishDate" : "shootDate";
  const sign = dir === "asc" ? 1 : -1;
  return [...plans].sort((a, b) => {
    const av = dateValue(a[key] as string | Date | null | undefined);
    const bv = dateValue(b[key] as string | Date | null | undefined);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * sign;
  });
}

/**
 * Notion-style tier badge. Sharper pastel background with a darker, more
 * saturated text colour and a 4px square radius rather than a full pill, so
 * tags read at a glance without dominating the row.
 */
export function tierBadgeClasses(tier: string | null | undefined): string {
  if (tier === "foundations") return "bg-[#D3E5EF] text-[#183347]";
  if (tier === "production") return "bg-[#FDECC8] text-[#7A5A1F]";
  if (tier === "growth") return "bg-[#E8DEEE] text-[#4F326C]";
  if (tier === "done_with_you") return "bg-[#FADEC9] text-[#854C1D]";
  return "bg-[#E3E2E0] text-[#3F3D38]";
}

export const FOUNDATIONS_STATUSES = [
  "Idea",
  "Scripted",
  "Ready to Shoot",
  "Filmed",
  "Editing",
  "Scheduled",
  "Published",
];

export const GROWTH_DWY_STATUSES = [
  "Future Idea",
  "Not Started",
  "Needs Research",
  "Ready to Shoot",
  "Shooting",
  "Shot - In Post",
  "Edited",
  "Scheduled on YT",
  "Live on YT",
];

export function getStatusOptions(serviceTier: string): string[] {
  return GROWTH_DWY_TIERS.includes(serviceTier)
    ? GROWTH_DWY_STATUSES
    : FOUNDATIONS_STATUSES;
}

export function isValidStatus(status: string, serviceTier: string): boolean {
  return getStatusOptions(serviceTier).includes(status);
}

export function hasEditDueDate(serviceTier: string): boolean {
  return GROWTH_DWY_TIERS.includes(serviceTier);
}

export function hasDriveFolder(serviceTier: string): boolean {
  return PRODUCTION_TIERS.includes(serviceTier);
}

/**
 * Shared search + status filter applied across every planner view so that
 * "Sprint 7" filters feel global. Case-insensitive match across title/theme/
 * notes/script/thumbnailWords/researchNotes. Empty `statusFilter` = all
 * statuses. Empty `query` = no text filter.
 */
export function filterPlans<T extends {
  title?: string | null;
  theme?: string | null;
  notes?: string | null;
  script?: string | null;
  researchNotes?: string | null;
  thumbnailWords?: string | null;
  status: string;
}>(plans: T[], query: string, statusFilter: string[]): T[] {
  const q = (query ?? "").trim().toLowerCase();
  const hasQuery = q.length > 0;
  const hasStatus = statusFilter && statusFilter.length > 0;
  if (!hasQuery && !hasStatus) return plans;
  return plans.filter((p) => {
    if (hasStatus && !statusFilter.includes(p.status)) return false;
    if (!hasQuery) return true;
    const haystack = [p.title, p.theme, p.notes, p.script, p.researchNotes, p.thumbnailWords]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export const PRE_PRODUCTION_STATUSES = [
  "Idea",
  "Future Idea",
  "Not Started",
  "Needs Research",
  "Scripted",
];

/**
 * Notion-inspired status palette. Pastel backgrounds + darker, saturated text
 * so tags pop against the table without screaming. Used everywhere the
 * planner shows a status chip (table, board, pipeline, calendar, client-hub).
 *
 * Pair these values with `rounded` (4px) — never `rounded-full` — to keep the
 * Notion-style square chip look.
 */
export const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  "Idea":              { bg: "#E3E2E0", text: "#3F3D38" },
  "Future Idea":       { bg: "#E3E2E0", text: "#3F3D38" },
  "Scripted":          { bg: "#D3E5EF", text: "#183347" },
  "Not Started":       { bg: "#D3E5EF", text: "#183347" },
  "Needs Research":    { bg: "#FFE2DD", text: "#7A2E29" },
  "Ready to Shoot":    { bg: "#E8DEEE", text: "#492F64" },
  "Filmed":            { bg: "#F5E0E9", text: "#6D2A4D" },
  "Shooting":          { bg: "#F5E0E9", text: "#6D2A4D" },
  "Editing":           { bg: "#FDECC8", text: "#7A5A1F" },
  "Shot - In Post":    { bg: "#FDECC8", text: "#7A5A1F" },
  "Edited":            { bg: "#DBEDDB", text: "#2B593F" },
  "Scheduled":         { bg: "#FADEC9", text: "#854C1D" },
  "Scheduled on YT":   { bg: "#FADEC9", text: "#854C1D" },
  "Published":         { bg: "#DBEDDB", text: "#2B593F" },
  "Live on YT":        { bg: "#DBEDDB", text: "#2B593F" },
};

export const PRIORITY_OPTIONS = ["High", "Medium", "Low"];

/**
 * Resolve the single image a plan should show as its "the" thumbnail across the
 * planner (table title cell + editor hero). A plan has up to two thumbnail
 * sources:
 *   1. `thumbnailFileId` — a Drive file the production/drive member explicitly
 *      picked, streamed through the `/thumbnail` proxy.
 *   2. `thumbnailVariants` + `thumbnailWinnerId` — A/B options uploaded in the
 *      Publish tab (to Drive for production members, to Object Storage for
 *      foundations members), streamed through `/thumbnails/<variantId>`.
 *
 * Preference order: an explicitly-picked Drive thumbnail, then the A/B winner,
 * then the first uploaded option. Returns the same-origin image URL (cache-
 * busted by `updatedAt`) or `null` when the plan has no thumbnail at all. The
 * routes always live under `/api/member/...` (they resolve impersonating staff
 * to the member), matching how the table already builds its proxy URL.
 */
export function getPlanThumbnailUrl(plan: {
  id: string;
  thumbnailFileId?: string | null;
  thumbnailVariants?: unknown;
  thumbnailWinnerId?: string | null;
  updatedAt?: string | null;
}): string | null {
  const base = `/api/member/content-plans/${plan.id}`;
  const bust = encodeURIComponent(plan.updatedAt ?? "");
  if (plan.thumbnailFileId) {
    const v = encodeURIComponent(plan.updatedAt ?? plan.thumbnailFileId ?? "");
    return `${base}/thumbnail?v=${v}`;
  }
  const variants = Array.isArray(plan.thumbnailVariants)
    ? (plan.thumbnailVariants as Array<{ id?: unknown }>).filter(
        (v): v is { id: string } => !!v && typeof v.id === "string",
      )
    : [];
  if (variants.length === 0) return null;
  const winner = plan.thumbnailWinnerId
    ? variants.find((v) => v.id === plan.thumbnailWinnerId)
    : undefined;
  const chosen = winner ?? variants[0];
  return `${base}/thumbnails/${chosen.id}?v=${bust || encodeURIComponent(chosen.id)}`;
}

// Soft-delete leak guard for the self-referential binge chain. `bingeVideo`
// is a to-one relation (selected via bingeVideoId) and Prisma can't filter it
// inside `include`/`select`, so a live plan pointing at a soft-deleted target
// would still hydrate that deleted plan. Select `deletedAt` on the relation and
// null it out here so deleted binge targets never reach the client. (The
// to-many `bingedFromList` IS filterable, so that side uses `where:{deletedAt:null}`.)
export function hideDeletedBingeTarget<T extends { bingeVideo?: { deletedAt?: Date | null } | null }>(
  plan: T | null,
): T | null {
  if (plan?.bingeVideo && plan.bingeVideo.deletedAt) {
    (plan as { bingeVideo: unknown }).bingeVideo = null;
  }
  return plan;
}

export function hideDeletedBingeTargets<T extends { bingeVideo?: { deletedAt?: Date | null } | null }>(
  plans: T[],
): T[] {
  for (const plan of plans) hideDeletedBingeTarget(plan);
  return plans;
}
