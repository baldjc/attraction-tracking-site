// Jarvis (AI Content Manager) — tool schemas, executors, fact ledger, and the
// grounding pass. The orchestrator (orchestrator.ts) wires these into Claude's
// agentic tool loop.

import type Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";
import {
  loadLatestValidatedUpload,
  loadHeadlineSafeFacts,
  loadTextureOnlyFacts,
  loadMarketConfigSummary,
} from "@/lib/content-engine-context";
import {
  getSourceOfTruthMetrics,
  pooled90dToSourceOfTruth,
  formatValue,
  sotValuesWithinRounding,
  resolveCanonicalSotValue,
  type MetricFamily,
} from "@/lib/aggregated-metrics";
import { aggregatePooled90dFromDb, shiftMonthYear } from "@/lib/csv-aggregate";
import { canonicalVariantKeys } from "@/lib/market-config";
import { loadMemberMetricSettings } from "@/lib/member-metric-settings-server";
import { detectMetricFamily } from "@/lib/story-lead-fact-resolver";
import { getNeighbourhoodContext } from "@/lib/get-neighbourhood-context";
import { getActiveThemeStress } from "@/lib/content-engine-prompts";
import { stripToDialogue } from "@/lib/script-content-rules";
import {
  METRIC_NAME_LABELS,
  ROTATION_SLOTS,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import {
  buildScript,
  buildPropertyTypeLock,
  type CitedFact,
  type CitedResearch,
  type PlanContext,
  type BuildScriptResult,
  type AssignedCampaign,
  type AssignedBingeVideo,
} from "@/lib/tools/scriptBuilder";
import {
  EARLY_PLAN_STATUSES,
  PUBLISHED_PLAN_STATUSES,
} from "@/lib/binge-target";
import type { LedgerFact } from "@/lib/jarvis/types";
import {
  runComputeCut,
  runYoYCut,
  type CutDimension,
  type CutFilter,
  type CutNumericField,
  type CutNumericFilter,
  type RunCutClassification,
  type YoYCutClassification,
  type YoYGroupDelta,
} from "@/lib/tools/computeCut";
import { coerceExtractedClaims } from "@/lib/jarvis/research-ingest";
import { formatMlsPeriod } from "@/lib/mls-verify-reminder";
import { isPropertyClassValue } from "@/lib/property-class";

// ── Tool schemas (Anthropic tool-use) ───────────────────────────────────────

export const JARVIS_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_facts",
    description:
      "Look up the member's own validated market facts (months of inventory, " +
      "sale-to-list ratio, days on market, prices, etc). Returns a list of " +
      "facts, each with a stable id you MUST reuse when citing it or linking " +
      "it to a script. Only facts returned here are real — never invent a " +
      "number that isn't in a get_facts result.",
    input_schema: {
      type: "object",
      properties: {
        neighbourhood: {
          type: "string",
          description:
            "Optional. Filter to one neighbourhood (exact name). Omit for all.",
        },
        metric: {
          type: "string",
          description:
            "Optional. Case-insensitive substring of the metric label, e.g. " +
            "'inventory', 'sale-to-list', 'days on market', 'price'.",
        },
      },
    },
  },
  {
    name: "build_script",
    description:
      "Draft a full talking-head video script from the member's facts using " +
      "the platform's locked FACT→CLARITY arc engine. Provide a title, a " +
      "rotation slot, a one-line title promise, and the ids of the facts " +
      "(from get_facts) to anchor it on. The drafted script streams to the " +
      "member live. This does NOT save anything.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Working video title." },
        rotationSlot: {
          type: "string",
          enum: ROTATION_SLOTS as unknown as string[],
          description:
            "One of: market_update, neighbourhood_fact, contrarian_take, " +
            "do_not, should_you.",
        },
        titlePromise: {
          type: "string",
          description:
            "The single promise the first 30 seconds must pay off.",
        },
        linkedFactIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Fact ids from get_facts to anchor the script on (at least one).",
        },
        clarityPremise: {
          type: "string",
          description: "Optional. The CLARITY beat's core takeaway.",
        },
        stressor: {
          type: "string",
          description:
            "Strongly preferred. The name of the Avatar Stressor this video is " +
            "written under — the specific worry the avatar carries. It MUST be " +
            "one of the names in the AVATAR STRESSORS list in your context, " +
            "copied EXACTLY as written there (e.g. \"The Neighbourhood\"). When " +
            "the member names a stressor, ALWAYS pass it here — never drop or " +
            "paraphrase it. When set, the script weaves 1–2 body-only " +
            "acknowledgements of that stressor (psychology layer, never the " +
            "title). Settle this with the member BEFORE drafting; omit ONLY if " +
            "the member has no Avatar Stressors at all. NEVER invent a stressor " +
            "that isn't in the AVATAR STRESSORS list.",
        },
        campaignId: {
          type: "string",
          description:
            "Optional but STRONGLY preferred. The id of the lead-magnet " +
            "Campaign (from the AVAILABLE LEAD MAGNETS context list) the member " +
            "confirmed for this video. The script weaves this real lead magnet's " +
            "pitch into the body and close. Omit ONLY if the member has no " +
            "campaigns or explicitly declined one (the script then uses generic " +
            "pitch language). NEVER invent an id.",
        },
        bingeVideoId: {
          type: "string",
          description:
            "Optional but STRONGLY preferred. The id of the 'watch this next' " +
            "ContentPlan (from the RECENT VIDEOS context list) the member " +
            "confirmed as the binge target. The script's close teases this real " +
            "next video. Omit ONLY if the member has no recent videos or declined " +
            "one (the close is then a generic forward-looking line). NEVER invent " +
            "an id.",
        },
        researchSourceIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional. The ids of EXTERNAL research sources (from the RESEARCH " +
            "SOURCES context block — items the member attached in chat) to ground " +
            "this script on as the outside lens. The member's own validated facts " +
            "still LEAD; research is referenced only as clearly-attributed outside " +
            "sources. Include ONLY when the member is building a research-driven " +
            "script. NEVER invent an id.",
        },
      },
      required: ["title", "rotationSlot", "titlePromise", "linkedFactIds"],
    },
  },
  {
    name: "compute_cut",
    description:
      "Compute a market breakdown on-demand DIRECTLY from the member's raw " +
      "uploaded CSV, for a slice the validated facts ledger (get_facts) doesn't " +
      "already pre-compute — e.g. 'single-family homes by the decade they were " +
      "built', 'condos by price bracket'. Returns real, deterministic aggregates " +
      "(median price, days on market, sale-to-list, price/sq ft, months of " +
      "inventory) per group, each with a stable fact id you reuse exactly like a " +
      "get_facts id (cite or link to a script). Use this ONLY after get_facts " +
      "returns nothing for the requested slice. " +
      "TWO PROPERTY DIMENSIONS THAT ARE NOT THE SAME — never swap one for the " +
      "other: `propertyClass` is the broad class from a raw 'Property Type' " +
      "column; `style` is whatever the member MAPPED to their Style column — for " +
      "some members that is architectural/storey form (Bungalow, 2 Storey), but " +
      "for members with no raw 'Property Type' column it holds their property " +
      "CLASSES (Single Family, Townhouse, Condo). Route the member's wording to " +
      "whichever dimension's surfaced 'Distinct values per dimension' (in the " +
      "member context) actually contains the term — do NOT assume style means " +
      "architectural form. " +
      "If the member asks about a class or value the data doesn't contain (e.g. " +
      "'townhouse' when the data only has Single Family and Condo), this tool " +
      "returns a refusal that LISTS the values that DO exist — relay that " +
      "honestly; do NOT substitute style for a missing class or invent a " +
      "segment. Groups with fewer than the headline sold floor are flagged as " +
      "texture-only — usable as background colour, never as a headline number.",
    input_schema: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: [
            "neighbourhood",
            "city",
            "style",
            "propertyClass",
            "yearBuiltDecade",
            "priceBracket",
            "bedrooms",
            "bathrooms",
          ],
          description:
            "What to break the market down BY. city = the mapped City/" +
            "municipality column (city-level rollups; only available when the " +
            "member's upload spans multiple cities); propertyClass = raw " +
            "'Property Type' class; style = mapped Style column; yearBuiltDecade " +
            "= decade the home was built; priceBracket = raw price-bracket " +
            "column; bedrooms / bathrooms = group by exact bedroom/bathroom " +
            "count (only when the member mapped that column). NOTE: when a " +
            "member's data spans 2+ cities, neighbourhood groups are " +
            "automatically labelled 'Neighbourhood (City)' so same-named " +
            "neighbourhoods in different cities are never merged.",
        },
        filterPropertyClass: {
          type: "string",
          description:
            "Optional. Restrict to one raw property CLASS (e.g. 'Single Family').",
        },
        filterNeighbourhood: {
          type: "string",
          description: "Optional. Restrict to one neighbourhood (exact name).",
        },
        filterCity: {
          type: "string",
          description:
            "Optional. Restrict to one city/municipality (exact name). Combine " +
            "with dimension='neighbourhood' to break a single city down by its " +
            "neighbourhoods.",
        },
        filterStyle: {
          type: "string",
          description:
            "Optional. Restrict to one mapped STYLE value (use a value from the " +
            "member's surfaced style list — e.g. 'Single Family' or 'Bungalow').",
        },
        filterPriceBracket: {
          type: "string",
          description: "Optional. Restrict to one raw price-bracket value.",
        },
        numericFilters: {
          type: "array",
          description:
            "Optional NUMERIC range filters. They compose with each other, with " +
            "the categorical filters above, and with the groupBy dimension " +
            "(e.g. dimension='city' + numericFilters=[{field:'bedrooms',min:4}] " +
            "= '4+ bedroom homes by city'; or [{field:'sqft',min:3000}] for " +
            "'just over 3,000 sq ft'). Each entry keeps rows whose value is in " +
            "[min, max] inclusive: supply min for >=, max for <=, or both for a " +
            "range. Fields: sqft, bedrooms, bathrooms, salePrice, yearBuilt — " +
            "available ONLY when the member mapped that column (else the tool " +
            "refuses honestly and lists which numeric filters exist). salePrice " +
            "restricts to sold listings (only sold rows carry a sale price).",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                enum: ["sqft", "bedrooms", "bathrooms", "salePrice", "yearBuilt"],
              },
              min: { type: "number", description: "Inclusive lower bound (>=)." },
              max: { type: "number", description: "Inclusive upper bound (<=)." },
            },
            required: ["field"],
          },
        },
        monthYear: {
          type: "string",
          description:
            "Optional YYYY-MM (e.g. '2025-05'). Compute the cut from THAT " +
            "month's validated upload instead of the latest one — use for a " +
            "specific prior month. If no upload exists for that month the tool " +
            "refuses honestly (it does not silently use a different month).",
        },
      },
      required: ["dimension"],
    },
  },
  {
    name: "compute_yoy_cut",
    description:
      "Compute a YEAR-OVER-YEAR breakdown on-demand from the member's raw " +
      "uploads: it runs the same deterministic cut for a base month AND the " +
      "same month a year earlier, then returns a real % change per group plus " +
      "BOTH endpoints as citable facts (e.g. 'which property type grew the most " +
      "year-over-year', 'condos this May vs last May'). Use this whenever the " +
      "member asks about change over a year, growth/decline vs last year, or a " +
      "prior-year comparison — get_facts only carries the current period. " +
      "Same two property dimensions as compute_cut, never swapped: " +
      "`propertyClass` is the broad class from a raw 'Property Type' column; " +
      "`style` is whatever the member mapped to their Style column (architectural " +
      "form for some, but property CLASSES like Single Family/Condo for members " +
      "with no raw 'Property Type' column) — route by the surfaced 'Distinct " +
      "values per dimension', not by assuming style means storey form. GROUNDING: if the member " +
      "hasn't uploaded a comparable prior period, or that older upload doesn't " +
      "contain the column, the tool returns 'no_comparison' and tells you which " +
      "months DO exist — relay that honestly and do NOT invent a prior-year " +
      "number. When the exact 12-months-prior month is missing it may compare " +
      "against the nearest available prior period and flags it — say that " +
      "comparison window out loud. Only groups with enough closed sales in BOTH " +
      "periods get a headline delta; smaller samples come back flagged.",
    input_schema: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: [
            "neighbourhood",
            "city",
            "style",
            "propertyClass",
            "yearBuiltDecade",
            "priceBracket",
            "bedrooms",
            "bathrooms",
          ],
          description:
            "What to break the year-over-year comparison down BY. city = mapped " +
            "City/municipality column (per-city YoY rollups; only when the data " +
            "spans multiple cities); propertyClass = raw 'Property Type' class; " +
            "style = mapped Style column; yearBuiltDecade = decade built; " +
            "priceBracket = raw price-bracket; bedrooms / bathrooms = exact " +
            "bedroom/bathroom count (only when mapped). When the data spans 2+ " +
            "cities, neighbourhood groups are labelled 'Neighbourhood (City)' so " +
            "same-named neighbourhoods in different cities never merge.",
        },
        filterPropertyClass: {
          type: "string",
          description:
            "Optional. Restrict to one raw property CLASS (e.g. 'Single Family').",
        },
        filterNeighbourhood: {
          type: "string",
          description: "Optional. Restrict to one neighbourhood (exact name).",
        },
        filterCity: {
          type: "string",
          description:
            "Optional. Restrict the year-over-year comparison to one city/" +
            "municipality (exact name).",
        },
        filterStyle: {
          type: "string",
          description:
            "Optional. Restrict to one mapped STYLE value (use a value from the " +
            "member's surfaced style list — e.g. 'Single Family' or 'Bungalow').",
        },
        filterPriceBracket: {
          type: "string",
          description: "Optional. Restrict to one raw price-bracket value.",
        },
        numericFilters: {
          type: "array",
          description:
            "Optional NUMERIC range filters applied to BOTH periods identically " +
            "(compose with the categorical filters and the groupBy dimension). " +
            "Each entry keeps rows whose value is in [min, max] inclusive: min " +
            "for >=, max for <=, or both for a range. Fields: sqft, bedrooms, " +
            "bathrooms, salePrice, yearBuilt — available only when the member " +
            "mapped that column (else the tool refuses honestly).",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                enum: ["sqft", "bedrooms", "bathrooms", "salePrice", "yearBuilt"],
              },
              min: { type: "number", description: "Inclusive lower bound (>=)." },
              max: { type: "number", description: "Inclusive upper bound (<=)." },
            },
            required: ["field"],
          },
        },
        monthYear: {
          type: "string",
          description:
            "Optional YYYY-MM base month for the comparison (defaults to the " +
            "latest validated upload). The comparison period is automatically " +
            "the same month a year earlier (or the nearest available prior " +
            "period).",
        },
      },
      required: ["dimension"],
    },
  },
  {
    name: "save_script",
    description:
      "Save the most recently proposed script as a DRAFT. GATED: this only " +
      "works after the member has explicitly approved the exact draft using " +
      "the Approve & save → Yes, save it buttons. Do NOT call this on your " +
      "own initiative or because the member said 'sounds good' — direct them " +
      "to the Approve & save button instead.",
    input_schema: {
      type: "object",
      properties: {
        proposalMessageId: {
          type: "string",
          description: "Id of the assistant message that proposed the script.",
        },
      },
      required: ["proposalMessageId"],
    },
  },
  {
    name: "clean_knowledge_base",
    description:
      "Propose a Knowledge Base cleanup (a 'merge run') that collapses " +
      "fragmented neighbourhood/subdivision names (e.g. dozens of " +
      "'Woodbridge Ph 5B', 'Woodbridge 1' variants → one 'Woodbridge') so " +
      "more areas clear the statistical sample floor and the member's facts " +
      "stop being shattered across near-duplicate names. This is the ONLY way " +
      "the Knowledge Base is ever edited — members never hand-edit it. " +
      "Calling this runs a DRY-RUN only: it computes a before/after report " +
      "(names collapsed, areas that would clear the floor, a review queue of " +
      "lower-confidence near-duplicates that are NEVER auto-applied) and " +
      "returns a mergeRunId. It changes NOTHING. Present the report to the " +
      "member and let them apply it with the Review merges → Yes, clean it up " +
      "buttons. Use when the member asks to clean up / merge / de-duplicate " +
      "their areas, or complains that a neighbourhood has too few sales.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "apply_merge",
    description:
      "Apply a previously proposed Knowledge Base cleanup (merge run). " +
      "GATED: this only works after the member has explicitly approved the " +
      "exact run using the Review merges → Yes, clean it up buttons. Do NOT " +
      "call this on your own initiative or because the member said 'sounds " +
      "good' — direct them to the Review merges button instead.",
    input_schema: {
      type: "object",
      properties: {
        mergeRunId: {
          type: "string",
          description:
            "Id of the dry-run merge run (from clean_knowledge_base) to apply.",
        },
      },
      required: ["mergeRunId"],
    },
  },
  {
    name: "browse_story_leads",
    description:
      "Surface the member's own ranked MARKET STORY LEADS from their latest " +
      "validated upload — the strongest, most video-worthy patterns the " +
      "platform already mined from their data (each pre-anchored on their real " +
      "facts). Returns selectable cards; tapping one hands that lead back to you " +
      "to turn into a script. Use when the member wants to BROWSE ideas, asks " +
      "'what should I make a video about', or picks the 'browse my market " +
      "stories' option. Do NOT build a script from this call — let the member " +
      "pick a card first.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_themes",
    description:
      "Offer the 5 content THEMES (rotation slots: market update, neighbourhood " +
      "fact, contrarian take, do-not, should-you) as a chooser so the member can " +
      "explore ideas by theme. Returns selectable theme cards; tapping one asks " +
      "you to generate idea cards for that theme (generate_theme_ideas). Use when " +
      "the member wants to explore by theme/category but hasn't named one yet. " +
      "No facts are read and nothing is generated until they pick a theme.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "generate_theme_ideas",
    description:
      "Generate a set of validated, BUILDABLE video idea cards for ONE theme " +
      "(rotation slot), each anchored on the member's real facts. Ideas are " +
      "GROUPED / COMPARISON by default (multi-neighbourhood, list, or " +
      "market-wide) — never a single-neighbourhood deep dive unless the member " +
      "explicitly asks for one. Returns selectable cards; tapping one hands that " +
      "idea back to you to build. Use after the member chooses a theme. Do NOT " +
      "build a script from this call — let them pick a card.",
    input_schema: {
      type: "object",
      properties: {
        rotationSlot: {
          type: "string",
          enum: ROTATION_SLOTS as unknown as string[],
          description:
            "The theme to generate ideas for: market_update, " +
            "neighbourhood_fact, contrarian_take, do_not, or should_you.",
        },
        count: {
          type: "number",
          description: "Optional. How many idea cards to generate (1–10, default 5).",
        },
        propertyTypeFocus: {
          type: "string",
          description:
            "Optional. Restrict ideas to one property type the member named " +
            "(e.g. 'Condo', 'Single Family'); omit for any.",
        },
        allowSingleNeighbourhood: {
          type: "boolean",
          description:
            "Optional, default false. Leave false to keep ideas grouped / " +
            "comparison (the Browse default). Set true ONLY when the member " +
            "explicitly asks for a single-neighbourhood deep dive — then " +
            "single-hood idea titles are allowed.",
        },
      },
      required: ["rotationSlot"],
    },
  },
  {
    name: "validate_idea",
    description:
      "Check a video idea the MEMBER typed against their own validated facts and " +
      "return an honest verdict — does their data SUPPORT it, PARTIALLY support " +
      "it (with a sharper framing), or CONTRADICT it. Returns one selectable " +
      "card; when the verdict supports/partially-supports the idea it is " +
      "buildable (tapping hands it back to you), otherwise it offers to reshape " +
      "the idea. Use when the member proposes their own idea and wants to know " +
      "if it holds up. NEVER invent supporting numbers — rely on this tool's " +
      "verdict.",
    input_schema: {
      type: "object",
      properties: {
        idea: {
          type: "string",
          description: "The member's video idea, in their own words.",
        },
        propertyTypeFocus: {
          type: "string",
          description:
            "Optional. The property type the idea is about (e.g. 'Condo'); " +
            "omit for any.",
        },
      },
      required: ["idea"],
    },
  },
];

// ── get_facts executor ──────────────────────────────────────────────────────

export interface GetFactsArgs {
  neighbourhood?: string;
  metric?: string;
}

/**
 * Which fact tier executeGetFacts ended up serving:
 *  - "headline_safe": durable facts safe to headline a video / cite directly.
 *  - "texture_only":  no headline-safe facts matched, so we fell back to
 *    `supporting_texture_only` rows — real numbers, but background colour only.
 *  - "none":          the member has facts/an upload but nothing matched (or
 *    the upload validated with zero usable facts).
 *  - "no_upload":     no validated upload exists yet.
 */
export type GetFactsState =
  | "headline_safe"
  | "texture_only"
  | "none"
  | "no_upload";

export interface GetFactsResult {
  facts: LedgerFact[];
  monthYear: string | null;
  /** Honest machine-readable tier of what `facts` actually contains. */
  state: GetFactsState;
  /**
   * True only when `facts` are texture-only fallbacks. The orchestrator must
   * not present these as headline claims — use them as supporting colour, with
   * the caveat surfaced to the member.
   */
  textureOnly?: boolean;
  note?: string;
}

const TEXTURE_CAVEAT =
  "Supporting texture only — thin sample / not durable enough to headline. " +
  "Use as background colour, not as a standalone market claim.";

function toLedger(
  rows: { id: string; metricName: string; neighbourhood: string; value: string; monthYear: string; caveat?: string }[],
  source: string,
  withCaveat: boolean,
): LedgerFact[] {
  return rows.slice(0, 60).map((f) => ({
    id: f.id,
    label: METRIC_NAME_LABELS[f.metricName] ?? f.metricName,
    neighbourhood: f.neighbourhood,
    value: f.value,
    monthYear: f.monthYear,
    source,
    ...(withCaveat ? { caveat: f.caveat ?? TEXTURE_CAVEAT } : {}),
  }));
}

const SOT_RECONCILED_CAVEAT =
  "Reconciled to the Source-of-Truth aggregate (the canonical value the " +
  "script writer uses). The raw per-fact value differed; cite this one so the " +
  "chat and the script agree.";

// Extract the first signed decimal number from a formatted value string
// ("6.71 months" → 6.71, "$615,000" → 615000, "96.7%" → 96.7). Returns null
// when the string carries no number (so non-numeric facts are skipped).
function parseLeadingNumber(value: string): number | null {
  const m = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number.parseFloat(m[0]) : null;
}

// Rounding-tolerant equality used to decide whether a per-fact value really
// disagrees with its Source-of-Truth aggregate. Shared with the script
// validator via `aggregated-metrics` so chat and the validator never disagree
// about what counts as "the same number".
const sotWithinRounding = sotValuesWithinRounding;

/**
 * Fix 3 — Jarvis chat must read the SAME value from the SAME source the script
 * uses. The script's canonical numbers come from the Source-of-Truth aggregate
 * (`getSourceOfTruthMetrics`), but the per-fact ledger can carry a slightly
 * different per-property-type value (repro: chat said Downtown 6.71 while the
 * script/SoT used 8.8). For each matched ledger fact whose (neighbourhood,
 * metric family) maps to an UNAMBIGUOUS SoT value, if the per-fact value
 * disagrees beyond rounding we override the displayed value with the SoT value
 * (formatted the same way the script renders it) and attach a caveat. We only
 * reconcile when the SoT value is unambiguous for that (hood, family) — a
 * single distinct value across property types, or an explicit "All" rollup —
 * so we never force a detached number onto an apartment fact.
 */
async function reconcileLedgerToSourceOfTruth(
  userId: string,
  uploadId: string,
  facts: LedgerFact[],
): Promise<LedgerFact[]> {
  const neighbourhoods = Array.from(new Set(facts.map((f) => f.neighbourhood)));
  if (neighbourhoods.length === 0) return facts;

  let sotRows: Awaited<ReturnType<typeof getSourceOfTruthMetrics>>;
  try {
    sotRows = await getSourceOfTruthMetrics({
      userId,
      uploadIds: [uploadId],
      neighbourhoods,
    });
  } catch {
    // Never let reconciliation break fact retrieval — fall back to raw values.
    return facts;
  }
  if (sotRows.length === 0) return facts;

  // Group SoT rows by `${hoodLower}|${family}` so we can decide whether the
  // canonical value for that pair is unambiguous.
  const groups = new Map<string, typeof sotRows>();
  for (const r of sotRows) {
    const key = `${r.neighbourhood.toLowerCase()}|${r.metricFamily}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  // A (neighbourhood, family) pair is only canonical when EVERY SoT row for it
  // agrees on one value within rounding. SoT carries multiple metric-key
  // variants per family (e.g. MOI = moiStrict / moiInclusive / rolling3) and
  // multiple property types — and the ledger fact only tells us its family, not
  // which variant or property type it is. So if the variants/types disagree we
  // cannot know which one this fact represents; forcing any single value would
  // risk overriding the fact with the WRONG canonical. In that ambiguous case
  // we leave the raw value untouched. We only override when the family resolves
  // to a single unambiguous value.
  const canonicalFor = (
    hood: string,
    family: string,
  ): { value: number; family: MetricFamily } | null => {
    const list = groups.get(`${hood.toLowerCase()}|${family}`);
    if (!list || list.length === 0) return null;
    // Fix 1 — pick the SAME canonical variant the script cites. For
    // multi-variant families (MOI), resolveCanonicalSotValue selects the
    // board-aligned variant (moiInclusive) at the "All" scope even when the
    // strict/inclusive/rolling variants disagree — so chat shows 8.8, not the
    // raw ledger 6.71. Single-variant families still require unambiguity.
    const value = resolveCanonicalSotValue(list, family as MetricFamily);
    if (value === null) return null;
    return { value, family: list[0].metricFamily };
  };

  return facts.map((f) => {
    const family = detectMetricFamily(f.label);
    if (family === "OTHER") return f;
    const canonical = canonicalFor(f.neighbourhood, family);
    if (!canonical) return f;
    const sotStr = formatValue(canonical.family, canonical.value);
    const sotNum = parseLeadingNumber(sotStr);
    const factNum = parseLeadingNumber(f.value);
    if (sotNum === null || factNum === null) return f;
    if (sotWithinRounding(factNum, sotNum)) return f;
    return {
      ...f,
      value: sotStr,
      caveat: f.caveat ? `${f.caveat} ${SOT_RECONCILED_CAVEAT}` : SOT_RECONCILED_CAVEAT,
    };
  });
}

/**
 * Load the member's latest validated upload's facts, optionally filtered by
 * neighbourhood / metric label substring, and report HONESTLY which of three
 * fact states applies:
 *
 *   1. No validated upload at all          → state "no_upload".
 *   2. Headline-safe facts match the query → state "headline_safe".
 *   3. No headline-safe matches but
 *      texture-only facts exist            → state "texture_only" (fallback,
 *                                            flagged textureOnly + caveat).
 *   …and if nothing at all matches         → state "none".
 *
 * This replaces the old behaviour where a validated-but-zero-headline-safe
 * upload (e.g. the status-bucketing bug) returned a bare empty list that the
 * orchestrator surfaced as a flat "No matching facts" — indistinguishable from
 * "you haven't uploaded anything". Each fact still carries its id + source so
 * the orchestrator can cite and ground on it. Grounding (groundAssistantText)
 * is intentionally untouched — texture facts are real numbers, so they stay
 * citable; the textureOnly flag governs HOW the assistant may use them, not
 * whether their digits are allowed.
 */
export async function executeGetFacts(
  userId: string,
  args: GetFactsArgs,
): Promise<GetFactsResult> {
  const upload = await loadLatestValidatedUpload(userId);
  if (!upload) {
    // No VALIDATED upload — but distinguish "never uploaded" from "uploaded but
    // the latest pass failed to produce anything usable". The latter is the
    // guardrail case (an upload that parsed only rejected facts now fails loudly
    // instead of going green), and Jarvis must state the REAL reason instead of
    // claiming nothing was uploaded.
    const latest = await prisma.marketDataUpload.findFirst({
      where: { userId },
      orderBy: [{ monthYear: "desc" }, { uploadedAt: "desc" }],
      select: { monthYear: true, status: true, validationError: true },
    });
    if (latest && latest.status === "failed") {
      const why = (latest.validationError ?? "").split("\n")[0].trim();
      return {
        facts: [],
        monthYear: null,
        state: "no_upload",
        note:
          `The most recent market-data upload (${latest.monthYear}) failed validation and produced no usable facts, ` +
          `so there's nothing to cite yet.` +
          (why ? ` Reason: ${why}` : "") +
          ` Re-validate that upload (or re-check its column mapping) before relying on these numbers.`,
      };
    }
    if (latest && latest.status === "validating") {
      return {
        facts: [],
        monthYear: null,
        state: "no_upload",
        note: `The most recent market-data upload (${latest.monthYear}) is still validating — check back in a few minutes.`,
      };
    }
    return {
      facts: [],
      monthYear: null,
      state: "no_upload",
      note: "No validated market-data upload yet — upload market data first.",
    };
  }

  const hood = args.neighbourhood?.trim().toLowerCase();
  const metric = args.metric?.trim().toLowerCase();
  const source = `Market data — ${upload.monthYear}`;

  const matches = (f: { neighbourhood: string; metricName: string }) => {
    if (hood && f.neighbourhood.toLowerCase() !== hood) return false;
    if (metric) {
      const label = (METRIC_NAME_LABELS[f.metricName] ?? f.metricName).toLowerCase();
      if (!label.includes(metric) && !f.metricName.toLowerCase().includes(metric)) {
        return false;
      }
    }
    return true;
  };

  // State 2: headline-safe facts.
  const headline = await loadHeadlineSafeFacts(upload.id, upload.monthYear, {
    limit: 400,
    orderByNeighbourhoodFirst: true,
  });
  const headlineMatched = headline.filter(matches);
  if (headlineMatched.length > 0) {
    return {
      facts: await reconcileLedgerToSourceOfTruth(
        userId,
        upload.id,
        toLedger(headlineMatched, source, false),
      ),
      monthYear: upload.monthYear,
      state: "headline_safe",
    };
  }

  // State 3: no headline-safe match → fall back to texture-only facts.
  const texture = await loadTextureOnlyFacts(upload.id, upload.monthYear, {
    limit: 400,
    orderByNeighbourhoodFirst: true,
  });
  const textureMatched = texture.filter(matches);
  if (textureMatched.length > 0) {
    const filterNote =
      hood || metric
        ? "No headline-safe facts match that filter. "
        : "This upload validated, but none of its facts are durable enough to headline. ";
    return {
      facts: await reconcileLedgerToSourceOfTruth(
        userId,
        upload.id,
        toLedger(textureMatched, source, true),
      ),
      monthYear: upload.monthYear,
      state: "texture_only",
      textureOnly: true,
      note:
        filterNote +
        "Returning supporting texture-only facts instead — use these as " +
        "background colour, not as standalone market claims, and tell the " +
        "member they're softer numbers.",
    };
  }

  // Nothing matched at all.
  const hasAnyFacts = headline.length > 0 || texture.length > 0;
  const note = hasAnyFacts
    ? "No facts match that filter — try a broader query (drop the neighbourhood or metric)."
    : "This upload validated but produced no usable facts. The member may need to re-upload or have the data re-validated.";
  return {
    facts: [],
    monthYear: upload.monthYear,
    state: "none",
    note,
  };
}

// ── compute_cut executor (deterministic on-demand cut from raw CSV) ──────────

export interface ComputeCutArgs {
  dimension: string;
  filterPropertyClass?: string;
  filterNeighbourhood?: string;
  filterCity?: string;
  filterStyle?: string;
  filterPriceBracket?: string;
  numericFilters?: unknown;
  monthYear?: string;
}

export interface ComputeCutToolResult {
  facts: LedgerFact[];
  monthYear: string | null;
  classification: RunCutClassification;
  ok: boolean;
  note: string;
}

const COMPUTE_CUT_DIMENSIONS: CutDimension[] = [
  "neighbourhood",
  "city",
  "style",
  "propertyClass",
  "yearBuiltDecade",
  "priceBracket",
  "bedrooms",
  "bathrooms",
];

const COMPUTE_CUT_NUMERIC_FIELDS: CutNumericField[] = [
  "sqft",
  "bedrooms",
  "bathrooms",
  "salePrice",
  "yearBuilt",
];

/**
 * Build the categorical CutFilters from the model's tool args, routing a style
 * FILTER whose value is actually a property CLASS to the propertyClass column.
 *
 * Members with a distinct raw "Property Type" column (e.g. Chris: Single Family
 * / Condo) hold those CLASS values there — NOT in the mapped Style column, which
 * for them carries architectural form. When the model passes such a class value
 * as `filterStyle`, compute_cut honestly refuses it (the value isn't in the
 * style column) and the build trace prints a spurious "No rows match 'Single
 * Family' in this member's style column". Re-routing the class value to
 * propertyClass here fixes the routing at the source so the refusal never fires
 * on a normal build. Genuine style values (2 Storey, Bungalow …) match no class
 * marker and stay on the style dimension untouched.
 */
function buildCutFilters(args: {
  filterPropertyClass?: string;
  filterNeighbourhood?: string;
  filterCity?: string;
  filterStyle?: string;
  filterPriceBracket?: string;
}): CutFilter[] {
  const filters: CutFilter[] = [];
  const pushFilter = (field: CutFilter["field"], value?: string) => {
    const v = value?.trim();
    if (v) filters.push({ field, value: v });
  };
  pushFilter("propertyClass", args.filterPropertyClass);
  pushFilter("neighbourhood", args.filterNeighbourhood);
  pushFilter("city", args.filterCity);
  // Reroute a class-valued style filter to propertyClass (see fn doc), but only
  // when the model didn't already supply an explicit propertyClass filter.
  const styleValue = args.filterStyle?.trim();
  if (styleValue && !args.filterPropertyClass?.trim() && isPropertyClassValue(styleValue)) {
    pushFilter("propertyClass", styleValue);
  } else {
    pushFilter("style", args.filterStyle);
  }
  pushFilter("priceBracket", args.filterPriceBracket);
  return filters;
}

/** Parse + sanitize the raw numericFilters arg from the model into typed filters. */
function parseNumericFilters(raw: unknown): CutNumericFilter[] {
  if (!Array.isArray(raw)) return [];
  const out: CutNumericFilter[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const field = e.field;
    if (
      typeof field !== "string" ||
      !COMPUTE_CUT_NUMERIC_FIELDS.includes(field as CutNumericField)
    )
      continue;
    const min = typeof e.min === "number" && Number.isFinite(e.min) ? e.min : undefined;
    const max = typeof e.max === "number" && Number.isFinite(e.max) ? e.max : undefined;
    if (min == null && max == null) continue;
    out.push({ field: field as CutNumericField, min, max });
  }
  return out;
}

export async function executeComputeCut(
  userId: string,
  args: ComputeCutArgs,
): Promise<ComputeCutToolResult> {
  const dimension = COMPUTE_CUT_DIMENSIONS.includes(args.dimension as CutDimension)
    ? (args.dimension as CutDimension)
    : null;
  if (!dimension) {
    return {
      facts: [],
      monthYear: null,
      classification: "unavailable",
      ok: false,
      note: `Unknown cut dimension "${args.dimension}". Valid dimensions: ${COMPUTE_CUT_DIMENSIONS.join(", ")}.`,
    };
  }

  const filters = buildCutFilters(args);

  const numericFilters = parseNumericFilters(args.numericFilters);

  const monthYear =
    typeof args.monthYear === "string" && /^\d{4}-\d{2}$/.test(args.monthYear.trim())
      ? args.monthYear.trim()
      : undefined;
  const res = await runComputeCut({
    userId,
    params: { dimension, filters, numericFilters, monthYear },
  });
  return {
    facts: res.facts,
    monthYear: res.monthYear,
    classification: res.classification,
    ok: res.ok,
    note: res.note,
  };
}

// ── compute_yoy_cut executor (deterministic year-over-year cut from raw CSV) ──

export interface ComputeYoYCutArgs {
  dimension: string;
  filterPropertyClass?: string;
  filterNeighbourhood?: string;
  filterCity?: string;
  filterStyle?: string;
  filterPriceBracket?: string;
  numericFilters?: unknown;
  monthYear?: string;
}

export interface ComputeYoYCutToolResult {
  facts: LedgerFact[];
  baseMonth: string | null;
  comparisonMonth: string | null;
  comparisonIsFallback: boolean;
  classification: YoYCutClassification;
  ok: boolean;
  note: string;
  deltas: YoYGroupDelta[];
  availableMonths: string[];
}

export async function executeComputeYoYCut(
  userId: string,
  args: ComputeYoYCutArgs,
): Promise<ComputeYoYCutToolResult> {
  const dimension = COMPUTE_CUT_DIMENSIONS.includes(args.dimension as CutDimension)
    ? (args.dimension as CutDimension)
    : null;
  if (!dimension) {
    return {
      facts: [],
      baseMonth: null,
      comparisonMonth: null,
      comparisonIsFallback: false,
      classification: "unavailable",
      ok: false,
      note: `Unknown cut dimension "${args.dimension}". Valid dimensions: ${COMPUTE_CUT_DIMENSIONS.join(", ")}.`,
      deltas: [],
      availableMonths: [],
    };
  }

  const filters = buildCutFilters(args);

  const numericFilters = parseNumericFilters(args.numericFilters);

  const monthYear =
    typeof args.monthYear === "string" && /^\d{4}-\d{2}$/.test(args.monthYear.trim())
      ? args.monthYear.trim()
      : undefined;
  const res = await runYoYCut({
    userId,
    params: { dimension, filters, numericFilters, monthYear },
  });
  return {
    facts: res.facts,
    baseMonth: res.baseMonth,
    comparisonMonth: res.comparisonMonth,
    comparisonIsFallback: res.comparisonIsFallback,
    classification: res.classification,
    ok: res.ok,
    note: res.note,
    deltas: res.deltas,
    availableMonths: res.availableMonths,
  };
}

// ── clean_knowledge_base executor (propose / dry-run only) ──────────────────

export interface CleanKnowledgeBaseResult {
  mergeRunId: string | null;
  rawCount: number;
  canonicalCount: number;
  collapsed: number;
  fuzzyAppliedCount: number;
  reviewQueueCount: number;
  floorClearing: { before: number; after: number };
  topMerges: { canonical: string; variantCount: number }[];
  note: string;
}

/**
 * Propose (dry-run) a Knowledge Base cleanup for the member. Computes the
 * deterministic + conservative fuzzy merge plan and persists it as a DRY_RUN
 * merge run — it mutates NOTHING in the KB. Returns a compact summary the
 * orchestrator can relay so the member can apply it via the gated confirm tap.
 */
export async function executeCleanKnowledgeBase(
  userId: string,
): Promise<CleanKnowledgeBaseResult> {
  const { buildMergeRunReport } = await import("@/lib/kb-merge/merge-run");
  const { mergeRunId, report } = await buildMergeRunReport(userId, {
    source: "jarvis",
    applyFuzzy: true,
    skipIfNoop: true,
  });
  if (!mergeRunId) {
    return {
      mergeRunId: null,
      rawCount: report.rawCount,
      canonicalCount: report.canonicalCount,
      collapsed: 0,
      fuzzyAppliedCount: 0,
      reviewQueueCount: 0,
      floorClearing: {
        before: report.floorClearing.before,
        after: report.floorClearing.after,
      },
      topMerges: [],
      note:
        "The Knowledge Base is already clean — no fragmented names to collapse " +
        "and nothing to review. Nothing to apply.",
    };
  }
  return {
    mergeRunId,
    rawCount: report.rawCount,
    canonicalCount: report.canonicalCount,
    collapsed: report.collapsed,
    fuzzyAppliedCount: report.fuzzyAppliedCount,
    reviewQueueCount: report.reviewQueueCount,
    floorClearing: {
      before: report.floorClearing.before,
      after: report.floorClearing.after,
    },
    topMerges: report.topMerges.slice(0, 10).map((m) => ({
      canonical: m.canonical,
      variantCount: m.variantCount,
    })),
    note:
      "Dry-run only — nothing changed yet. The member must approve it with " +
      "Review merges → Yes, clean it up before anything is applied.",
  };
}

// ── build_script executor ───────────────────────────────────────────────────

export interface BuildScriptArgs {
  title: string;
  rotationSlot: string;
  titlePromise: string;
  linkedFactIds: string[];
  clarityPremise?: string;
  /**
   * CP#2 — the Avatar Stressor name this video is written under (settled with
   * the member before drafting). Resolved to the avatar's coreStress here so the
   * script weaves 1–2 body-only acknowledgements of it. Unknown/absent → no
   * acknowledgement (never invented).
   */
  stressor?: string | null;
  /**
   * Member-confirmed lead-magnet Campaign id (chosen BEFORE drafting). Resolved
   * + ownership-checked here; an unknown/foreign id is treated as "none" (the
   * draft falls back to generic pitch language — never fabricated).
   */
  campaignId?: string | null;
  /**
   * Member-confirmed binge / "watch this next" ContentPlan id (chosen BEFORE
   * drafting). Resolved + ownership-checked here; an idea-stage target is linked
   * but NOT teased (no promising a video that doesn't exist yet).
   */
  bingeVideoId?: string | null;
}

export type RunBuildScriptResult =
  | { ok: false; code: string; message: string }
  | {
      ok: true;
      result: BuildScriptResult;
      title: string;
      rotationSlot: RotationSlotKey;
      linkedFactIds: string[];
      /**
       * Research Reader — the EXTERNAL research source ids actually resolved
       * (ownership-filtered) and grounded into this draft. Carried onto the
       * proposal so Approve & save persists them onto the ContentPlan. Empty
       * on every non-research path.
       */
      researchSourceIds: string[];
      /**
       * Whether a usable binge/next-video target was wired into this draft (the
       * member confirmed an existing, non-idea-stage video). The orchestrator
       * uses this to decide whether to nudge Jarvis to point viewers at a recent
       * video instead of shipping a generic forward-looking close.
       */
      bingeTargetConfigured: boolean;
      /**
       * The member's confirmed choices, resolved + ownership-checked, so the
       * orchestrator can carry them onto the proposal and persist them onto the
       * ContentPlan on Approve & save. Null when the member had/chose none.
       */
      campaignId: string | null;
      bingeVideoId: string | null;
      /**
       * Humanised data period of the facts this draft is grounded on (e.g.
       * "June 2026" — the latest cited upload month). Carried onto the proposal
       * so the standing "verify against your live MLS" UI line can name the
       * member's actual export period. Null when no period could be resolved.
       */
      dataPeriod: string | null;
      /**
       * Defect-2 recap fidelity — the comparison AREAS this build was GIVEN
       * facts for, split by whether the FINAL draft actually NAMES them in its
       * body. The orchestrator feeds these into the post-build tool result so
       * Jarvis's recap reflects what the script truly covers — never claiming a
       * dropped area was "woven in". Both empty on a non-comparison (single-hood)
       * build.
       */
      coveredNeighbourhoods: string[];
      droppedNeighbourhoods: string[];
    };

/**
 * Construct BuildScriptParams from the LLM's ideaCard + the member's live
 * context (mirrors the script-builder-v2 route's loaders) and run the shared
 * buildScript() core. Streams draft tokens via `onToken`. Talking-head only.
 * The lead-magnet Campaign and binge ("watch this next") target are the
 * member's pre-draft choices (ideaCard.campaignId / .bingeVideoId), loaded and
 * fed into the engine exactly like the script-builder-v2 route does.
 */
export async function runBuildScript(args: {
  userId: string;
  ideaCard: BuildScriptArgs;
  /**
   * Research Reader — EXTERNAL research source ids the member attached and
   * chose to ground this draft on. Ownership-filtered here; unknown/foreign ids
   * are silently dropped. Empty/omitted on every non-research path.
   */
  researchSourceIds?: string[];
  onToken: (text: string) => void;
  /** Build-stage transitions (orchestrator maps to an SSE `script_phase` frame). */
  onPhase?: (key: string, label: string) => void;
  /** A failed attempt that will be retried (orchestrator maps to `script_retry`). */
  onViolation?: (info: {
    attempt: number;
    violations: unknown[];
    willRetry: boolean;
  }) => void;
  signal?: AbortSignal;
}): Promise<RunBuildScriptResult> {
  const { userId, ideaCard, onToken, onPhase, onViolation, signal } = args;

  const rotationSlot = ideaCard.rotationSlot as RotationSlotKey;
  if (!ROTATION_SLOTS.includes(rotationSlot)) {
    return {
      ok: false,
      code: "bad_rotation_slot",
      message: `rotationSlot must be one of: ${ROTATION_SLOTS.join(", ")}.`,
    };
  }
  const linkedFactIds = Array.from(
    new Set((ideaCard.linkedFactIds ?? []).filter((s) => typeof s === "string")),
  );
  if (linkedFactIds.length < 1) {
    return {
      ok: false,
      code: "no_facts",
      message: "Link at least one fact id (from get_facts) to build a script.",
    };
  }

  // Cited facts — ownership-filtered, ordered to match linkedFactIds.
  const factRows = await prisma.marketFact.findMany({
    where: { ...EXCLUDE_LEGACY_FAILURE_RATE, id: { in: linkedFactIds }, userId },
    select: {
      id: true,
      neighbourhood: true,
      metricName: true,
      metricValue: true,
      metricValueString: true,
      dateContext: true,
      marketType: true,
      trajectory: true,
      viewerCaveat: true,
      uploadId: true,
      upload: { select: { monthYear: true } },
    },
  });
  if (factRows.length < 1) {
    return {
      ok: false,
      code: "facts_not_found",
      message: "None of those fact ids are in your facts library — run get_facts again.",
    };
  }
  const orderIndex = new Map(linkedFactIds.map((id, i) => [id, i]));
  factRows.sort(
    (a, b) =>
      (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const citedFacts: CitedFact[] = factRows.map((f) => ({
    id: f.id,
    neighbourhood: f.neighbourhood,
    metricName: f.metricName,
    metricLabel: METRIC_NAME_LABELS[f.metricName] ?? f.metricName,
    metricValueString:
      f.metricValueString ?? (f.metricValue !== null ? String(f.metricValue) : ""),
    monthYear: toMonthYearUtc(f.dateContext) || (f.upload?.monthYear ?? ""),
    marketType: f.marketType,
    trajectory: f.trajectory,
    caveat: f.viewerCaveat,
  }));

  // ── Research Reader — load the member's attached EXTERNAL sources ────────
  // Ownership-filtered; unknown/foreign ids are silently dropped. Ordered to
  // match the requested ids. Empty on every non-research path (the array is
  // absent/empty), so this is a no-op for the market-update flow.
  const requestedResearchIds = Array.from(
    new Set(
      (args.researchSourceIds ?? []).filter((s) => typeof s === "string"),
    ),
  );
  let citedResearch: CitedResearch[] = [];
  let resolvedResearchSourceIds: string[] = [];
  if (requestedResearchIds.length > 0) {
    const researchRows = await prisma.researchSource.findMany({
      where: { id: { in: requestedResearchIds }, userId },
      select: {
        id: true,
        title: true,
        type: true,
        sourceRef: true,
        extractedClaims: true,
      },
    });
    const researchOrder = new Map(requestedResearchIds.map((id, i) => [id, i]));
    researchRows.sort(
      (a, b) =>
        (researchOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (researchOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
    const allowedTypes = new Set(["pdf", "text", "url", "image"]);
    citedResearch = researchRows.map((r) => {
      const claims = coerceExtractedClaims(r.extractedClaims);
      const type = allowedTypes.has(r.type)
        ? (r.type as CitedResearch["type"])
        : "text";
      return {
        title: r.title,
        sourceRef: r.sourceRef,
        type,
        thesis: claims.thesis,
        claims: claims.claims,
        stats: claims.stats,
      };
    });
    resolvedResearchSourceIds = researchRows.map((r) => r.id);
  }

  const marketConfig = await loadMarketConfigSummary(userId);
  if (!marketConfig) {
    return {
      ok: false,
      code: "incomplete_setup",
      message: "Finish market setup (onboarding) before building scripts.",
    };
  }
  if (
    !marketConfig.primaryAvatar ||
    (typeof marketConfig.primaryAvatar === "object" &&
      Object.keys(marketConfig.primaryAvatar as Record<string, unknown>).length === 0)
  ) {
    return {
      ok: false,
      code: "incomplete_setup",
      message: "Add your avatar in onboarding (Step 3) before building a script.",
    };
  }

  const neighbourhoodsInScript = Array.from(
    new Set(citedFacts.map((f) => f.neighbourhood).filter(Boolean)),
  );
  const neighbourhoodContext = await getNeighbourhoodContext(
    userId,
    neighbourhoodsInScript,
    "full",
  );
  const uploadIdsForSot = Array.from(
    new Set(factRows.map((f) => f.uploadId).filter(Boolean)),
  );
  const sourceOfTruthMetrics = await getSourceOfTruthMetrics({
    userId,
    uploadIds: uploadIdsForSot,
    neighbourhoods: neighbourhoodsInScript,
  });

  // ── Year-ago ENDPOINTS (shift -12 of each cited month) — parity with the
  // script-builder-v2 route, and INDEPENDENT of the trailing-90-day window ──
  // The members' actual market-update path is this Jarvis tool, and the year-ago
  // injection was wired only into the route — so YoY never reached the generator
  // here and every cited fact was the current month. Surface each cited month's
  // year-ago upload's OWN persisted metrics under their own YYYY-MM header so a
  // "$X a year ago → $Y now" line is fully grounded on BOTH endpoints. This must
  // NOT be coupled to the 90-day read below: that window is correctly OFF
  // whenever a prior month is missing (non-contiguous), but YoY only needs the
  // single year-ago month, which can be present even when 90-day is off. Only
  // validated uploads that genuinely exist contribute — no year-ago upload, no
  // YoY row (omitted silently, never invented). Bounded + best-effort like the
  // 90-day block: any failure simply omits the year-ago rows.
  const citedMonths = Array.from(
    new Set(
      factRows
        .map((f) => f.upload?.monthYear ?? "")
        .filter((m) => /^\d{4}-\d{2}$/.test(m)),
    ),
  );
  const yearAgoMonths = Array.from(
    new Set(
      citedMonths
        .map((m) => shiftMonthYear(m, -12))
        .filter((m): m is string => !!m),
    ),
  );
  if (yearAgoMonths.length > 0) {
    try {
      const yearAgoUploads = await prisma.marketDataUpload.findMany({
        where: {
          userId,
          status: "validated",
          monthYear: { in: yearAgoMonths },
        },
        select: { id: true },
      });
      const yearAgoUploadIds = yearAgoUploads.map((u) => u.id);
      if (yearAgoUploadIds.length > 0) {
        const yearAgoMetrics = await getSourceOfTruthMetrics({
          userId,
          uploadIds: yearAgoUploadIds,
          neighbourhoods: neighbourhoodsInScript,
        });
        sourceOfTruthMetrics.push(...yearAgoMetrics);
        console.log(
          `[jarvis:sot] yearAgo months=${yearAgoMonths.join(",")} uploads=${yearAgoUploadIds.length} metrics=${yearAgoMetrics.length}`,
        );
      } else {
        console.log(
          `[jarvis:sot] yearAgo months=${yearAgoMonths.join(",")} uploads=0 (no validated year-ago month — YoY omitted)`,
        );
      }
    } catch (err) {
      console.warn(
        `[jarvis:sot] yearAgo aggregation failed (omitting): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // ── TRUE pooled trailing-90-day re-aggregation (parity with the
  // script-builder-v2 route) ──────────────────────────────────────────────
  // The Jarvis script tool is the path members actually use for market-update
  // scripts, so the trend feature has to be wired here too — otherwise the
  // 90-day numbers are computed elsewhere but never reach this generator's
  // context, and the draft cites only the current month. Appended onto the
  // SAME `sourceOfTruthMetrics` array so the pooled rows are simultaneously
  // RENDERED for the writer AND become validator anchors (no schema /
  // script-content-rules change). The anchor is the latest cited upload (max
  // calendar monthYear); it defines the 90-day window's leading month.
  //
  // Scope note: the year-ago endpoints are injected SEPARATELY above (their own
  // gated block) so YoY survives a broken 90-day window; this block adds ONLY
  // the trailing-quarter pooled read. Bounded + best-effort: any failure
  // (missing prior months, storage stall, config gap) simply omits the 90-day
  // rows; the script falls back to the monthly + year-ago context with no error
  // surfaced to the member.
  const anchorUpload = factRows
    .map((f) => ({ uploadId: f.uploadId, monthYear: f.upload?.monthYear ?? "" }))
    .filter((u) => u.uploadId && /^\d{4}-\d{2}$/.test(u.monthYear))
    .reduce<{ uploadId: string; monthYear: string } | null>(
      (best, u) => (!best || u.monthYear > best.monthYear ? u : best),
      null,
    );
  if (anchorUpload) {
    try {
      const pooled = await aggregatePooled90dFromDb(anchorUpload.uploadId);
      // Pin the 90-day MOI to the member's monthly MOI variant so the two
      // periods are comparable. "Default" defers to the board-canonical variant
      // (e.g. NTREIS → strict), so a hardcoded inclusive 90-day MOI would
      // mismatch a strict current-month MOI.
      const [memberSettings, mlsRow] = await Promise.all([
        loadMemberMetricSettings(userId),
        prisma.marketConfig.findUnique({
          where: { userId },
          select: { mlsSource: true },
        }),
      ]);
      const moiVariantKey = canonicalVariantKeys(
        mlsRow?.mlsSource ?? null,
        memberSettings,
      ).moiMetricKey;
      const pooledRows = pooled90dToSourceOfTruth(
        pooled,
        neighbourhoodsInScript,
        moiVariantKey,
      );
      sourceOfTruthMetrics.push(...pooledRows);
      console.log(
        `[jarvis:sot] 90d complete=${pooled.complete} window=${pooled.windowMonths.join(",")} moiVariant=${moiVariantKey} metrics=${pooledRows.length}`,
      );
    } catch (err) {
      console.warn(
        `[jarvis:sot] 90d pooled aggregation failed (omitting): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const propertyTypeByHood = buildPropertyTypeLock(citedFacts, null);

  const memberRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });
  const memberFullName = memberRecord?.fullName?.trim() || null;
  const otherMembers = await prisma.user.findMany({
    where: { id: { not: userId }, fullName: { not: null } },
    select: { fullName: true },
  });
  const forbiddenIdentities = otherMembers
    .map((u) => (u.fullName ?? "").trim())
    .filter((n) => n.length > 0 && n.split(/\s+/).length >= 2);

  // ── Resolve the member's pre-draft asset choices (parity with the
  // script-builder-v2 route's ASSIGNED ASSETS loaders) ─────────────────────
  // The lead magnet + binge target are CHOSEN by the member in chat before this
  // runs (Jarvis proposes, the member confirms/swaps). We load them here so the
  // engine builds against the real references instead of generic placeholders.
  // Every lookup is ownership-filtered; an unknown/foreign id resolves to "none"
  // (generic fallback) rather than fabricating anything.
  let assignedCampaign: AssignedCampaign | null = null;
  let resolvedCampaignId: string | null = null;
  if (ideaCard.campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: ideaCard.campaignId, userId, deletedAt: null },
      select: {
        name: true,
        destinationUrl: true,
        leadMagnetUrl: true,
        description: true,
        pitchOneLiner: true,
        audience: true,
      },
    });
    if (campaign) {
      assignedCampaign = {
        name: campaign.name,
        destinationUrl: campaign.destinationUrl,
        leadMagnetUrl: campaign.leadMagnetUrl,
        description: campaign.description,
        pitchOneLiner: campaign.pitchOneLiner,
        audience: campaign.audience,
      };
      resolvedCampaignId = ideaCard.campaignId;
    }
  }

  // Binge target: the chosen plan is LINKED (persisted on save) whenever it
  // exists and is owned — even at idea stage, mirroring the planner's selector.
  // But it is only TEASED (configured) when it's past the idea stage, so the
  // script never promises a next video the member hasn't committed to make.
  let assignedBingeVideo: AssignedBingeVideo | null = null;
  let resolvedBingeVideoId: string | null = null;
  if (ideaCard.bingeVideoId) {
    const binge = await prisma.contentPlan.findFirst({
      where: { id: ideaCard.bingeVideoId, userId, deletedAt: null },
      select: { title: true, theme: true, status: true, youtubeVideoId: true },
    });
    if (binge) {
      resolvedBingeVideoId = ideaCard.bingeVideoId;
      const statusKey = (binge.status ?? "").trim().toLowerCase();
      if (!EARLY_PLAN_STATUSES.has(statusKey)) {
        assignedBingeVideo = {
          title: binge.title,
          theme: binge.theme,
          status: binge.status,
          youtubeVideoId: PUBLISHED_PLAN_STATUSES.has(statusKey)
            ? binge.youtubeVideoId
            : null,
        };
      }
    }
  }
  // `configured` is true ONLY when a usable (existing, non-idea-stage) target
  // resolved — the prompt's BINGE TARGET block + the `binge_target_match`
  // validator key off this exactly as the route does.
  const bingeTargetConfigured = assignedBingeVideo !== null;
  const bingeTargetTitle = assignedBingeVideo?.title ?? null;

  const planContext: PlanContext = {
    id: `jarvis-${Date.now()}`,
    title: ideaCard.title,
    rotationSlot,
    titlePromise: ideaCard.titlePromise,
    visualPeak: null,
    thumbnailCallouts: [],
    subPersonas: null,
    tactileType: null,
    framework: null,
    clarityPremise: ideaCard.clarityPremise ?? null,
    estimatedRuntime: null,
  };

  // CP#2 — resolve the active Avatar Stressor's coreStress (the avatar's worry,
  // in their own voice) so the body can carry 1–2 genuine acknowledgements.
  const stressorName = ideaCard.stressor?.trim() || null;
  const stressorUser = stressorName
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { contentThemes: true },
      })
    : null;
  const activeStressor = stressorName
    ? getActiveThemeStress(stressorUser?.contentThemes, stressorName)
    : null;

  const result = await buildScript({
    planContext,
    citedFacts,
    citedResearch,
    marketConfig,
    neighbourhoodContext,
    sourceOfTruthMetrics,
    propertyTypeByHood,
    shootType: "talking_head",
    assignedCampaign,
    assignedBingeVideo,
    regenerationBrief: null,
    memberFullName,
    activeStressor,
    forbiddenIdentities,
    bingeTargetConfigured,
    bingeTargetTitle,
    signal,
    callbacks: { onToken, onPhase, onViolation },
  });

  // Defect-2: derive what the FINAL draft actually covers from its SPOKEN BODY
  // so the orchestrator can ground Jarvis's recap on reality (covered areas) and
  // force honest disclosure of any area that was dropped (a collapse). We scope
  // to the dialogue (excluding the `## Sources` footnote) using the SAME body
  // extractor the coverage validator uses — a hood listed only in Sources is NOT
  // "covered". City / market-wide rollups are a SCOPE, not a comparison area —
  // excluded, matching the generator's coverage gate.
  const finalScriptLower = stripToDialogue(
    result.script ?? "",
  ).dialogue.toLowerCase();
  const givenNeighbourhoods = Array.from(
    new Set(
      citedFacts
        .map((f) => (f.neighbourhood ?? "").trim())
        .filter(
          (n) =>
            n.length > 0 &&
            !/^(city-?wide|market-?wide|overall|all\s+(?:areas|neighbou?rhoods)|metro|region(?:-?wide)?)$/i.test(
              n,
            ) &&
            n.toLowerCase() !==
              (marketConfig.marketName ?? "").trim().toLowerCase(),
        ),
    ),
  );
  const coveredNeighbourhoods = givenNeighbourhoods.filter((n) =>
    finalScriptLower.includes(n.toLowerCase()),
  );
  const droppedNeighbourhoods = givenNeighbourhoods.filter(
    (n) => !finalScriptLower.includes(n.toLowerCase()),
  );
  // Only meaningful as a recap manifest on a comparison (≥2 given areas); a
  // single-hood deep-dive reports both empty so the orchestrator stays quiet.
  const isComparison = givenNeighbourhoods.length >= 2;

  return {
    ok: true,
    result,
    title: ideaCard.title,
    rotationSlot,
    linkedFactIds: factRows.map((f) => f.id),
    researchSourceIds: resolvedResearchSourceIds,
    bingeTargetConfigured,
    campaignId: resolvedCampaignId,
    bingeVideoId: resolvedBingeVideoId,
    dataPeriod: formatMlsPeriod(anchorUpload?.monthYear ?? null),
    coveredNeighbourhoods: isComparison ? coveredNeighbourhoods : [],
    droppedNeighbourhoods: isComparison ? droppedNeighbourhoods : [],
  };
}

// ── Fact ledger + grounding ─────────────────────────────────────────────────

/**
 * Every digit-run inside a value/source string, normalised to a comparable key
 * (commas stripped, decimals kept): e.g. "$615,000" → "615000", "98.2%" →
 * "98.2", "4.14 MOI" → "4.14". Used to build the set of numbers the assistant
 * is allowed to state.
 */
export function extractNumberKeys(text: string): string[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((m) => m.replace(/,/g, ""));
}

/**
 * Numeric anchors the assistant is allowed to state: every digit-run inside a
 * ledger fact's value string (e.g. "4.14", "98.2", "615000" from "$615,000").
 */
function ledgerNumberSet(ledger: LedgerFact[]): Set<string> {
  const set = new Set<string>();
  for (const f of ledger) for (const k of extractNumberKeys(f.value)) set.add(k);
  return set;
}

/**
 * Ground ungrounded stats out of assistant prose. We only police the high-risk
 * tokens a model invents as fake market stats — currency ($…), percentages
 * (…%), and bare decimals (e.g. 4.14) — leaving ordinary integers (years,
 * counts, list numbers) alone.
 *
 * Allowed numbers come from the thread's fact ledger AND `groundedSourceText` —
 * the cited values from a script proposal's "## Sources" footnote. The script
 * step resolves and cites source-of-truth aggregates (median sale price,
 * sale-to-list, …) that never enter the get_facts ledger; passing its sources
 * here keeps the conversational summary/hooks in agreement with the script
 * instead of redacting the very metrics the script grounds and cites.
 *
 * A token we cannot trace is OMITTED (removed), never replaced with a visible
 * placeholder — members must never see a literal "[unverified]" token. On
 * removal we tidy the leftover spacing/punctuation so the prose stays readable.
 */
export function groundAssistantText(
  text: string,
  ledger: LedgerFact[],
  groundedSourceText = "",
): string {
  const allowed = ledgerNumberSet(ledger);
  for (const k of extractNumberKeys(groundedSourceText)) allowed.add(k);
  const norm = (s: string) => s.replace(/[^\d.]/g, "").replace(/\.$/, "");
  let removed = false;
  const out = text.replace(
    /\$\s?\d[\d,]*(?:\.\d+)?[kKmM]?|\d[\d,]*(?:\.\d+)?\s?%|\b\d[\d,]*\.\d+\b/g,
    (token) => {
      const digits = norm(token);
      if (!digits) return token;
      if (allowed.has(digits)) return token;
      // Also allow when the token's integer/fraction parts each appear (e.g.
      // "$615,000" → "615000" vs a ledger "615000").
      const compact = digits.replace(/\./g, "");
      if (allowed.has(compact)) return token;
      removed = true;
      return "";
    },
  );
  if (!removed) return out;
  // Tidy the holes left by removed tokens: drop now-empty parens, collapse
  // INTERNAL double spaces (the `(?=\S)` lookahead leaves end-of-line trailing
  // spaces alone so Markdown hard breaks survive), and pull punctuation back.
  return out
    .replace(/\(\s*\)/g, "")
    .replace(/ {2,}(?=\S)/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1");
}

function toMonthYearUtc(d: Date | null | undefined): string {
  if (!d) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
