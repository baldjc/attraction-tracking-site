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
  // Walk the document line-by-line and bucket each line into the section
  // whose H2 header most recently opened. This is more robust than a single
  // regex with lookahead: JS doesn't support `\Z`, and `(?=^##\s+|\Z)` —
  // which a previous version of this parser used — degraded into "stop at any
  // literal Z" because JS treats `\Z` as the literal character Z, prematurely
  // truncating every section.
  const HEADERS: Array<{ key: "summary" | "storyLeads" | "facts"; re: RegExp }> = [
    { key: "summary", re: /^##\s+SUMMARY\b/i },
    { key: "storyLeads", re: /^##\s+STORY\s+LEADS\b/i },
    { key: "facts", re: /^##\s+VALIDATED\s+FACTS\s+LIBRARY\b/i },
  ];
  const buckets: Record<"summary" | "storyLeads" | "facts", string[]> = {
    summary: [],
    storyLeads: [],
    facts: [],
  };
  let current: "summary" | "storyLeads" | "facts" | null = null;
  for (const line of md.split(/\r?\n/)) {
    const hit = HEADERS.find((h) => h.re.test(line));
    if (hit) {
      current = hit.key;
      continue; // don't include the header line itself
    }
    // Any other ## H2 closes the current section.
    if (/^##\s+/.test(line)) {
      current = null;
      continue;
    }
    if (current) buckets[current].push(line);
  }
  return {
    summary: buckets.summary.join("\n").trim(),
    storyLeads: buckets.storyLeads.join("\n").trim(),
    facts: buckets.facts.join("\n").trim(),
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
  let s = (v ?? "").toString().trim();
  // Strip a single pair of surrounding straight or smart quotes — the
  // validator emits YAML-style quoted strings for free-text fields like
  // viewer_caveat / creb_delta_estimate, and we don't want those literal
  // quote characters polluting downstream prompts or exact-string compares.
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if (
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === "\u201C" && last === "\u201D") ||
      (first === "\u2018" && last === "\u2019")
    ) {
      s = s.slice(1, -1).trim();
    }
  }
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
  return factFromKv(kv);
}

function factFromKv(kv: Map<string, string>): ParsedFact | null {
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

function kvFromObject(obj: Record<string, unknown>): Map<string, string> {
  const kv = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase().trim();
    if (!key) continue;
    if (v == null) {
      // Skip — downstream `get()` returning null is equivalent to absent.
      continue;
    }
    if (typeof v === "boolean") { kv.set(key, v ? "true" : "false"); continue; }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) continue;
      kv.set(key, String(v));
      continue;
    }
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed) kv.set(key, trimmed);
      continue;
    }
    // Arrays/objects — coerce to JSON so they end up in extraNotes, not silently dropped.
    try { kv.set(key, JSON.stringify(v)); } catch { /* skip */ }
  }
  return kv;
}

function parseFactObject(obj: unknown): ParsedFact | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const kv = kvFromObject(obj as Record<string, unknown>);
  return factFromKv(kv);
}

/**
 * Phase 2A v2: the FACTS LIBRARY is now a JSON code block. We extract the
 * ```json ... ``` block and JSON.parse it. If extraction or parse fails, we
 * fall back to the legacy markdown parser so historical raw outputs (and any
 * future model regression to markdown) still produce facts instead of zero.
 */
function parseFacts(section: string): ParsedFact[] {
  if (!section.trim()) return [];

  // Try JSON first. Be lenient about the fence form (```json or ``` JSON or
  // just ``` followed by [). Try multiple fences in case the model emits
  // intro prose followed by the array.
  const jsonFromBlock = extractJsonArray(section);
  if (jsonFromBlock) {
    const out: ParsedFact[] = [];
    for (const o of jsonFromBlock) {
      const f = parseFactObject(o);
      if (f) out.push(f);
    }
    if (out.length > 0) return out;
  }

  // Legacy markdown fallback. Strip H3 headings (older format grouped facts
  // under organizational "### Neighbourhood Name" sub-headings).
  const stripped = section.replace(/^###[ \t].*$/gm, "");
  const BOUNDARY = /^\s*-\s+neighbourhood\s*:/im;
  const parts = stripped.split(/(?=^\s*-\s+neighbourhood\s*:)/im);
  const facts: ParsedFact[] = [];
  for (const block of parts) {
    if (!BOUNDARY.test(block)) continue;
    const f = parseFactBlock(block);
    if (f) facts.push(f);
  }
  return facts;
}

/**
 * Extract a JSON array of fact objects from a FACTS LIBRARY section. Tries
 * fenced ```json``` blocks first, then a generic ``` fence containing what
 * looks like a JSON array, then a bare `[ ... ]` block as a last resort.
 * Returns null if nothing parses.
 */
function extractJsonArray(section: string): unknown[] | null {
  const candidates: string[] = [];
  // 1) Fully fenced ```json ... ```
  for (const m of section.matchAll(/```json\s*([\s\S]*?)```/gi)) {
    if (m[1]) candidates.push(m[1]);
  }
  // 2) Generic ``` fences whose content starts with `[`
  if (candidates.length === 0) {
    for (const m of section.matchAll(/```[a-z0-9_-]*\s*([\s\S]*?)```/gi)) {
      const body = (m[1] ?? "").trim();
      if (body.startsWith("[")) candidates.push(body);
    }
  }
  // 3) Unclosed ```json fence — output truncated by max_tokens. Take from the
  //    opener to the end of the section and let the recovery path slice off
  //    the partial trailing object.
  {
    const openIdx = section.search(/```json\b/i);
    if (openIdx >= 0) {
      const afterFence = section.slice(openIdx).replace(/^```json\s*/i, "");
      const closeIdx = afterFence.indexOf("```");
      if (closeIdx < 0) candidates.push(afterFence);
    }
  }
  // 4) Bare array
  if (candidates.length === 0) {
    const start = section.indexOf("[");
    const end = section.lastIndexOf("]");
    if (start >= 0 && end > start) candidates.push(section.slice(start, end + 1));
  }
  for (const raw of candidates) {
    // Strict parse first.
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through to recovery */ }
    // Recovery: take the prefix from `[` to the last `}` that closes a
    // top-level (depth==1) object, then append `]`. This salvages a JSON
    // array truncated mid-object by max_tokens.
    const recovered = recoverTruncatedJsonArray(raw);
    if (recovered) return recovered;
  }
  return null;
}

/**
 * Salvage a JSON array that was truncated mid-object. Walks the string
 * tracking string/escape state and brace depth, remembering the index of
 * the last `}` closed at depth 1 (i.e. a complete top-level element). Then
 * slices `[ ... last_complete_object } ]` and JSON.parses it. Returns null
 * if no complete object exists or the salvage still fails to parse.
 */
function recoverTruncatedJsonArray(raw: string): unknown[] | null {
  const start = raw.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastGoodEnd = -1; // index (in raw) of the `}` closing a depth-1 object
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (ch === "}" && depth === 1) lastGoodEnd = i;
    }
  }
  if (lastGoodEnd < 0) return null;
  const repaired = raw.slice(start, lastGoodEnd + 1) + "]";
  try {
    const parsed = JSON.parse(repaired);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* unrecoverable */ }
  return null;
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

/**
 * Chunk-mode helper: parse a response from a facts-only chunk. The model is
 * instructed to emit just `## VALIDATED FACTS LIBRARY\n\`\`\`json [...] \`\`\``,
 * but it sometimes drops the H2 header or wraps the array in prose. We try the
 * standard splitter first; if no facts come out, we re-parse the whole text as
 * if it were a FACTS LIBRARY section so the JSON-block extractor still fires.
 */
export function parseFactsChunk(text: string): ParsedFact[] {
  const std = parseValidatorOutput(text);
  if (std.facts.length > 0) return std.facts;
  return parseFacts(text);
}

/**
 * Chunk-mode helper: parse a response from the summary+leads-only call. Same
 * idea — fall back to treating the whole text as the STORY LEADS section if
 * the model omitted the H2 header for it.
 */
export function parseSummaryAndLeadsChunk(text: string): {
  summary: string;
  storyLeads: ParsedStoryLead[];
} {
  const std = parseValidatorOutput(text);
  if (std.storyLeads.length > 0 || std.summary.trim()) {
    return { summary: std.summary, storyLeads: std.storyLeads };
  }
  // Fallback: no H2 sections at all. Treat entire text as story-leads block.
  return { summary: "", storyLeads: parseStoryLeads(text) };
}
