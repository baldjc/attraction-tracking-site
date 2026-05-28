/**
 * Wave 4 — Content Engine wizard "property type focus" lock.
 *
 * Single source of truth for the allowed property-type values, their display
 * labels, and the inference helpers used when picking a Story Lead. We drop
 * "Multi-Family" deliberately — Calgary CREB data has no Multi-Family rows,
 * so offering it would create a focus the validator can never satisfy.
 *
 * "Any" is the wire-level sentinel meaning "no lock". It maps to a null
 * `propertyTypeFocus` on ContentPlan (Script Builder v2 reads null as "All").
 */
export const PROPERTY_TYPE_FOCUS_VALUES = [
  "Any",
  "Detached",
  "Semi-Detached",
  "Row/Townhouse",
  "Apartment",
] as const;

export type PropertyTypeFocus = (typeof PROPERTY_TYPE_FOCUS_VALUES)[number];

export const PROPERTY_TYPE_FOCUS_LABEL: Record<PropertyTypeFocus, string> = {
  Any: "Any property type",
  Detached: "Detached",
  "Semi-Detached": "Semi-Detached",
  "Row/Townhouse": "Row/Townhouse",
  Apartment: "Apartment",
};

/** Parse a query-string / form value to a known focus, falling back to Any. */
export function parsePropertyTypeFocus(
  v: string | null | undefined,
): PropertyTypeFocus {
  if (!v) return "Any";
  return (PROPERTY_TYPE_FOCUS_VALUES as readonly string[]).includes(v)
    ? (v as PropertyTypeFocus)
    : "Any";
}

/** When persisting to ContentPlan: "Any" → null, anything else → the value. */
export function propertyTypeFocusToContentPlanValue(
  v: PropertyTypeFocus | null | undefined,
): string | null {
  if (!v || v === "Any") return null;
  return v;
}

/**
 * Best-effort inference of a property-type from a Story Lead's free-text
 * fields. Story Leads don't have a propertyType column, so we scan the
 * `pattern + dataThreads` text for one of the known type names. If exactly
 * one type is mentioned, we auto-lock to it; if zero or multiple, return
 * "Any" so the member can pick explicitly.
 *
 * Order matters: check the multi-word labels first so "Semi-Detached" isn't
 * swallowed by a plain "Detached" hit.
 */
export function inferFocusFromStoryLeadText(text: string): PropertyTypeFocus {
  const hay = text.toLowerCase();
  const hits = new Set<PropertyTypeFocus>();
  // Semi first (substring of "Detached")
  if (/\bsemi[\s-]?detached\b/.test(hay)) hits.add("Semi-Detached");
  // Detached (excluded if Semi already matched the same span — but our
  // string may contain both as a list; checking again with a non-semi
  // anchor isn't worth the regex gymnastics for a v1).
  if (/(?<!semi[\s-])\bdetached\b/.test(hay)) hits.add("Detached");
  if (/\b(row|townhouse|townhome|town home|town house)\b/.test(hay)) {
    hits.add("Row/Townhouse");
  }
  if (/\b(apartment|condo apartment|apt)\b/.test(hay)) hits.add("Apartment");
  if (hits.size === 1) {
    return Array.from(hits)[0]!;
  }
  return "Any";
}

/**
 * The HARD CONSTRAINT block we splice into the user message for downstream
 * Claude calls (content-engine-v2, idea-validation). Kept short so we don't
 * inflate the per-call token bill, but explicit enough that the validator
 * can refuse drift.
 */
export function buildFocusConstraintBlock(
  focus: PropertyTypeFocus | null | undefined,
): string {
  const resolved = parsePropertyTypeFocus(focus ?? null);
  if (resolved === "Any") {
    return [
      "## PROPERTY TYPE FOCUS",
      "No property type lock — you may cover Detached, Semi-Detached, Row/Townhouse, or Apartment as the data supports.",
    ].join("\n");
  }
  return [
    "## PROPERTY TYPE FOCUS — HARD CONSTRAINT",
    `The member has locked this video to **${resolved}**. Every cited fact and every body callout MUST be about ${resolved} properties (or about the city/neighbourhood as a whole when the data isn't broken out by type).`,
    "",
    "Rules:",
    `- Do NOT cite facts whose \`propertyType\` is a different specific type (e.g. if locked to Detached, do not cite an Apartment-only fact).`,
    `- City-wide / neighbourhood-wide facts (propertyType null) are OK as long as the narrative stays on ${resolved}.`,
    `- If the idea would only work by pivoting to a different property type, refuse to generate it — return an empty \`ideas\` array (or, for idea validation, return \`mode: "contradicts"\` with a relatedAngle that keeps the lock).`,
    `- The lock CANNOT be relaxed by anything the member says downstream. It is set once at the start of the wizard.`,
  ].join("\n");
}
