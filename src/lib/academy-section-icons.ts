const ICONS_BY_ORDER: Record<number, string> = {
  1: "🧭",
  2: "🎯",
  3: "🎤",
  4: "🎬",
  5: "🎁",
  6: "🚀",
};

const ICONS_BY_SLUG: Record<string, string> = {
  "your-why": "🧭",
  "positioning-your-channel": "🎯",
  "on-camera-confidence": "🎤",
  "creation": "🎬",
  "packaging": "🎁",
  "your-first-10-videos": "🚀",
};

export function getSectionIcon(sortOrder?: number | null, slug?: string | null): string {
  if (sortOrder && ICONS_BY_ORDER[sortOrder]) return ICONS_BY_ORDER[sortOrder];
  if (slug && ICONS_BY_SLUG[slug]) return ICONS_BY_SLUG[slug];
  return "📚";
}
