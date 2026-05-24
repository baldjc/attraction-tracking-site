/**
 * Server-side validation gate for Content Engine v2 idea cards.
 *
 * Every card returned by Claude is checked against the locked title rules
 * from `1_CONTENT_ENGINE_MODE.md` BEFORE the route hands the batch back to
 * the client. Failed cards are fed to a re-prompt loop (max 2 retries) so
 * Claude can self-correct without the user ever seeing a malformed card.
 *
 * The rules enforced here intentionally mirror Step 8 of the source prompt
 * — keeping them in code (not just in the prompt) is what makes the
 * "Wave 2 spec ✅" acceptance criteria actually verifiable.
 */

/** Snake-case enum values that match Prisma `RotationSlot`. */
export const ROTATION_SLOTS = [
  "market_update",
  "neighbourhood_fact",
  "contrarian_take",
  "do_not",
  "should_you",
] as const;
export type RotationSlotKey = (typeof ROTATION_SLOTS)[number];

/**
 * Human-readable label for a rotation slot. Wave 2.5 — written into
 * ContentPlan.theme on save so Wave 2 plans show up in the existing planner
 * views that filter by theme (BoardView, ContentPlanTable theme dropdowns,
 * team-pipeline theme filters). The machine-readable `rotationSlot` column
 * stays the source of truth for the wizard / Wave 3 — `theme` is the
 * legacy v1 surface mirroring the same value as a string.
 *
 * Match Step2C's user-facing labels verbatim so a Wave 2 plan filtered by
 * "Neighbourhood Fact" in the planner uses the same string the user picked
 * in the wizard.
 */
export const ROTATION_SLOT_LABELS: Record<RotationSlotKey, string> = {
  market_update: "Market Update",
  neighbourhood_fact: "Neighbourhood Fact",
  contrarian_take: "Contrarian Take",
  do_not: "Do Not",
  should_you: "Should You",
};

export function rotationSlotToTheme(slot: RotationSlotKey): string {
  return ROTATION_SLOT_LABELS[slot];
}

/**
 * Words/phrases that name an avatar segment. Title is forbidden from
 * mentioning these — they belong in the body. Plurals + hyphen/space
 * variants handled by the inner alternation.
 *
 * Tested against fixtures in the comments below — if you add a new avatar
 * segment, add it both to the regex AND to a quick mental test that the
 * existing safe-title fixtures still pass.
 *   PASS: "These 5 Calgary Neighbourhoods Have Real Buyer Leverage"
 *   FAIL: "5 Calgary Neighbourhoods for First-Time Buyers"
 *   FAIL: "Should You Downsize in Calgary Right Now?"  (downsizer derivation)
 */
export const AVATAR_SEGMENT_REGEX =
  /\b(?:first[- ]?time (?:home )?buyers?|move[- ]?up (?:family|families|buyers?)|down[- ]?sizers?|empty[- ]?nesters?|relocators?|aspirational buyers?|move[- ]?downs?|curious owners?)\b/i;

/**
 * Cross-slot title rules from the Content Engine Mode prompt + Wave 2 spec.
 * Returns the list of human-readable errors so the re-prompt loop can feed
 * the exact failures back to Claude verbatim ("Idea #3 failed: title is 67
 * chars (max 60); title contains 'first-time buyer' which is avatar
 * language; ...").
 */
export interface IdeaCard {
  title: string;
  rotationSlot: string;
  titlePromise: string;
  thumbnailCallouts: string[];
  clarityPremise: string;
  citedFactIds: string[];
  visualPeak: string;
  subPersonas: string[];
  framework: string;
  tactileType: string;
  estimatedRuntime?: string;
  whyItWorks?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateIdeaCard(
  card: unknown,
  headlineSafeFactIds: Set<string>,
  neighbourhoods: string[],
): ValidationResult {
  const errors: string[] = [];
  const c = (card ?? {}) as Partial<IdeaCard> & Record<string, unknown>;

  // ── Required-string fields ──────────────────────────────────────────
  for (const f of [
    "title",
    "rotationSlot",
    "titlePromise",
    "clarityPremise",
    "visualPeak",
    "framework",
    "tactileType",
  ] as const) {
    if (typeof c[f] !== "string" || !(c[f] as string).trim()) {
      errors.push(`missing required field "${f}"`);
    }
  }
  const title = typeof c.title === "string" ? c.title.trim() : "";

  // ── Title length ────────────────────────────────────────────────────
  if (title && title.length > 60) {
    errors.push(`title is ${title.length} chars (HARD CAP 60)`);
  }

  // ── Title number rule (3/5/7/10) ────────────────────────────────────
  if (title) {
    const numErr = checkTitleNumbers(title);
    if (numErr) errors.push(numErr);
  }

  // ── Avatar-segment language in title ────────────────────────────────
  if (title && AVATAR_SEGMENT_REGEX.test(title)) {
    const match = title.match(AVATAR_SEGMENT_REGEX);
    errors.push(
      `title contains avatar-segment language "${match?.[0]}" — avatar lives in the body, never in the title`,
    );
  }

  // ── Named anchor in title ───────────────────────────────────────────
  if (title && !hasNamedAnchor(title, neighbourhoods)) {
    errors.push(
      "title is missing a named anchor (neighbourhood, dollar amount, percent, MOI, or year-month)",
    );
  }

  // ── Rotation slot is a known enum value ─────────────────────────────
  if (
    typeof c.rotationSlot === "string" &&
    !ROTATION_SLOTS.includes(c.rotationSlot as RotationSlotKey)
  ) {
    errors.push(
      `rotationSlot "${c.rotationSlot}" is not one of: ${ROTATION_SLOTS.join(", ")}`,
    );
  }

  // ── Cited facts: ≥3, all real, all headline-safe ────────────────────
  const cited = Array.isArray(c.citedFactIds)
    ? c.citedFactIds.filter((x): x is string => typeof x === "string")
    : [];
  if (cited.length < 3) {
    errors.push(`needs ≥3 citedFactIds, got ${cited.length}`);
  }
  const unknownIds = cited.filter((id) => !headlineSafeFactIds.has(id));
  if (unknownIds.length > 0) {
    errors.push(
      `citedFactIds reference ${unknownIds.length} fact id(s) not in the headline-safe library (first: ${unknownIds[0]})`,
    );
  }

  // ── Sub-personas: non-empty array ───────────────────────────────────
  const subPersonas = Array.isArray(c.subPersonas)
    ? c.subPersonas.filter((x): x is string => typeof x === "string")
    : [];
  if (subPersonas.length === 0) {
    errors.push("subPersonas array must include at least the primary persona");
  }

  // ── Thumbnail callouts: ≥1 short emotional string ───────────────────
  const callouts = Array.isArray(c.thumbnailCallouts)
    ? c.thumbnailCallouts.filter((x): x is string => typeof x === "string")
    : [];
  if (callouts.length === 0) {
    errors.push("needs at least one thumbnailCallout");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Title-number check. Numbers in titles must be 3, 5, 7, or 10 — but only
 * when they're "headline list-counts" ("These 5 Neighbourhoods..."), NOT
 * when they're embedded in dollar amounts, percents, MOI decimals, or
 * year-month anchors. We strip those known anchor shapes first and then
 * check whatever bare integers remain.
 */
function checkTitleNumbers(title: string): string | null {
  const stripped = title
    .replace(/\$[\d,]+(?:\.\d+)?[KMB]?/gi, "") // dollar amounts (with K/M/B)
    .replace(/\d+(?:\.\d+)?\s*%/g, "") // percentages
    .replace(/\b\d+(?:\.\d+)?\s*MOI\b/gi, "") // MOI anchors (integer OR decimal, e.g. "4 MOI" / "4.5 MOI")
    .replace(/\b(?:19|20)\d{2}-\d{2}\b/g, "") // YYYY-MM year-month anchors (strip BEFORE bare year)
    .replace(/\d+\.\d+/g, "") // remaining decimals (e.g. metrics not caught above)
    .replace(/\b(?:19|20)\d{2}\b/g, ""); // years 1900-2099
  const bareInts = stripped.match(/\b\d+\b/g);
  if (!bareInts) return null;
  const allowed = new Set(["3", "5", "7", "10"]);
  const bad = bareInts.filter((n) => !allowed.has(n));
  if (bad.length === 0) return null;
  return `title contains number "${bad[0]}" — only 3, 5, 7, or 10 are allowed in headline list-counts`;
}

/**
 * Named-anchor check. Title needs at least one of:
 *   - dollar amount        ($750K, $1.2M, $750,000)
 *   - percent              (9.8%, 49.4 %)
 *   - MOI mention          (4.5 MOI)
 *   - year-month anchor    ("April 2026", "Apr 2026", "2026-04")
 *   - a named neighbourhood from the member's MarketConfig vocab
 *
 * The member's `marketName` itself (e.g. "Calgary") deliberately does NOT
 * count — the source prompt says "Calgary is the qualifier, not the
 * anchor." We need an extra layer of specificity beyond the city.
 */
export function hasNamedAnchor(title: string, neighbourhoods: string[]): boolean {
  if (/\$[\d,]+(?:\.\d+)?[KMB]?/i.test(title)) return true;
  if (/\d+(?:\.\d+)?\s*%/.test(title)) return true;
  if (/\d+(?:\.\d+)?\s*MOI\b/i.test(title)) return true;
  if (
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\s+\d{4}\b/i.test(
      title,
    )
  ) {
    return true;
  }
  if (/\b\d{4}-\d{2}\b/.test(title)) return true;
  const lower = title.toLowerCase();
  for (const n of neighbourhoods) {
    const t = n?.trim().toLowerCase();
    if (t && t.length >= 3 && lower.includes(t)) return true;
  }
  return false;
}

/**
 * Parse Claude's response text into JSON. Tolerates a single ```json fence
 * (the model sometimes adds one even when told not to). Throws on parse
 * error so the caller can re-prompt or surface a 502.
 */
export function parseJsonResponse<T = unknown>(text: string): T {
  let trimmed = text.trim();
  // Strip ```json ... ``` or ``` ... ``` fences
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) trimmed = fenceMatch[1].trim();
  return JSON.parse(trimmed) as T;
}
