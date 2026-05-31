/**
 * Shared binge-target status logic for the Script Builder.
 *
 * A "usable" binge target is a ContentPlan the member has actually
 * committed to making — not one still sitting at the idea stage. When the
 * assigned target is unusable (still an idea), missing, or there is none at
 * all, the script must NOT tease a specific next video; fabricating one is a
 * hard validator failure (`binge_target_match`).
 *
 * Both the streaming generation route and the save-script persist route read
 * from here so the "usable?" definition can't drift between them.
 */

// ContentPlan statuses for which the binge target is not yet usable — we
// don't want the script to tease a video the member hasn't committed to make
// yet. Matched case-insensitively against ContentPlan.status.
export const EARLY_PLAN_STATUSES = new Set(["idea", "future idea"]);

// Statuses at which the YouTube video id can be embedded as a card URL.
export const PUBLISHED_PLAN_STATUSES = new Set([
  "live on yt",
  "live",
  "published",
]);

/**
 * A binge target is usable iff its plan exists and its status is NOT an
 * early/idea stage. Callers must still confirm the target plan exists.
 */
export function isBingeTargetUsable(
  status: string | null | undefined,
): boolean {
  return !EARLY_PLAN_STATUSES.has((status ?? "").trim().toLowerCase());
}
