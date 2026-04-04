export const FOUNDATIONS_PRODUCTION_TIERS = ["foundations", "editing_2", "editing_4"];
export const GROWTH_DWY_TIERS = ["mastery_2", "mastery_4", "done_with_you"];
export const PRODUCTION_TIERS = ["editing_2", "editing_4", "mastery_2", "mastery_4", "done_with_you"];

export const TIER_LABELS: Record<string, string> = {
  foundations:   "Foundations",
  editing_2:     "Production (2)",
  editing_4:     "Production (4)",
  mastery_2:     "Growth (2)",
  mastery_4:     "Growth (4)",
  done_with_you: "Done-With-You",
};

export function formatTierLabel(tier: string): string {
  return TIER_LABELS[tier] ?? tier;
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

export const PRE_PRODUCTION_STATUSES = [
  "Idea",
  "Future Idea",
  "Not Started",
  "Needs Research",
  "Scripted",
];

export const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  "Idea":              { bg: "#f3f4f6", text: "#6b7280" },
  "Future Idea":       { bg: "#f3f4f6", text: "#6b7280" },
  "Scripted":          { bg: "#dbeafe", text: "#1d4ed8" },
  "Not Started":       { bg: "#dbeafe", text: "#1d4ed8" },
  "Needs Research":    { bg: "#fee2e2", text: "#b91c1c" },
  "Ready to Shoot":    { bg: "#ede9fe", text: "#6d28d9" },
  "Filmed":            { bg: "#fce7f3", text: "#be185d" },
  "Shooting":          { bg: "#fce7f3", text: "#be185d" },
  "Editing":           { bg: "#fef9c3", text: "#a16207" },
  "Shot - In Post":    { bg: "#fef9c3", text: "#a16207" },
  "Edited":            { bg: "#dcfce7", text: "#15803d" },
  "Scheduled":         { bg: "#ffedd5", text: "#c2410c" },
  "Scheduled on YT":   { bg: "#ffedd5", text: "#c2410c" },
  "Published":         { bg: "#d1fae5", text: "#065f46" },
  "Live on YT":        { bg: "#d1fae5", text: "#065f46" },
};

export const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
