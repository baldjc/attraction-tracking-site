/**
 * Onboarding Wizard — tier cohort helpers.
 *
 * The spec talks in "tier" terms (Foundations / Production / Growth / DWY)
 * but the underlying `User.serviceTier` enum is more granular (foundations,
 * editing_2, editing_4, mastery_2, mastery_4, done_with_you). This module
 * collapses the enum into the four cohorts the wizard cares about so each
 * step can do plain string comparisons.
 */
export type TierCohort = "Foundations" | "Production" | "Growth" | "DWY";

export function mapServiceTierToCohort(
  serviceTier: string | null | undefined,
): TierCohort {
  switch (serviceTier) {
    case "done_with_you":
      return "DWY";
    case "mastery_2":
    case "mastery_4":
      return "Growth";
    case "editing_2":
    case "editing_4":
      return "Production";
    case "foundations":
    default:
      return "Foundations";
  }
}

/**
 * Step 2 copy depends on the cohort. Growth/DWY get a 24-month export ask
 * (year-over-year trajectory), everyone else gets 12 months.
 */
export function marketDataMonths(cohort: TierCohort): 12 | 24 {
  return cohort === "Growth" || cohort === "DWY" ? 24 : 12;
}

/**
 * Total step count visible in the progress indicator. DWY gets the optional
 * Voice Guide step (Step 7 in the wizard, spec numbering) so they see 7 steps;
 * everyone else sees 6.
 *
 * Note: the `voiceGuideEnabled` boolean reflects the live feature flag, not
 * the static tier — staff/allowlisted Foundations members with the flag on
 * also see 7 steps.
 */
export function totalWizardSteps(voiceGuideEnabled: boolean): 6 | 7 {
  return voiceGuideEnabled ? 7 : 6;
}
