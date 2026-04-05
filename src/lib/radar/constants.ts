// ── Radar Constants ──────────────────────────────────────────────────────────

export const OUTLIER_TIERS = [
  { min: 1.5, max: 3, tier: "performing" as const, label: "Performing" },
  { min: 3, max: 10, tier: "strong" as const, label: "Strong" },
  { min: 10, max: 50, tier: "viral" as const, label: "Viral" },
  { min: 50, max: 100, tier: "extreme" as const, label: "Extreme" },
  { min: 100, max: Infinity, tier: "legendary" as const, label: "Legendary" },
] as const;

export function getOutlierTier(multiplier: number) {
  for (const t of OUTLIER_TIERS) {
    if (multiplier >= t.min && multiplier < t.max) return t;
  }
  return null;
}

export const VIDEO_TYPES = [
  "Buyer Education",
  "Seller Strategy",
  "Neighbourhood Guide",
  "Market Update",
  "Investment & Wealth",
  "Relocation & Lifestyle",
  "First-Time Buyer",
  "Move-Up Buyer",
  "Luxury",
  "New Construction",
  "Interest Rate & Economic",
  "Myth-Busting",
  "Behind the Scenes",
  "Q&A / FAQ",
  "Value-Focused",
  "Data-Focused",
] as const;

export const HOOK_TYPES = [
  "stat_shock",
  "bold_claim",
  "question",
  "story_setup",
  "fear_loss",
  "curiosity_gap",
  "authority",
] as const;

export const TITLE_PATTERNS = [
  "question",
  "list",
  "data_led",
  "curiosity_gap",
  "local_keyword",
  "how_to",
  "myth_bust",
  "emotional_amplifier",
] as const;

export const THUMBNAIL_APPROACHES = [
  "face_text",
  "data_graphic",
  "before_after",
  "map_highlight",
  "split_screen",
  "reaction_face",
] as const;

export const PROOF_MECHANISMS = [
  "client_story",
  "data_narrative",
  "metaphor",
  "personal_experience",
  "visual_social_proof",
  "demonstration",
] as const;

export const CTA_TYPES = [
  "subscribe",
  "lead_magnet",
  "comment_prompt",
  "next_video",
  "none",
] as const;
