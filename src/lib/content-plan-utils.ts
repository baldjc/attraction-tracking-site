export const FOUNDATIONS_PRODUCTION_TIERS = ["foundations", "editing_2", "editing_4"];
export const GROWTH_DWY_TIERS = ["mastery_2", "mastery_4", "done_with_you"];
export const PRODUCTION_TIERS = ["editing_2", "editing_4", "mastery_2", "mastery_4", "done_with_you"];

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

export const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  "Idea":              { bg: "#2a2a3e", text: "#888" },
  "Future Idea":       { bg: "#2a2a3e", text: "#888" },
  "Scripted":          { bg: "#1a2a4a", text: "#5b9bf5" },
  "Not Started":       { bg: "#1a2a4a", text: "#5b9bf5" },
  "Needs Research":    { bg: "#3a1a1a", text: "#f55b5b" },
  "Ready to Shoot":    { bg: "#2a1a3a", text: "#b57cfc" },
  "Filmed":            { bg: "#3a1a2a", text: "#f57cb5" },
  "Shooting":          { bg: "#3a1a2a", text: "#f57cb5" },
  "Editing":           { bg: "#3a3a1a", text: "#f5d55b" },
  "Shot - In Post":    { bg: "#3a3a1a", text: "#f5d55b" },
  "Edited":            { bg: "#1a3a1a", text: "#5bf57c" },
  "Scheduled":         { bg: "#3a2a1a", text: "#f5a55b" },
  "Scheduled on YT":   { bg: "#3a2a1a", text: "#f5a55b" },
  "Published":         { bg: "#1a3a2a", text: "#5bf5a5" },
  "Live on YT":        { bg: "#1a3a2a", text: "#5bf5a5" },
};

export const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
