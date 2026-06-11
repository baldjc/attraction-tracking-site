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
 * Member-facing labels for the rotation slot as shown in the Content Planner
 * "Theme" column (Table + mobile feed). These are intentionally more
 * descriptive than `ROTATION_SLOT_LABELS` (which mirrors the wizard's terse
 * picker copy) — e.g. "Neighbourhood Comparison" / "Do Not / Warning". The
 * planner "Theme" column shows the rotation slot, NOT the Avatar Stressor
 * (`ContentPlan.theme`), which is a separate attribute edited in the modal.
 */
export const PLANNER_THEME_LABELS: Record<RotationSlotKey, string> = {
  market_update: "Market Update",
  neighbourhood_fact: "Neighbourhood Comparison",
  contrarian_take: "Contrarian Take",
  do_not: "Do Not / Warning",
  should_you: "Should / Should Not",
};

/** Resolve a rotation-slot value to its planner "Theme" label, or null. */
export function plannerThemeLabel(slot: string | null | undefined): string | null {
  if (!slot) return null;
  return PLANNER_THEME_LABELS[slot as RotationSlotKey] ?? null;
}

/**
 * Human-readable label for a MarketFact.metricName. Wave 2.5 — the
 * validator persists the raw token the LLM emits (e.g. "SP_LP_ratio",
 * "MOI", "median_sale_price") which is fine for downstream prompt
 * shuttling but unreadable in member-facing surfaces like the planner
 * modal's "Idea card lineage" panel.
 *
 * Keys cover every metricName value the validator + parser produce
 * (see src/lib/fact-validator-prompt.ts lines 37/459-465 for the
 * enumeration the LLM is instructed to emit, plus the SP_LP / SP_LP_ratio
 * casing variations actually observed in production rows).
 *
 * Unknown values fall through to the raw token rather than throwing,
 * so a future metric the validator starts emitting still renders
 * (just without the friendly label) instead of breaking the panel.
 */
export const METRIC_NAME_LABELS: Record<string, string> = {
  // Months of inventory
  MOI: "Months of Inventory",
  moi: "Months of Inventory",
  // Sale-to-list ratio (both casings observed in production)
  SP_LP: "Sale-to-List Ratio",
  sp_lp: "Sale-to-List Ratio",
  SP_LP_ratio: "Sale-to-List Ratio",
  sp_lp_ratio: "Sale-to-List Ratio",
  // Days on market
  DOM: "Days on Market",
  dom: "Days on Market",
  dom_median: "Days on Market (median)",
  dom_average: "Days on Market (average)",
  // Failure / cancellation rate
  failure_rate: "Failure Rate",
  FAILURE_RATE: "Failure Rate",
  // Price metrics
  median_sale_price: "Median Sale Price",
  median_price: "Median Price",
  MEDIAN: "Median Price",
  median_psf: "Price per Sq Ft",
  psf: "Price per Sq Ft",
  PSF: "Price per Sq Ft",
  median_sqft: "Median Sq Ft",
  // Inventory
  active_listings: "Active Listings",
  INVENTORY: "Inventory",
};

export function metricNameToLabel(name: string): string {
  return METRIC_NAME_LABELS[name] ?? name;
}

/**
 * Format a numeric metricValue for display. Wave 2.5 fix 4 — the validator
 * stores raw numerics in metricValue (e.g. SP_LP_ratio = 0.9824), so the
 * lineage panel was rendering "0.9824" next to a title saying "98.24%". This
 * normalizes per metric so the cited value matches the title it powers.
 *
 * Returns String(value) as a safe fallback for metrics not enumerated here.
 */
export function formatMetricValue(metricName: string, value: number): string {
  const lower = metricName.toLowerCase();
  // SP/LP and other ratios are stored as 0-1 decimals; render as percent.
  if (lower === "sp_lp_ratio" || lower === "sp_lp" || (lower.includes("ratio") && Math.abs(value) <= 1)) {
    return `${(value * 100).toFixed(2)}%`;
  }
  // Rates/percentages are stored as 0-100 already.
  if (lower.includes("rate") || lower.includes("percent")) {
    return `${value.toFixed(2)}%`;
  }
  if (lower === "dom" || lower.includes("days_on_market") || lower.startsWith("dom_")) {
    return `${value.toFixed(1)} days`;
  }
  if (lower === "moi" || lower.includes("months_of_inventory") || lower.startsWith("moi_")) {
    return `${value.toFixed(2)} MOI`;
  }
  if (lower.includes("price") || lower.includes("psf") || lower.includes("median")) {
    return `$${Math.round(value).toLocaleString()}`;
  }
  return String(value);
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

/**
 * Hood-name matcher with hyphen-aware boundaries (Wave 4 beta —
 * Finding 9). `\b` alone treats "-" as a word boundary, so a naive
 * /\bbridgeland\b/ still matches "Bridgeland-Riverside". We reject
 * any adjacent letter/digit OR hyphen on either side so a shorter
 * name can't piggy-back into a hyphenated composite hood.
 */
export function matchesHood(haystackLower: string, hood: string): boolean {
  const t = hood?.trim().toLowerCase();
  if (!t || t.length < 3) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // (?<![A-Za-z0-9-])hood(?![A-Za-z0-9-]) — pure JS-supported lookarounds.
  const re = new RegExp(`(?<![A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`, "i");
  return re.test(haystackLower);
}

// ── Failure-rate honesty rule (>100% legacy safety net) ───────────────────
// failure_rate is now a BOUNDED share — failed / (sold + offMarket) — so it
// lives in 0–100% and "47% of homes failed to sell" is honest and allowed. The
// only thing left to catch is a legacy upload (computed before the bounded fix)
// whose value exceeds 100%: a literal ">100% failed to sell" is nonsense and
// must be reframed as a ratio. So this rule fires ONLY when the percentage tied
// to a failure-to-sell phrase is above 100. Capture group 1 = the number.
const FAILURE_VERB =
  "(?:failed?\\s+to\\s+sell|did(?:n['’]?t| not)\\s+sell|never\\s+sold|don['’]?t\\s+sell|won['’]?t\\s+sell|fail(?:ed|ing)?\\s+to\\s+find\\s+a\\s+buyer)";
const PERCENT_TOKEN = "(\\d{1,4}(?:\\.\\d+)?)\\s*(?:%|percent)";
// Also catch the metric stated by NAME ("the failure rate was 178%"), not just
// by failure-to-sell verbs — legacy unbounded data can be quoted either way.
const FAILURE_NOUN =
  "(?:failure[-\\s]?(?:to[-\\s]?sell\\s+)?rate|fail[-\\s]?rate)";
const PCT_THEN_FAIL = new RegExp(
  `${PERCENT_TOKEN}[^.?!\\n]{0,40}?${FAILURE_VERB}`,
  "i",
);
const FAIL_THEN_PCT = new RegExp(
  `${FAILURE_VERB}[^.?!\\n]{0,40}?${PERCENT_TOKEN}`,
  "i",
);
const PCT_THEN_NOUN = new RegExp(
  `${PERCENT_TOKEN}[^.?!\\n]{0,40}?${FAILURE_NOUN}`,
  "i",
);
const NOUN_THEN_PCT = new RegExp(
  `${FAILURE_NOUN}[^.?!\\n]{0,40}?${PERCENT_TOKEN}`,
  "i",
);

/**
 * Returns an error string when `text` speaks a failure-to-sell figure ABOVE
 * 100% (legacy pre-bounded data that can't be read as a literal percentage), or
 * null when the prose is clean. A bounded ≤100% share is honest and passes.
 * Exported for direct unit testing.
 */
export function checkFailureRateFraming(text: string): string | null {
  if (!text) return null;
  for (const re of [PCT_THEN_FAIL, FAIL_THEN_PCT, PCT_THEN_NOUN, NOUN_THEN_PCT]) {
    const m = re.exec(text);
    if (m) {
      const pct = parseFloat(m[1]);
      if (Number.isFinite(pct) && pct > 100) {
        return 'speaks a failure-to-sell figure above 100% — the failure rate is a bounded share (failed ÷ (sold + off-market)) and can never exceed 100%. This is legacy pre-bounded data: reframe it as a ratio ("for every 10 that sold, ~13 didn\'t") instead of a literal percentage';
      }
    }
  }
  return null;
}

export function validateIdeaCard(
  card: unknown,
  headlineSafeFactIds: Set<string>,
  neighbourhoods: string[],
  /**
   * Optional Story Lead fact allowlist (Wave 4 beta — Finding 8). When
   * non-null, every cited fact id MUST be in this set in addition to
   * being headline-safe — i.e. the card may only cite facts whose
   * neighbourhood the chosen Story Lead actually anchors. Pass null
   * (default) when the wizard isn't anchored to a Story Lead.
   */
  storyLeadFactIds: Set<string> | null = null,
  /**
   * Optional subset of `storyLeadFactIds` covering ONLY the facts that
   * are anchored to a specific lead-named neighbourhood (i.e. exclude
   * city-wide / "All" rollups). When non-null, each card must cite at
   * least one id from this set — city-wide stats are allowed as
   * supplemental context but cannot be the sole anchor of a card.
   */
  storyLeadHoodFactIds: Set<string> | null = null,
  /**
   * Optional pinned rotation slot (the wizard's "theme pin"). When
   * non-null, the card's `rotationSlot` MUST equal this value — this is
   * what enforces "Theme pinned to X" so a pinned batch can never ship an
   * off-theme card. Pass null (default) for an unpinned, mixed-theme
   * batch, where any valid rotation slot is accepted.
   */
  requiredRotationSlot: RotationSlotKey | null = null,
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

  // ── Geographic scope lock (Wave 4 beta — Finding 9) ─────────────────
  // Reject titles whose ONLY anchor is a single neighbourhood name with
  // no comparative/data anchor (no second neighbourhood, no list-count,
  // no $/%/MOI/year-month). Single-hood deep dives belong in dedicated
  // Listing Teardown / Story videos, not the standard rotation slots —
  // the wizard's current 5 slots all expect multi-hood or data-anchored
  // framing. Catches cases like "Saddle Ridge Just Got Interesting"
  // that pass hasNamedAnchor but lock the entire video to one community.
  if (title) {
    const scopeErr = checkSingleNeighbourhoodScope(title, neighbourhoods);
    if (scopeErr) errors.push(scopeErr);
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

  // ── Pinned theme enforcement ────────────────────────────────────────
  // When the wizard pinned a theme, every card must carry exactly that
  // rotation slot. Off-theme cards are rejected here so the re-prompt
  // loop regenerates them (and, failing that, they're dropped rather
  // than shipped) — this is what makes "Theme pinned to X" a hard
  // contract instead of a soft prompt hint the LLM can ignore.
  if (
    requiredRotationSlot !== null &&
    typeof c.rotationSlot === "string" &&
    c.rotationSlot !== requiredRotationSlot
  ) {
    errors.push(
      `rotationSlot "${c.rotationSlot}" must equal the pinned theme "${requiredRotationSlot}" — this batch is pinned to a single theme`,
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
  // ── Story Lead fact allowlist (Wave 4 beta — Finding 8) ────────────
  // When a Story Lead is selected, EVERY cited fact must come from the
  // lead's allowlist (facts whose neighbourhood the lead actually
  // anchors). Backs up the LLM prompt's HARD ANCHOR block — Claude
  // sometimes drifts to a "more interesting" neighbouring stat; we
  // catch that here and force a re-prompt.
  if (storyLeadFactIds !== null) {
    const outOfScope = cited.filter(
      (id) => headlineSafeFactIds.has(id) && !storyLeadFactIds.has(id),
    );
    if (outOfScope.length > 0) {
      errors.push(
        `citedFactIds include ${outOfScope.length} fact(s) outside the selected Story Lead's scope (first: ${outOfScope[0]}) — only cite facts whose neighbourhood the lead names`,
      );
    }
    // Require at least one cited fact anchored to a lead-named
    // neighbourhood (not just city-wide rollups). Without this a card
    // could cite only "Calgary, MOI 3.1" rows and pass the allowlist
    // while completely missing the lead's actual hood story.
    if (storyLeadHoodFactIds !== null && cited.length > 0) {
      const hoodAnchored = cited.some((id) => storyLeadHoodFactIds.has(id));
      if (!hoodAnchored) {
        errors.push(
          "citedFactIds rely entirely on city-wide rollups — cite at least one fact from a neighbourhood the Story Lead actually names",
        );
      }
    }
  }

  // ── Failure-rate framing honesty (prose fields) ─────────────────────
  // Scan every member-facing prose field for a "%-failed-to-sell" claim that
  // misreads the offMarket/sold ratio as a share of listings.
  for (const f of ["title", "titlePromise", "clarityPremise", "visualPeak"] as const) {
    const v = typeof c[f] === "string" ? (c[f] as string) : "";
    const framingErr = checkFailureRateFraming(v);
    if (framingErr) errors.push(`${f} ${framingErr}`);
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
 * Geographic-scope check (Wave 4 beta — Finding 9). Fires when the title's
 * ONLY anchor is a single neighbourhood name with no comparative anchor
 * (no second hood, no list-count, no $/%/MOI/year-month). Returns null
 * when the title is fine, or a human-readable error string otherwise.
 *
 *   PASS: "Mahogany Apartments Just Hit 4.33 MOI"          — hood + MOI
 *   PASS: "Bridgeland vs Beltline: 2.13 MOI Gap"           — two hoods
 *   PASS: "These 5 Calgary Neighbourhoods Hit 0.5 MOI"     — list-count
 *   FAIL: "Saddle Ridge Just Got Interesting"              — single hood only
 *   FAIL: "What's Going On In Crescent Heights"            — single hood only
 */
function checkSingleNeighbourhoodScope(
  title: string,
  neighbourhoods: string[],
): string | null {
  // Hood-boundary matching (Wave 4 beta — Finding 9). \b alone treats
  // "-" as a word boundary, so /\bbridgeland\b/ still false-matches
  // "Bridgeland-Riverside" and inflates matched.length past 1 — the
  // exact bug we're trying to lock out. We use a stricter lookaround
  // that rejects ANY adjacent letter/digit OR hyphen so hyphenated
  // composite names are only matched by their full form.
  const lower = title.toLowerCase();
  const matched = neighbourhoods.filter((n) => matchesHood(lower, n));
  if (matched.length !== 1) return null;
  // Any other numeric/temporal anchor lifts the lock.
  if (/\$[\d,]+(?:\.\d+)?[KMB]?/i.test(title)) return null;
  if (/\d+(?:\.\d+)?\s*%/.test(title)) return null;
  if (/\d+(?:\.\d+)?\s*MOI\b/i.test(title)) return null;
  if (
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\s+\d{4}\b/i.test(
      title,
    )
  ) {
    return null;
  }
  if (/\b\d{4}-\d{2}\b/.test(title)) return null;
  // List-count anchor (3/5/7/10) — implies multi-hood / comparative framing.
  if (/\b(?:3|5|7|10)\b/.test(title)) return null;
  return `title is locked to a single neighbourhood "${matched[0]}" with no comparative or data anchor — single-hood deep dives belong in dedicated Listing Teardown / Story videos. Add a second hood, a list-count, or a $/%/MOI/year-month anchor.`;
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
    // Hyphen-aware boundary matching (Wave 4 beta — Finding 9). Plain
    // substring `includes` false-positived shorter hood names inside
    // longer hyphenated composites; matchesHood blocks that.
    if (matchesHood(lower, n)) return true;
  }
  return false;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Wave 12 — buyer audience consistency (HARD rule).                     */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * A single buyer-audience consistency violation. Distinct shape from
 * `ValidationResult` above (which is the per-card title validator) so
 * the script-level rule can be wired into the script-builder route's
 * structured-violations response without colliding with the idea-card
 * validator's contract.
 */
export interface BuyerAudienceConsistencyViolation {
  rule: "buyer_audience_consistency";
  severity: "error";
  message: string;
}

/**
 * Mirrors the BUYER AUDIENCE CONSISTENCY hard rule in
 * `script-builder-mode-prompt.ts`. The script must speak to a single
 * buyer audience throughout: when a property-type lock is in force,
 * non-locked property types may appear only as explicitly-framed
 * comparison context, and may not exceed 15% of the body word count.
 *
 *  - `null` return → rule passed (or doesn't apply).
 *  - violation object → script pivots to non-locked property types
 *    without comparison framing.
 *
 * Skipped entirely when:
 *   - the lead intentionally spans multiple property types
 *     (`leadSpansMultipleTypes` flag from the Story Lead auto-lock), or
 *   - no property-type lock is in force (`null` / "All").
 */
export function checkBuyerAudienceConsistency(
  script: string,
  lockedPropertyType: string | null,
  leadSpansMultipleTypes: boolean,
): BuyerAudienceConsistencyViolation | null {
  // Skip if lead intentionally multi-type.
  if (leadSpansMultipleTypes) return null;
  // Skip if no lock.
  if (!lockedPropertyType || lockedPropertyType === "All") return null;

  const propertyTypes = ["Detached", "Semi-Detached", "Row/Townhouse", "Apartment"];
  const otherTypes = propertyTypes.filter((t) => t !== lockedPropertyType);

  // Count word frequency for each non-locked property type in the script.
  const totalWords = script.split(/\s+/).filter(Boolean).length;
  if (totalWords === 0) return null;
  let otherTypeWordCount = 0;

  for (const otherType of otherTypes) {
    // Escape "/" / "-" so "Row/Townhouse" matches both "Row/Townhouse"
    // and "Row-Townhouse" surface forms in dialogue.
    const escaped = otherType.replace("/", "[/-]");
    const regex = new RegExp(
      `\\b${escaped}\\b[\\s\\S]{0,200}?(\\bbuyers?\\b|\\bmarket\\b|\\bvalue\\b|\\bMOI\\b|\\bDOM\\b)`,
      "gi",
    );
    const matches = script.match(regex) ?? [];
    otherTypeWordCount += matches.join(" ").split(/\s+/).filter(Boolean).length;
  }

  const ratio = otherTypeWordCount / totalWords;

  if (ratio > 0.15) {
    const hasComparisonFraming =
      /for comparison|by contrast|this video isn't for|other buyers might|if you're (in|looking at)/i.test(
        script,
      );
    if (!hasComparisonFraming) {
      return {
        rule: "buyer_audience_consistency",
        severity: "error",
        message:
          `Script pivots to non-locked property types (${(ratio * 100).toFixed(1)}% of body) ` +
          `without explicit comparison framing. Locked audience: ${lockedPropertyType}.`,
      };
    }
  }

  return null;
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
