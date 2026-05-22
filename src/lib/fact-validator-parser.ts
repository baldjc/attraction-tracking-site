// Wave 1 Phase 2A — Fact Validator markdown output parser.
//
// The validator outputs MARKDOWN (not JSON) in the exact format defined in
// `4_FACT_VALIDATOR_MODE.md` → OUTPUT FORMAT. This parser is rigid by design:
// the validator prompt is locked, so the structure it emits is known. If the
// validator deviates, we'd rather fail loud (count == 0) than guess.
//
// Three sections, split on H2 headers:
//   ## SUMMARY
//   ## STORY LEADS
//   ## VALIDATED FACTS LIBRARY
//
// Inside each section the field layout is documented in the prompt; see the
// individual parse functions for the exact contract.

export type ParsedUsageClass =
  | "headline_safe"
  | "supporting_texture_only"
  | "rejected";
export type ParsedMarketType =
  | "sellers"
  | "balanced"
  | "buyers"
  | "balanced_high_end"
  | null;
export type ParsedTrajectory =
  | "tightening"
  | "stable"
  | "loosening"
  | "loosening_fast"
  | null;
export type ParsedMetricFamily =
  | "MOI"
  | "BENCHMARK"
  | "PSF"
  | "MEDIAN"
  | "AVG"
  | "DOM"
  | "SP_LP"
  | "INVENTORY"
  | "FAILURE_RATE"
  | "OTHER";
export type ParsedRotationSlot =
  | "market_update"
  | "neighbourhood_fact"
  | "contrarian_take"
  | "do_not"
  | "should_you"
  | null;

export interface ParsedFact {
  neighbourhood: string;
  metricName: string;
  metricFamily: ParsedMetricFamily;
  metricValue: number | null;
  metricValueString: string | null;
  sampleSize: number | null;
  timeWindow: string | null;
  dateContext: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  usageClass: ParsedUsageClass;
  marketType: ParsedMarketType;
  trajectory: ParsedTrajectory;
  moiStrict: number | null;
  moiInclusive: number | null;
  domMedian: number | null;
  domAverage: number | null;
  crebAligned: boolean | null;
  crebDeltaEstimate: string | null;
  viewerCaveat: string | null;
  inventoryGapWithCreb: number | null;
  failureRateFormula: string | null;
  usageNotes: string | null;
  /** Unmapped freeform fields the validator added — kept for `notes` column. */
  extraNotes: string | null;
}

export interface ParsedStoryLead {
  label: string | null;
  isThesisLead: boolean;
  pattern: string;
  dataThreads: string[];
  whyItMatters: string;
  subPersonas: string[];
  rotationSlot: ParsedRotationSlot;
  suggestedFramework: string | null;
  tactileType: string | null;
  scanType: number;
  displayOrder: number;
}

export interface ParsedValidatorOutput {
  summary: string;
  facts: ParsedFact[];
  storyLeads: ParsedStoryLead[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Section splitting
// ─────────────────────────────────────────────────────────────────────────────

function splitSections(md: string): {
  summary: string;
  storyLeads: string;
  facts: string;
} {
  const summaryMatch = md.match(/##\s+SUMMARY\b([\s\S]*?)(?=^##\s+|\Z)/im);
  const leadsMatch = md.match(/##\s+STORY LEADS\b([\s\S]*?)(?=^##\s+|\Z)/im);
  const factsMatch = md.match(
    /##\s+VALIDATED FACTS LIBRARY\b([\s\S]*?)(?=^##\s+|\Z)/im,
  );
  return {
    summary: (summaryMatch?.[1] ?? "").trim(),
    storyLeads: (leadsMatch?.[1] ?? "").trim(),
    facts: (factsMatch?.[1] ?? "").trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Value normalization
// ─────────────────────────────────────────────────────────────────────────────

const MISSING_TOKENS = new Set([
  "n/a",
  "na",
  "missing",
  "null",
  "none",
  "tbd",
  "[paste]",
  "-",
  "",
]);

function isMissing(v: string | null | undefined): boolean {
  if (v == null) return true;
  return MISSING_TOKENS.has(v.toString().trim().toLowerCase());
}

function normalizeNumber(v: string | null): number | null {
  if (isMissing(v)) return null;
  const s = (v ?? "").toString().trim().replace(/[$,%\s]/g, "").replace(/[^\d.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeInt(v: string | null): number | null {
  const n = normalizeNumber(v);
  if (n == null) return null;
  return Math.round(n);
}

function normalizeString(v: string | null): string | null {
  if (isMissing(v)) return null;
  const s = (v ?? "").toString().trim();
  return s.length > 0 ? s : null;
}

function normalizeBool(v: string | null): boolean | null {
  if (isMissing(v)) return null;
  const s = (v ?? "").toString().trim().toLowerCase();
  if (s === "true" || s === "yes") return true;
  if (s === "false" || s === "no") return false;
  return null;
}

function normalizeUsageClass(v: string | null): ParsedUsageClass {
  const s = (v ?? "").toString().trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (s.startsWith("headline")) return "headline_safe";
  if (s.startsWith("supporting")) return "supporting_texture_only";
  return "rejected";
}

function normalizeMarketType(v: string | null): ParsedMarketType {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (isMissing(v)) return null;
  if (s.startsWith("seller")) return "sellers";
  if (s.includes("high")) return "balanced_high_end";
  if (s.startsWith("balanced")) return "balanced";
  if (s.startsWith("buyer")) return "buyers";
  return null;
}

function normalizeTrajectory(v: string | null): ParsedTrajectory {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (isMissing(v)) return null;
  if (s.includes("loosening") && s.includes("fast")) return "loosening_fast";
  if (s.startsWith("tightening")) return "tightening";
  if (s.startsWith("stable")) return "stable";
  if (s.startsWith("loosening")) return "loosening";
  return null;
}

function normalizeMetricFamily(v: string | null): ParsedMetricFamily {
  const s = (v ?? "").toString().trim().toUpperCase().replace(/[\s-]+/g, "_");
  switch (s) {
    case "MOI":
    case "BENCHMARK":
    case "PSF":
    case "MEDIAN":
    case "AVG":
    case "DOM":
    case "SP_LP":
    case "INVENTORY":
    case "FAILURE_RATE":
    case "OTHER":
      return s;
    default:
      return "OTHER";
  }
}

function normalizeRotationSlot(v: string | null): ParsedRotationSlot {
  if (isMissing(v)) return null;
  const s = (v ?? "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s.includes("market") && s.includes("update")) return "market_update";
  if (s.includes("neighbourhood") || s.includes("neighborhood"))
    return "neighbourhood_fact";
  if (s.includes("contrarian")) return "contrarian_take";
  if (s.includes("do_not") || s.includes("dont") || s === "donot") return "do_not";
  if (s.includes("should_you") || s.includes("shouldyou")) return "should_you";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Facts library parser
// ─────────────────────────────────────────────────────────────────────────────

const FACT_FIELD_MAP: Record<string, keyof ParsedFact | "_skip"> = {
  neighbourhood: "neighbourhood",
  metricname: "metricName",
  metricfamily: "metricFamily",
  metricvalue: "metricValue",
  samplesize: "sampleSize",
  timewindow: "timeWindow",
  datecontext: "dateContext",
  sourceurl: "sourceUrl",
  sourcetitle: "sourceTitle",
  usage_classification: "usageClass",
  usageclassification: "usageClass",
  market_type: "marketType",
  markettype: "marketType",
  trajectory: "trajectory",
  moi_strict: "moiStrict",
  moistrict: "moiStrict",
  moi_inclusive: "moiInclusive",
  moiinclusive: "moiInclusive",
  dom_median: "domMedian",
  dommedian: "domMedian",
  dom_average: "domAverage",
  domaverage: "domAverage",
  creb_aligned: "crebAligned",
  crebaligned: "crebAligned",
  creb_delta_estimate: "crebDeltaEstimate",
  crebdeltaestimate: "crebDeltaEstimate",
  viewer_caveat: "viewerCaveat",
  viewercaveat: "viewerCaveat",
  inventory_gap_with_creb: "inventoryGapWithCreb",
  inventorygapwithcreb: "inventoryGapWithCreb",
  failure_rate_formula: "failureRateFormula",
  failurerateformula: "failureRateFormula",
  usage_notes: "usageNotes",
  usagenotes: "usageNotes",
};

function parseFactBlock(block: string): ParsedFact | null {
  // The block starts with "- neighbourhood: <name>" then key: value lines.
  // We tolerate indentation and stray "#" comments per the prompt's example.
  const lines = block.split(/\r?\n/);
  const kv = new Map<string, string>();
  for (const raw of lines) {
    // Strip leading "- " on the first key line + leading whitespace
    const line = raw.replace(/^\s*-\s*/, "").replace(/^\s+/, "");
    if (!line || line.startsWith("#")) continue;
    // Strip inline `# comment` from the value
    const noComment = line.split(/\s+#\s/)[0];
    const colonIdx = noComment.indexOf(":");
    if (colonIdx < 0) continue;
    const key = noComment.slice(0, colonIdx).trim().toLowerCase();
    const value = noComment.slice(colonIdx + 1).trim();
    if (!key) continue;
    kv.set(key, value);
  }

  const neighbourhood = kv.get("neighbourhood");
  if (!neighbourhood || isMissing(neighbourhood)) return null;

  const get = (k: string): string | null => {
    const v = kv.get(k);
    return v == null ? null : v;
  };

  const metricValueRaw = get("metricvalue");
  const metricValue = normalizeNumber(metricValueRaw);
  const metricValueString = normalizeString(metricValueRaw);

  const fact: ParsedFact = {
    neighbourhood: neighbourhood.trim(),
    metricName: normalizeString(get("metricname")) ?? "unknown",
    metricFamily: normalizeMetricFamily(get("metricfamily")),
    metricValue,
    metricValueString: metricValue == null ? metricValueString : null,
    sampleSize: normalizeInt(get("samplesize")),
    timeWindow: normalizeString(get("timewindow")),
    dateContext: normalizeString(get("datecontext")),
    sourceUrl: normalizeString(get("sourceurl")),
    sourceTitle: normalizeString(get("sourcetitle")),
    usageClass: normalizeUsageClass(get("usage_classification") ?? get("usageclassification")),
    marketType: normalizeMarketType(get("market_type") ?? get("markettype")),
    trajectory: normalizeTrajectory(get("trajectory")),
    moiStrict: normalizeNumber(get("moi_strict") ?? get("moistrict")),
    moiInclusive: normalizeNumber(get("moi_inclusive") ?? get("moiinclusive")),
    domMedian: normalizeNumber(get("dom_median") ?? get("dommedian")),
    domAverage: normalizeNumber(get("dom_average") ?? get("domaverage")),
    crebAligned: normalizeBool(get("creb_aligned") ?? get("crebaligned")),
    crebDeltaEstimate: normalizeString(
      get("creb_delta_estimate") ?? get("crebdeltaestimate"),
    ),
    viewerCaveat: normalizeString(get("viewer_caveat") ?? get("viewercaveat")),
    inventoryGapWithCreb: normalizeNumber(
      get("inventory_gap_with_creb") ?? get("inventorygapwithcreb"),
    ),
    failureRateFormula: normalizeString(
      get("failure_rate_formula") ?? get("failurerateformula"),
    ),
    usageNotes: normalizeString(get("usage_notes") ?? get("usagenotes")),
    extraNotes: null,
  };

  // Capture any unmapped keys into `extraNotes` so the validator's freeform
  // additions aren't silently dropped.
  const extras: string[] = [];
  for (const [k, v] of kv.entries()) {
    if (FACT_FIELD_MAP[k] == null && !["neighbourhood"].includes(k)) {
      extras.push(`${k}: ${v}`);
    }
  }
  if (extras.length > 0) fact.extraNotes = extras.join("\n");

  return fact;
}

function parseFacts(section: string): ParsedFact[] {
  if (!section.trim()) return [];
  // Split on the leading "- neighbourhood:" sentinel (case-insensitive,
  // tolerant of any preceding whitespace). The first slice is preamble; drop it.
  const parts = section.split(/(?=^[\s>]*-\s*neighbourhood\s*:)/im);
  const facts: ParsedFact[] = [];
  for (const block of parts) {
    if (!/-\s*neighbourhood\s*:/i.test(block)) continue;
    const f = parseFactBlock(block);
    if (f) facts.push(f);
  }
  return facts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Story Leads parser
// ─────────────────────────────────────────────────────────────────────────────

function detectScanType(pattern: string): number {
  const p = pattern.toLowerCase();
  // 1 — counter-intuitive price-tier anomalies
  if (
    p.includes("tier") &&
    (p.includes("moi") || p.includes("inversion") || p.includes("dead zone"))
  )
    return 1;
  // 2 — cross-segment contrasts
  if (
    /\b(vs\.?|versus|compared)\b/.test(p) ||
    /(inner[-\s]?city.*suburban|detached.*apartment|nw|ne|sw|se).*(nw|ne|sw|se)/.test(p)
  )
    return 2;
  // 3 — above-list clusters
  if (p.includes("above list") || (p.includes("sp/lp") && p.includes("100"))) return 3;
  // 4 — failure clusters
  if (p.includes("failure") || p.includes("expired") || p.includes("terminated")) return 4;
  // 5 — cooling under the surface
  if (
    p.includes("cooling under") ||
    (p.includes("dom rising") && p.includes("price flat"))
  )
    return 5;
  // 6 — tightening pockets in a softening city
  if (p.includes("tightening pocket") || p.includes("below 0.5 moi")) return 6;
  // 7 — glut pockets in a tightening city
  if (p.includes("glut") || (p.includes("4+ moi") && p.includes("tight"))) return 7;
  // 8 — mix-shift mirages
  if (
    p.includes("mix shift") ||
    p.includes("mirage") ||
    /sqft\s*\+.*price\s*-/.test(p)
  )
    return 8;
  return 0; // unmapped — revisit later
}

function parseStoryLeads(section: string): ParsedStoryLead[] {
  if (!section.trim()) return [];
  const parts = section.split(/(?=^###\s*LEAD\s*#)/im);
  const leads: ParsedStoryLead[] = [];
  let displayOrder = 1;
  for (const block of parts) {
    if (!/^###\s*LEAD\s*#/im.test(block)) continue;

    // Heading: "### LEAD #1 — Some Label" (optionally with "THESIS LEAD" marker)
    const headingMatch = block.match(/^###\s*LEAD\s*#\s*\d+\s*[—\-:]?\s*(.+?)$/im);
    const rawHeading = (headingMatch?.[1] ?? "").trim();
    const isThesisLead = /thesis\s+lead/i.test(rawHeading) || /thesis\s+lead/i.test(block.slice(0, 200));
    const label = rawHeading
      .replace(/^thesis\s+lead\s*[:\-—]?\s*/i, "")
      .replace(/\s*\(?thesis\s+lead\)?\s*$/i, "")
      .trim() || null;

    // Field-based extraction.
    function takeField(key: string): string {
      // Match "PATTERN:" ... up to next ALL-CAPS field heading or end.
      const re = new RegExp(
        `^\\s*${key}\\s*:\\s*([\\s\\S]*?)(?=^\\s*(PATTERN|DATA THREADS|WHY IT MATTERS(?: TO VIEWERS)?|SUB-PERSONAS SERVED|ROTATION SLOT FIT|SUGGESTED FRAMEWORK|TACTILE TYPE)\\s*:|^###|\\Z)`,
        "im",
      );
      const m = block.match(re);
      return (m?.[1] ?? "").trim();
    }

    const pattern = takeField("PATTERN").replace(/\s+/g, " ").trim();
    const dataThreadsRaw = takeField("DATA THREADS");
    const dataThreads = dataThreadsRaw
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
      .filter((l) => l.length > 0);
    const whyItMatters = takeField("WHY IT MATTERS TO VIEWERS") || takeField("WHY IT MATTERS");
    const subPersonasRaw = takeField("SUB-PERSONAS SERVED");
    const subPersonas = subPersonasRaw
      .split(/\s*\+\s*|,|;|\n/)
      .map((s) => s.replace(/^\s*[-*•]\s*/, "").trim())
      .filter((s) => s.length > 0 && !isMissing(s));
    const rotationSlot = normalizeRotationSlot(takeField("ROTATION SLOT FIT"));
    const suggestedFramework = normalizeString(takeField("SUGGESTED FRAMEWORK"));
    const tactileType = normalizeString(takeField("TACTILE TYPE"));

    // Skip totally-empty blocks (validator emitted a header but no body).
    if (!pattern && dataThreads.length === 0 && !whyItMatters) continue;

    leads.push({
      label,
      isThesisLead,
      pattern,
      dataThreads,
      whyItMatters: whyItMatters.replace(/\s+/g, " ").trim(),
      subPersonas,
      rotationSlot,
      suggestedFramework,
      tactileType,
      scanType: detectScanType(pattern),
      displayOrder: displayOrder++,
    });
  }

  // Enforce at most one thesis lead: if multiple are marked, keep only the first.
  let seenThesis = false;
  for (const lead of leads) {
    if (lead.isThesisLead) {
      if (seenThesis) lead.isThesisLead = false;
      seenThesis = true;
    }
  }

  return leads;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export function parseValidatorOutput(md: string): ParsedValidatorOutput {
  const { summary, storyLeads, facts } = splitSections(md);
  return {
    summary,
    facts: parseFacts(facts),
    storyLeads: parseStoryLeads(storyLeads),
  };
}
