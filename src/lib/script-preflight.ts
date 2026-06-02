/**
 * Pre-flight fact-sufficiency check for Script Builder v2.
 *
 * Runs BEFORE any Anthropic call. The plan's mode (rotationSlot) declares a
 * minimum fact requirement; the linked, still-existing facts are checked
 * against it. When the linked set categorically can't satisfy the mode, the
 * route returns `insufficient_facts` immediately instead of burning ~5 minutes
 * of generation + retries on a script that can't pass — converting a generic
 * timeout into instant, actionable feedback.
 *
 * Relationship to the Low Support banner (DIFFERENT state, do not conflate):
 *   - Pre-flight (here): fires BEFORE generation; hard-blocks plans that can't
 *     produce a passing script for their mode. `minFacts` is held at the same
 *     absolute floor (1) the route already enforces, so a 1–2-fact plan that
 *     the Low Support banner intentionally lets through is NEVER blocked here.
 *   - Low Support banner: shown when generation SUCCEEDS but with fewer than
 *     the recommended target (FACT_GATE_TARGET = 3) facts.
 *
 * The only NEW block this adds beyond the route's existing "≥1 linked fact"
 * gate is the neighbourhood-scope requirement for the `neighbourhood_fact`
 * mode: a neighbourhood-level video whose only linked facts are city-wide
 * aggregates ("All Neighbourhoods") has no local anchor and can't satisfy the
 * mode's premise.
 */
import {
  ROTATION_SLOT_LABELS,
  type RotationSlotKey,
} from "./content-engine-validation";

export interface PreflightFact {
  /** MarketFact.neighbourhood — "All Neighbourhoods" / "All" denote city-wide. */
  neighbourhood: string;
}

export interface ModeFactRequirement {
  /** Minimum number of still-existing linked facts the mode needs. */
  minFacts: number;
  /**
   * When true, at least one linked fact must be neighbourhood-scoped (i.e. NOT
   * a city-wide aggregate). Modes whose entire premise is a specific area set
   * this; city-wide modes (Market Update) do not.
   */
  requiresNeighbourhoodScoped: boolean;
}

/** Neighbourhood strings that denote a city-wide (non-local) aggregate. */
const CITYWIDE_SCOPE_TOKENS = new Set([
  "all neighbourhoods",
  "all neighborhoods",
  "all",
  "citywide",
  "city-wide",
  "city wide",
  "all areas",
]);

/**
 * Per-mode minimum requirements. `minFacts` stays at 1 (the route's existing
 * floor) for every mode so this check never regresses the Low Support
 * population; the meaningful, mode-specific lever is
 * `requiresNeighbourhoodScoped`.
 */
export const MODE_FACT_REQUIREMENTS: Record<
  RotationSlotKey,
  ModeFactRequirement
> = {
  market_update: { minFacts: 1, requiresNeighbourhoodScoped: false },
  neighbourhood_fact: { minFacts: 1, requiresNeighbourhoodScoped: true },
  contrarian_take: { minFacts: 1, requiresNeighbourhoodScoped: false },
  do_not: { minFacts: 1, requiresNeighbourhoodScoped: false },
  should_you: { minFacts: 1, requiresNeighbourhoodScoped: false },
};

export interface PreflightResult {
  /** True iff the linked facts satisfy the mode's requirements. */
  ok: boolean;
  /** Human-readable mode name (e.g. "Neighbourhood Fact"). */
  modeName: string;
  /** Count of in-scope facts that satisfy the requirement dimension. */
  have: number;
  /** Minimum the mode needs. */
  needed: number;
  /** Uncovered dimensions, for the UI hint (empty when ok). */
  uncovered: string[];
  /** Member-facing message (undefined when ok). */
  message?: string;
}

/** True when a fact is scoped to a specific neighbourhood (not city-wide). */
export function isNeighbourhoodScoped(neighbourhood: string): boolean {
  const norm = neighbourhood.trim().toLowerCase();
  if (norm.length === 0) return false;
  return !CITYWIDE_SCOPE_TOKENS.has(norm);
}

/**
 * Evaluate whether a plan's linked facts are sufficient for its mode.
 *
 * Pure + side-effect free so it can be unit-tested without the route and
 * called before the Anthropic client is ever constructed.
 */
export function evaluateScriptPreflight(args: {
  rotationSlot: RotationSlotKey;
  facts: PreflightFact[];
}): PreflightResult {
  const { rotationSlot, facts } = args;
  const req = MODE_FACT_REQUIREMENTS[rotationSlot];
  const modeName = ROTATION_SLOT_LABELS[rotationSlot];
  const total = facts.length;
  const uncovered: string[] = [];

  // Dimension 1 — absolute minimum count.
  if (total < req.minFacts) {
    uncovered.push(
      `${req.minFacts} linked fact${req.minFacts === 1 ? "" : "s"} (have ${total})`,
    );
  }

  // Dimension 2 — neighbourhood-scoped coverage for area-specific modes.
  const neighbourhoodScoped = facts.filter((f) =>
    isNeighbourhoodScoped(f.neighbourhood),
  );
  if (req.requiresNeighbourhoodScoped && neighbourhoodScoped.length < 1) {
    uncovered.push(
      "a neighbourhood-level fact (your linked facts are all city-wide)",
    );
  }

  const have = req.requiresNeighbourhoodScoped
    ? neighbourhoodScoped.length
    : total;
  const needed = Math.max(
    req.minFacts,
    req.requiresNeighbourhoodScoped ? 1 : req.minFacts,
  );

  if (uncovered.length === 0) {
    return { ok: true, modeName, have, needed, uncovered };
  }

  const message =
    `The "${modeName}" mode needs ${uncovered.join(" and ")}. ` +
    `Link more facts or run a data search before building a script.`;

  return { ok: false, modeName, have, needed, uncovered, message };
}
