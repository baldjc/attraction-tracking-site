export interface CanonicalTheme {
  id: string;
  name: string;
  emoji: string;
  colour: string;
  coreStress: string;
  description: string;
}

export const CANONICAL_THEMES: CanonicalTheme[] = [
  {
    id: "the-decision",
    name: "The Decision",
    emoji: "🤔",
    colour: "#3B82F6",
    coreStress: "Should we even do this?",
    description: "Emotional readiness, timing, opportunity cost — the moment before commitment.",
  },
  {
    id: "the-equity",
    name: "The Equity",
    emoji: "💰",
    colour: "var(--abv-scores)",
    coreStress: "Will our situation support the move?",
    description: "Financial readiness, buying power, budget math, prep ROI — can they afford this?",
  },
  {
    id: "the-transition",
    name: "The Transition",
    emoji: "🔄",
    colour: "#EF4444",
    coreStress: "What if we get stuck in the middle?",
    description: "Timing two transactions, bridge financing, logistics — the messy middle of selling and buying.",
  },
  {
    id: "the-purchase",
    name: "The Purchase",
    emoji: "🏠",
    colour: "var(--abv-academy)",
    coreStress: "Will we get it right?",
    description: "Evaluating homes, inspections, offers, hidden costs — the actual buying process.",
  },
  {
    id: "the-aftermath",
    name: "The Aftermath",
    emoji: "🔍",
    colour: "var(--abv-hire)",
    coreStress: "Did we make the right call?",
    description: "Post-purchase surprises, tax resets, protecting the investment, buyer's remorse.",
  },
  {
    id: "the-neighbourhood",
    name: "The Neighbourhood",
    emoji: "📍",
    colour: "#EC4899",
    coreStress: "Are we picking the right area?",
    description: "Location choice, neighbourhood comparisons, hidden gems, lifestyle-fit — WHERE to buy.",
  },
  {
    id: "the-strategy",
    name: "The Strategy",
    emoji: "🧑",
    colour: "#06B6D4",
    coreStress: "How do I play this smart?",
    description: "Tactical buying advice — what to buy, when to buy, offer strategy, insider knowledge.",
  },
  {
    id: "the-numbers",
    name: "The Numbers",
    emoji: "📊",
    colour: "#F97316",
    coreStress: "What do the numbers actually say?",
    description: "Market updates, stats breakdowns, monthly data — pure data-driven content.",
  },
];

export const MAX_THEMES = 5;

export function findCanonicalTheme(input: string): CanonicalTheme | undefined {
  const lower = input.toLowerCase().trim();
  const byId = CANONICAL_THEMES.find((t) => t.id === lower);
  if (byId) return byId;
  const byName = CANONICAL_THEMES.find((t) => t.name.toLowerCase() === lower);
  if (byName) return byName;
  return CANONICAL_THEMES.find(
    (t) =>
      lower.includes(t.name.toLowerCase().replace("the ", "")) ||
      t.name.toLowerCase().includes(lower.replace("the ", ""))
  );
}

export function getCanonicalThemeNames(): string[] {
  return CANONICAL_THEMES.map((t) => t.name);
}
