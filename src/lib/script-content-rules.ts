/**
 * Script Builder v2 — server-side enforcement of the locked content rules.
 *
 * Runs AFTER Claude finishes streaming, BEFORE the script is saved to
 * `ContentPlan.script`. The streaming route (`/api/ai-tools/script-builder-v2`)
 * re-prompts Claude up to two times when `validateScript()` returns
 * error-severity violations, then surfaces structured violations to the
 * client on the third failure instead of silently saving bad output.
 *
 * The rules mirror `00-Master-Replit-Context.md` ("Locked content rules"
 * section) and `Wave-3-Script-Builder-v2-TalkingHead-Replit-Prompt.md`
 * section 3:
 *
 *   1. No `\bwhy\b` in spoken dialogue (titles + visual/B-roll tags exempt).
 *   2. No avatar-pander phrases anywhere in dialogue (6 banned phrases).
 *   3. No banned dialogue abbreviations (MOI, DOM, PSF, SP/LP) — full
 *      terms only. Abbreviations remain allowed inside [VISUAL: ...] /
 *      [B-ROLL: ...] tags and data overlays.
 *   4. Numerals on the page for $ amounts, percentages, and MOI values
 *      (soft warning — Claude may phonetically spell numbers for delivery,
 *      but the WRITTEN script uses numerals).
 *   5. Hyper-local floor — ≥1 anchored detail per ~120-word window in the
 *      body (soft warning; not a hard block per spec section 3).
 *
 * The "spoken dialogue" surface is what the on-camera talent reads aloud.
 * Anything inside square-bracket production annotations (`[VISUAL: ...]`,
 * `[B-ROLL: ...]`, `[CALLBACK]`, `[LEAD MAGNET 1/3]`, `[CONNECTION — ...]`,
 * `[VALUES PEPPERING — ...]`, `[DATA OVERLAY: ...]`) is NOT dialogue and is
 * exempted from rules 1-3. Bold layer labels (`**DATA**`, `**PSYCHOLOGY**`,
 * `**CLARITY**`) are also exempted — they're structural markers for the
 * editor, not lines anyone reads aloud.
 *
 * Title lines (the `# Title: ...` or `## Title:` lines Claude emits at the
 * top of a script) are exempt from rule 1 (the master context explicitly
 * allows "why" in titles).
 */

export type ScriptViolationSeverity = "error" | "warning";

export type ScriptViolationRule =
  | "no_why"
  | "no_avatar_pander"
  | "no_abbrev_in_dialogue"
  | "numerals_on_page"
  | "hyper_local_floor";

export interface ScriptViolation {
  rule: ScriptViolationRule;
  severity: ScriptViolationSeverity;
  /** Human-readable explanation for the re-prompt loop / UI surfacing. */
  message: string;
  /** Offending text snippet (≤120 chars, with a couple of words of context). */
  snippet?: string;
  /** 1-indexed line number in the original (un-stripped) script text. */
  line?: number;
}

export interface ScriptValidationResult {
  /** `true` iff zero error-severity violations. Warnings do not block. */
  ok: boolean;
  violations: ScriptViolation[];
  metrics: {
    /** Word count of dialogue-only text (after stripping annotations). */
    dialogueWordCount: number;
    /** Number of anchored details counted in the body. */
    anchoredDetailCount: number;
    /**
     * `anchoredDetailCount / (dialogueWordCount / 120)` — the rate
     * checked against the 1-per-120-word floor.
     */
    anchoredDetailsPer120Words: number;
  };
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Strip helpers — separating annotations / titles from spoken dialogue. */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Match any `[TAG: ...]` or `[TAG]` square-bracket annotation, INCLUDING
 * em-dashes / en-dashes after the tag name (e.g. `[CONNECTION — direct]`).
 * Non-greedy on the inner content so adjacent tags don't get merged.
 */
const SQUARE_BRACKET_ANNOTATION_RE = /\[[^\]\n]*\]/g;

/** Bold layer labels the editor sees: `**DATA**`, `**PSYCHOLOGY**`, etc. */
const BOLD_LAYER_LABEL_RE = /\*\*[A-Z][A-Z \-—–/]*\*\*/g;

/**
 * Markdown title / heading lines. Rule 1 ("no why") exempts these because
 * the master context explicitly allows "why" in titles. The script-builder
 * source prompt emits titles as either `# Title: ...`, `## Title: ...`, or
 * `**Title:** ...` at the top of the script, plus subsequent `##` section
 * headers ("Hook", "Lead Magnet", "Body", etc.) that are NOT spoken aloud.
 */
const HEADING_OR_TITLE_LINE_RE =
  /^(?:\s*#{1,6}\s+.*|\s*\*\*Title:\*\*.*|\s*Title:\s*.*)$/i;

/**
 * Lines that are PURELY an annotation (whole line is one or more
 * `[TAG: ...]` blocks, possibly with whitespace). These never contain
 * spoken dialogue and are dropped wholesale rather than partially stripped.
 */
const ANNOTATION_ONLY_LINE_RE =
  /^\s*(?:\[[^\]\n]*\]\s*)+\s*$/;

/**
 * Return the script body with non-dialogue surfaces removed:
 *   - heading / title lines dropped
 *   - annotation-only lines dropped
 *   - bold layer labels stripped inline
 *   - square-bracket annotations stripped inline
 *
 * Whitespace is preserved where possible so line numbers in the returned
 * text still map back to the original via `dialogueLineMap`.
 */
export function stripToDialogue(script: string): {
  dialogue: string;
  /** Map from 1-indexed line in the returned dialogue → 1-indexed line in
   *  the original script. */
  dialogueLineMap: number[];
} {
  const out: string[] = [];
  const map: number[] = [];
  const lines = script.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (HEADING_OR_TITLE_LINE_RE.test(raw)) continue;
    if (ANNOTATION_ONLY_LINE_RE.test(raw)) continue;
    const stripped = raw
      .replace(SQUARE_BRACKET_ANNOTATION_RE, "")
      .replace(BOLD_LAYER_LABEL_RE, "");
    out.push(stripped);
    map.push(i + 1);
  }
  return { dialogue: out.join("\n"), dialogueLineMap: map };
}

/** Trim a snippet to ≤120 chars with a couple of words of left/right context. */
function snippetAround(line: string, match: RegExpExecArray): string {
  const start = Math.max(0, match.index - 40);
  const end = Math.min(line.length, match.index + match[0].length + 40);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < line.length ? "…" : "";
  return `${prefix}${line.slice(start, end).trim()}${suffix}`.slice(0, 120);
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Rule 1 — no "why" in spoken dialogue.                                 */
/* ────────────────────────────────────────────────────────────────────── */

const WHY_RE = /\bwhy\b/gi;

export function checkNoWhy(script: string): ScriptViolation[] {
  const { dialogue, dialogueLineMap } = stripToDialogue(script);
  const violations: ScriptViolation[] = [];
  const lines = dialogue.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    WHY_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WHY_RE.exec(line)) !== null) {
      violations.push({
        rule: "no_why",
        severity: "error",
        message:
          'Found "why" in spoken dialogue. Use one of: "the reason", ' +
          '"what\'s causing this", "what\'s behind this", "here\'s what\'s ' +
          'happening", "the mechanism", "what\'s driving this", "what\'s ' +
          'actually going on". Titles are exempt; only the body is checked.',
        snippet: snippetAround(line, m),
        line: dialogueLineMap[li],
      });
    }
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Rule 2 — no avatar-pander phrases.                                    */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Six banned phrases per master context + source prompt. Matched
 * case-insensitively, with the apostrophe variants Claude sometimes emits
 * (straight `'` vs curly `’`) collapsed before matching.
 */
const AVATAR_PANDER_PHRASES: readonly string[] = [
  "for people like you",
  "families in your situation",
  "i see you",
  "you're not alone",
  "let me be direct with you here",
  "i want you to sit with that",
];

function normalizeApostrophes(text: string): string {
  return text.replace(/[’‘`]/g, "'");
}

export function checkNoAvatarPander(script: string): ScriptViolation[] {
  const { dialogue, dialogueLineMap } = stripToDialogue(script);
  const violations: ScriptViolation[] = [];
  const lines = dialogue.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const normalized = normalizeApostrophes(lines[li]).toLowerCase();
    for (const phrase of AVATAR_PANDER_PHRASES) {
      const idx = normalized.indexOf(phrase);
      if (idx === -1) continue;
      const fakeMatch = {
        index: idx,
        0: lines[li].slice(idx, idx + phrase.length),
      } as unknown as RegExpExecArray;
      violations.push({
        rule: "no_avatar_pander",
        severity: "error",
        message:
          `Found banned avatar-pander phrase "${phrase}". This phrase ` +
          "targets the audience as a segment instead of speaking to them " +
          "as a peer. Rewrite without segmenting the viewer.",
        snippet: snippetAround(lines[li], fakeMatch),
        line: dialogueLineMap[li],
      });
    }
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Rule 3 — no banned dialogue abbreviations.                            */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Abbreviations Claude is forbidden to emit in spoken dialogue. These are
 * the industry shortcuts the source prompt explicitly bans (it lists MOI,
 * SP/LP, DOM; PSF is added here because it's the next most common Calgary
 * MLS shortcut for "price per square foot" and the spec says "Full terms
 * always"). They remain ALLOWED inside [VISUAL: ...] tags / data overlays,
 * which `stripToDialogue` removes before this rule runs.
 */
const BANNED_DIALOGUE_ABBREVS: readonly { pattern: RegExp; abbrev: string }[] =
  [
    { pattern: /\bMOI\b/g, abbrev: "MOI" },
    { pattern: /\bDOM\b/g, abbrev: "DOM" },
    { pattern: /\bPSF\b/g, abbrev: "PSF" },
    // SP/LP — match the slash form and bare "SP" followed by "/LP".
    { pattern: /\bSP\s*\/\s*LP\b/g, abbrev: "SP/LP" },
  ];

export function checkNoAbbrevInDialogue(script: string): ScriptViolation[] {
  const { dialogue, dialogueLineMap } = stripToDialogue(script);
  const violations: ScriptViolation[] = [];
  const lines = dialogue.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (const { pattern, abbrev } of BANNED_DIALOGUE_ABBREVS) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(line)) !== null) {
        violations.push({
          rule: "no_abbrev_in_dialogue",
          severity: "error",
          message:
            `Found banned dialogue abbreviation "${abbrev}". Use the full ` +
            "term in spoken script (e.g. \"months of inventory\" not " +
            "\"MOI\"). Abbreviations remain allowed inside [VISUAL: ...] " +
            "tags and data overlays.",
          snippet: snippetAround(line, m),
          line: dialogueLineMap[li],
        });
      }
    }
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Rule 4 — numerals on the page (soft warning).                         */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Spelled-out money: a number-word sequence followed by "dollars" within
 * a short window. e.g. "seven hundred fifty thousand dollars".
 *
 * This is a SOFT warning. The source prompt allows phonetic spelling for
 * delivery in narrow cases, but the master context's "Use numerals on the
 * page" rule says the written script should use numerals. Flagging gives
 * the re-prompt loop a chance to nudge Claude back to numerals without
 * hard-blocking on edge cases.
 */
const NUMBER_WORDS =
  "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|" +
  "twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|" +
  "twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|" +
  "thousand|million|billion)";
const SPELLED_MONEY_RE = new RegExp(
  `\\b(?:${NUMBER_WORDS}(?:[ -]+(?:and[ -]+)?${NUMBER_WORDS}){0,6})` +
    `[ -]+dollars?\\b`,
  "gi",
);
const SPELLED_PERCENT_RE = new RegExp(
  `\\b(?:${NUMBER_WORDS}(?:[ -]+(?:and[ -]+)?${NUMBER_WORDS}){0,4})` +
    `[ -]+per[ -]?cent(?:age)?\\b`,
  "gi",
);

export function checkNumerals(script: string): ScriptViolation[] {
  const { dialogue, dialogueLineMap } = stripToDialogue(script);
  const violations: ScriptViolation[] = [];
  const lines = dialogue.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (const re of [SPELLED_MONEY_RE, SPELLED_PERCENT_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        violations.push({
          rule: "numerals_on_page",
          severity: "warning",
          message:
            `Found spelled-out number "${m[0].trim()}" where a numeral ` +
            "is expected. The written script should use numerals " +
            "($750,000 / 49.4% / 0.45 MOI) even when the talent reads " +
            "them aloud phonetically.",
          snippet: snippetAround(line, m),
          line: dialogueLineMap[li],
        });
      }
    }
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Rule 5 — hyper-local floor (soft warning).                            */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Anchored-detail detectors:
 *   - dollar amounts ($750,000 / $1.2M / $750k)
 *   - percentages (49.4% / 100%)
 *   - MOI values (0.45 MOI, 2.5 months of inventory)
 *   - year-month dates (April 2026 / March 2025 / Apr 2026)
 *   - neighbourhood names (optional — supplied by caller from MarketConfig)
 */
const DOLLAR_AMOUNT_RE = /\$\s?\d[\d,]*(?:\.\d+)?\s?[KkMm]?\b/g;
const PERCENT_RE = /\b\d+(?:\.\d+)?\s?%/g;
const MOI_VALUE_RE =
  /\b\d+(?:\.\d+)?\s+(?:MOI|months?\s+of\s+inventory)\b/gi;
const YEAR_MONTH_RE = new RegExp(
  "\\b(?:January|February|March|April|May|June|July|August|September|" +
    "October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|" +
    "Oct|Nov|Dec)\\s+\\d{4}\\b",
  "g",
);

/** ~120-word window from spec — counted on dialogue text only. */
const HYPER_LOCAL_WINDOW_WORDS = 120;

export interface HyperLocalOptions {
  /** Neighbourhood vocabulary to count as anchored details. Optional —
   *  when omitted, only money / percent / MOI / date anchors count. */
  neighbourhoods?: readonly string[];
}

function buildNeighbourhoodRegex(neighbourhoods: readonly string[]): RegExp | null {
  const cleaned = neighbourhoods
    .map((n) => n.trim())
    .filter((n) => n.length >= 2)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (cleaned.length === 0) return null;
  // Sort longest-first so "Mount Pleasant" wins over "Mount" when both exist.
  cleaned.sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${cleaned.join("|")})\\b`, "gi");
}

function countAnchoredDetails(
  dialogue: string,
  opts: HyperLocalOptions,
): number {
  const neighbourhoodRe = opts.neighbourhoods
    ? buildNeighbourhoodRegex(opts.neighbourhoods)
    : null;
  let count = 0;
  for (const re of [DOLLAR_AMOUNT_RE, PERCENT_RE, MOI_VALUE_RE, YEAR_MONTH_RE]) {
    re.lastIndex = 0;
    const matches = dialogue.match(re);
    if (matches) count += matches.length;
  }
  if (neighbourhoodRe) {
    const matches = dialogue.match(neighbourhoodRe);
    if (matches) count += matches.length;
  }
  return count;
}

export function checkHyperLocalFloor(
  script: string,
  opts: HyperLocalOptions = {},
): { violations: ScriptViolation[]; metrics: ScriptValidationResult["metrics"] } {
  const { dialogue } = stripToDialogue(script);
  const words = dialogue.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const anchored = countAnchoredDetails(dialogue, opts);
  const ratePer120 =
    wordCount === 0 ? 0 : anchored / (wordCount / HYPER_LOCAL_WINDOW_WORDS);
  const violations: ScriptViolation[] = [];
  if (wordCount >= HYPER_LOCAL_WINDOW_WORDS && ratePer120 < 1) {
    violations.push({
      rule: "hyper_local_floor",
      severity: "warning",
      message:
        `Hyper-local floor not met: ${anchored} anchored detail(s) across ` +
        `${wordCount} dialogue words (${ratePer120.toFixed(2)} per ` +
        `${HYPER_LOCAL_WINDOW_WORDS}-word window; floor is 1). Add ` +
        "neighbourhood names, dollar amounts, percentages, MOI values, or " +
        "year-month dates to keep the body anchored.",
    });
  }
  return {
    violations,
    metrics: {
      dialogueWordCount: wordCount,
      anchoredDetailCount: anchored,
      anchoredDetailsPer120Words: ratePer120,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Umbrella validator.                                                   */
/* ────────────────────────────────────────────────────────────────────── */

export interface ValidateScriptOptions extends HyperLocalOptions {}

/**
 * Run all five rules and return a structured result. Used by the v2
 * streaming route's re-prompt loop:
 *
 *   ok === true  → save the script as-is.
 *   ok === false → re-prompt Claude with the violations list (max 2
 *                  retries). On the third failure, the route surfaces
 *                  `violations` to the client and refuses to save.
 *
 * Warnings (`numerals_on_page`, `hyper_local_floor`) do not affect `ok` —
 * they're informational and surfaced alongside the saved script.
 */
export function validateScript(
  script: string,
  opts: ValidateScriptOptions = {},
): ScriptValidationResult {
  const violations: ScriptViolation[] = [];
  violations.push(...checkNoWhy(script));
  violations.push(...checkNoAvatarPander(script));
  violations.push(...checkNoAbbrevInDialogue(script));
  violations.push(...checkNumerals(script));
  const hyperLocal = checkHyperLocalFloor(script, opts);
  violations.push(...hyperLocal.violations);

  const ok = !violations.some((v) => v.severity === "error");
  return { ok, violations, metrics: hyperLocal.metrics };
}
