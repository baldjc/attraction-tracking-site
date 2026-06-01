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
 *   3. No banned dialogue abbreviations (MOI, DOM, SP/LP) — full
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
  | "hyper_local_floor"
  | "no_misattributed_stats"
  | "unanchored_stat"
  /** Wave 8 Fix 2 — script body fell below the 2,200-dialogue-word floor. */
  | "min_dialogue_length"
  /** Wave 8 Fix 3 — opening announced credibility instead of sideways drop. */
  | "no_announced_credibility"
  /** Wave 8 Fix 4 — "people like us" appeared inside a [LEAD MAGNET …] window. */
  | "people_like_us_in_lm"
  /** B1 — script named a different member's identity (cross-member leak). */
  | "no_other_member_identity"
  /** B1 — an unfilled credibility/identity placeholder survived to output. */
  | "unfilled_credibility_placeholder"
  /** Script fabricated a next-video tease with no usable BINGE TARGET, or
   *  quoted a next-video title that doesn't match the configured target. */
  | "binge_target_match";

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
  // ── Voice-guide additions (Wave 8) ────────────────────────────────
  // Generic AI / corporate tells — no clean mechanical substitution;
  // catching them as validator hits forces Claude to rewrite instead
  // of reaching for the easy cliché.
  "dive into",
  "synergize",
  "circle back",
  "touch base",
  "best practices",
  "robust",
  "streamline",
  "ecosystem",
  "bandwidth",
  "move the needle",
  "unpack",
  "in today's fast-paced",
  "a powerful tool",
  "navigate the complexities of",
  "it's important to note",
  // `leverage` is overloaded — banned as a VERB ("leverage our/the/
  // this/that data"), fine as a NOUN ("buyers have leverage"). The
  // four specific verb-context starts catch the verb use without
  // false-flagging the noun.
  "leverage our",
  "leverage the",
  "leverage this",
  "leverage that",
  // Realtor cringe.
  "won't last",
  "unicorn home",
  "hot hot hot",
  "location, location, location",
  "priced to sell",
  "act now",
  // Hype / urgency.
  "crazy market",
  "don't miss out",
  "once in a lifetime",
];

/**
 * Wave 5 follow-up — phrases the master prompt EXPLICITLY APPROVES as
 * connection language (2_SCRIPT_BUILDER_MODE.md lines 505-518). The
 * `you're not alone in feeling…` form is approved even though
 * `you're not alone` (bare) is on the AVATAR_PANDER_PHRASES list. Without
 * this whitelist we have a rule-vs-prompt conflict: the prompt teaches
 * Claude to use the phrase, then the validator rejects it.
 *
 * Matching strategy: if any approved phrase occurs on a dialogue line
 * and a banned-phrase hit falls INSIDE that approved phrase's character
 * span, the banned hit is suppressed. (We do not blanket-suppress the
 * whole line — "I see you" still flags even if a different approved
 * phrase appears earlier on the same line.)
 */
const APPROVED_CONNECTION_PHRASES: readonly string[] = [
  "you're not alone in feeling",
  "i want you to hear this",
  "here's what i need you to understand",
  "it makes sense that you'd think",
  "i sense that you",
  "i've got you",
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
    // Build the approved-phrase character ranges for this line so we can
    // suppress banned hits that fall inside an approved span (see
    // APPROVED_CONNECTION_PHRASES doc comment).
    const approvedRanges: Array<{ start: number; end: number }> = [];
    for (const approved of APPROVED_CONNECTION_PHRASES) {
      let from = 0;
      while (true) {
        const at = normalized.indexOf(approved, from);
        if (at === -1) break;
        approvedRanges.push({ start: at, end: at + approved.length });
        from = at + approved.length;
      }
    }
    for (const phrase of AVATAR_PANDER_PHRASES) {
      const idx = normalized.indexOf(phrase);
      if (idx === -1) continue;
      // If the banned hit sits inside an approved phrase, skip it.
      const insideApproved = approvedRanges.some(
        (r) => idx >= r.start && idx + phrase.length <= r.end,
      );
      if (insideApproved) continue;
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
 * Abbreviations Claude is forbidden to emit in spoken dialogue. The
 * source prompt explicitly enumerates exactly three at lines 90, 110, and
 * 586 of 2_SCRIPT_BUILDER_MODE.md:
 *
 *   > "The abbreviations MOI, SP/LP, DOM NEVER appear in the spoken
 *   > script body. They are allowed ONLY inside [VISUAL: ...] tags or
 *   > data overlays..."
 *
 * Sticking to the source set deliberately — common real-estate
 * abbreviations the source does NOT enumerate (YoY, MoM, MLS, CMA,
 * CMHC, PSF, YTD, GTA, ATL) are NOT banned here. If any of those slip
 * through during member testing, we extend this list with a documented
 * source reference rather than guessing now.
 */
const BANNED_DIALOGUE_ABBREVS: readonly { pattern: RegExp; abbrev: string }[] =
  [
    { pattern: /\bMOI\b/g, abbrev: "MOI" },
    { pattern: /\bDOM\b/g, abbrev: "DOM" },
    // SP/LP — match the slash form (the only form the source prompt
    // enumerates as banned).
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
/*  Rule 6 (Wave 1): no_misattributed_stats — WARNING severity.           */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Subset of `SourceOfTruthMetric` that this rule needs. Kept local so
 * the rules module doesn't take a hard dependency on the Prisma client
 * generated types (the streaming route passes the full row through).
 */
export interface SourceOfTruthValue {
  metricFamily: string;
  metricValue: number;
}

/**
 * A free-form cited fact string from the planner (e.g. "$625,000",
 * "8.3%", "2.1 months on market"). Cross-checked alongside SoT so a
 * stat the member legitimately surfaced via the planner is NOT flagged
 * as misattributed, and stats matching either source that are
 * attributed to outside bodies still warn.
 */
export interface CitedFactValue {
  /** Raw value string as displayed in the cited-facts block. */
  raw: string;
}

/**
 * Wave 5 — durational time references that look like stat tokens but
 * aren't. Examples from real generations that produced false positives:
 *   - "18 months to show up clearly in the trend"
 *   - "5 months running of the same pattern"
 *   - "over the next 90 days"
 *
 * These are narrative time spans, not market metrics. The naive
 * `\b\d+\s*months?\b` extractor catches them, the SoT comparison fails
 * (no MOI in the data near those values), and a fabrication warning
 * fires on what is actually correct copy. We filter them out UNLESS
 * the surrounding ~10-word window names a recognised market-time
 * metric (months of inventory, days on market, 90-day rolling), in
 * which case the token IS a real market stat and should stay in play.
 *
 * `TIME_REFERENCE_PATTERN` matches any "N (months|days|weeks|years)"
 * fragment in raw form; the per-token check (`isMarketTimeAnchored`)
 * decides whether to keep or drop.
 */
const TIME_REFERENCE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:months?|days?|weeks?|years?)\b/i;

const MARKET_TIME_ANCHORS: RegExp[] = [
  /months?\s+of\s+inventory/i,
  /months?\s+supply/i,
  /days?\s+on\s+market/i,
  /day\s+rolling/i,
  /day-rolling/i,
  /\bMOI\b/, // abbreviation may appear in nearby tags / overlays
  /\bDOM\b/,
];

/**
 * 10-word bidirectional window around `offset` (5 words before, 5 after,
 * plus the token itself). The market-anchor phrasing can sit on either
 * side of the number in spoken English — "4.1 months of inventory" puts
 * the anchor AFTER, while "inventory sitting at 4.1 months" puts it
 * BEFORE — so we look both ways.
 */
function windowAround(dialogue: string, offset: number, wordsEachSide = 5): string {
  const before = dialogue.slice(0, offset).split(/\s+/).slice(-wordsEachSide).join(" ");
  const after = dialogue.slice(offset).split(/\s+/).slice(0, wordsEachSide + 1).join(" ");
  return `${before} ${after}`;
}

/**
 * Whether a "months" / "days" / etc. token in the dialogue is a real
 * market-time metric (months of inventory, days on market, 90-day
 * rolling) — vs. a narrative time span ("18 months to show up clearly").
 * Used to drop unanchored time references BEFORE the fabrication path
 * fires on them. See `TIME_REFERENCE_PATTERN` doc comment for examples.
 */
function isMarketTimeAnchored(dialogue: string, offset: number): boolean {
  const window = windowAround(dialogue, offset);
  return MARKET_TIME_ANCHORS.some((re) => re.test(window));
}

/** Outside-source attribution markers — case-insensitive whole-word match. */
const OUTSIDE_SOURCE_PATTERNS = [
  /\bCREB\b/i,
  /\bCMHC\b/i,
  /\bCalgary\s+Real\s+Estate\s+Board\b/i,
  /\bBank\s+of\s+Canada\b/i,
  /\bBoC\b/,
  /\bStatCan\b/i,
  /\bStatistics\s+Canada\b/i,
  /\baccording\s+to\s+(?:the\s+)?(?:bank|board|government|federal|provincial)\b/i,
];

/**
 * Unit category of a stat token. Used to scope SoT matching by metric
 * family so a "5%" mention doesn't collide with a "$5" SoT value, and a
 * "30 days" mention doesn't collide with a "30 months" inventory figure.
 * This is the key false-positive guard for the WARNING-severity rule.
 */
type StatUnit = "currency" | "percent" | "months" | "days";

interface ExtractedStatToken {
  value: number;
  unit: StatUnit;
  /** Original text, e.g. "$625,000", "21 days", "8.3%", "2.1 months". */
  raw: string;
  /** 0-indexed character offset in the dialogue string. */
  offset: number;
}

/**
 * Map a SoT `metricFamily` to the unit category its `metricValue` is
 * comparable against. Returns null for families with no comparable
 * spoken-script unit (we never check INVENTORY counts as collision-prone
 * plain integers).
 */
function unitForFamily(family: string): StatUnit | null {
  switch (family) {
    case "MEDIAN":
    case "AVG":
    case "BENCHMARK":
    case "PSF":
      return "currency";
    case "SP_LP":
    case "FAILURE_RATE":
      return "percent";
    case "MOI":
      return "months";
    case "DOM":
      return "days";
    default:
      return null;
  }
}

/** Strip thousands separators + currency symbols and parse to a number. */
function parseStatNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,$\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pull every numeric stat token out of the dialogue. We only care about
 * numbers that LOOK like market stats — currency, percentages, "X months",
 * "X days". Plain integers without a suffix (sample sizes, year refs) are
 * skipped to keep false-positive rate low for a WARNING-severity rule.
 */
function extractStatTokens(dialogue: string): ExtractedStatToken[] {
  const tokens: ExtractedStatToken[] = [];
  const patterns: Array<{ re: RegExp; unit: StatUnit }> = [
    { re: /\$\s*([\d,]+(?:\.\d+)?)\s*[KM]?\b/g, unit: "currency" },
    { re: /\b(\d+(?:\.\d+)?)\s*%/g, unit: "percent" },
    { re: /\b(\d+(?:\.\d+)?)\s*months?\b/gi, unit: "months" },
    { re: /\b(\d+(?:\.\d+)?)\s*days?\b/gi, unit: "days" },
    // Wave 12 Fix 1 — MOI values like "0.55 MOI" / "2.42 MOI" are
    // semantically months-of-inventory; extract them so the soften
    // pass can rewrite unanchored MOI fabrications to directional
    // language alongside bare "X months" tokens.
    { re: /\b(\d+(?:\.\d+)?)\s*MOI\b/g, unit: "months" },
  ];
  for (const { re, unit } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(dialogue)) !== null) {
      const rawNum = m[1];
      let n = parseStatNumber(rawNum);
      if (n == null) continue;
      // Handle $X K / $X M shorthand (currency only).
      if (unit === "currency") {
        const tail = m[0].toUpperCase();
        if (/[K]\b/.test(tail)) n = n * 1_000;
        else if (/[M]\b/.test(tail)) n = n * 1_000_000;
      }
      tokens.push({ value: n, unit, raw: m[0], offset: m.index });
    }
  }
  return tokens;
}

/**
 * Normalize a SoT value into the same "comparable units" as the dialogue
 * tokens. SP_LP and FAILURE_RATE are stored as ratios (0.994, 0.083) but
 * written in the script as percentages (99.4%, 8.3%), so we project them
 * up. Other families are already in the script's units.
 */
function normalizeForCompare(family: string, value: number): number[] {
  if (family === "SP_LP" || family === "FAILURE_RATE") {
    return value <= 2 ? [value * 100, value] : [value, value / 100];
  }
  return [value];
}

/** Within 2% tolerance — symmetric, percentage of the larger magnitude. */
function withinTolerance(a: number, b: number): boolean {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return a === b;
  return Math.abs(a - b) / denom <= 0.02;
}

/**
 * 30-word window of dialogue immediately preceding `offset`, used to scan
 * for outside-source attribution markers. We look BACKWARDS only — the
 * attribution typically precedes the number in spoken English ("CREB says
 * the median was $625K"), and forward-looking windows over-fire on the
 * next sentence's framing.
 */
function attributionWindowBefore(
  dialogue: string,
  offset: number,
  wordCount = 30,
): string {
  const before = dialogue.slice(0, offset);
  const words = before.split(/\s+/);
  return words.slice(-wordCount).join(" ");
}

/**
 * WARNING-severity rule. For each numeric stat token in the dialogue:
 *   1. Check if any SoT value matches within 2% tolerance.
 *   2. If yes, check the 30-word window before the token for an outside
 *      attribution marker (CREB, CMHC, etc.).
 *   3. If both true → emit a warning that says "this looks like a member
 *      stat but is attributed to an outside source".
 *
 * Surfaced to the member as advisory; never blocks save, never triggers
 * the re-prompt loop. Spec: WARNING-mode-first per direction.
 */
/**
 * Wave 5 follow-up — pull numeric tokens out of arbitrary prose
 * (neighbourhood-profile text, avatar summary) so the stat validator
 * can accept "median household income $89,000" lines whose anchor
 * lives in the profile, not in the SoT block.
 *
 * Hardened pass: every extracted token carries its UNIT (currency /
 * percent / months / days / unknown), inferred from the `$` prefix,
 * the `%` suffix, or the trailing "months"/"days" word. The tolerance
 * fallback in the validator only accepts a match when units agree, so
 * a stray "0.5" from a JSON id can't whitelist a "$500K" dialogue
 * stat. The verbatim raw-token set still works unit-agnostically
 * (exact `$89,000` → `89000` match), which is safe because the
 * collision probability for an exact multi-digit string match is
 * already very low.
 */
type ProfileNumber = {
  /** Numeric value (commas stripped). */
  value: number;
  /** Canonical normalised string (no `$`, no commas, no `%`, no spaces). */
  normalized: string;
  /** Inferred unit, or `null` when we can't tell from local context. */
  unit: StatUnit | null;
};

const PROFILE_NUMBER_RE =
  /(\$?)(\d[\d,]*(?:\.\d+)?)(\s*%|\s+(?:months?|days?))?/gi;

function extractProfileNumbers(text: string): ProfileNumber[] {
  const out: ProfileNumber[] = [];
  if (!text) return out;
  PROFILE_NUMBER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROFILE_NUMBER_RE.exec(text)) !== null) {
    const [, dollar, num, suffix] = m;
    const normalized = num.replace(/,/g, "");
    const value = Number(normalized);
    if (!Number.isFinite(value)) continue;
    let unit: StatUnit | null = null;
    if (dollar) unit = "currency";
    else if (suffix) {
      const s = suffix.trim().toLowerCase();
      if (s === "%") unit = "percent";
      else if (s.startsWith("month")) unit = "months";
      else if (s.startsWith("day")) unit = "days";
    }
    out.push({ value, normalized, unit });
  }
  return out;
}

export function checkNoMisattributedStats(
  script: string,
  sourceOfTruth: SourceOfTruthValue[] | undefined,
  citedFacts: CitedFactValue[] | undefined = undefined,
  profileText: string[] = [],
): ScriptViolation[] {
  const hasSot = sourceOfTruth && sourceOfTruth.length > 0;
  const hasCited = citedFacts && citedFacts.length > 0;
  // Wave 5 follow-up — even with no SoT/cited facts, if we have profile
  // text we want to be silent (don't flag) rather than scan with no
  // anchors. The original early-return preserves that behaviour.
  if (!hasSot && !hasCited) return [];

  // Wave 5 follow-up — build the profile-sourced numeric set ONCE per
  // validation call. Used as a fallback whitelist before flagging
  // unanchored_stat, so legitimate demographic/lifestyle numbers from
  // the FULL neighbourhood profile (and the avatar summary) don't
  // bounce as fabrications. Tokens carry units so the tolerance check
  // can refuse cross-unit matches (no "$500K" whitelisted by a bare
  // "0.5" from a JSON id).
  const profileTokenSet = new Set<string>();
  const profileNumbers: ProfileNumber[] = [];
  for (const t of profileText) {
    for (const p of extractProfileNumbers(t)) {
      profileTokenSet.add(p.normalized);
      profileNumbers.push(p);
    }
  }
  const { dialogue } = stripToDialogue(script);
  const tokens = extractStatTokens(dialogue);
  if (tokens.length === 0) return [];

  // Flatten BOTH sources into a (family, unit, comparable) list once.
  // The rule cross-checks every spoken stat against the union of
  // (deterministic SoT, member-cited facts) — a number matching either
  // is member-attributable, so if it's attributed to an outside source
  // (CREB/CMHC/BoC) we warn. Families with no comparable spoken-script
  // unit (e.g. INVENTORY counts) are dropped — matching plain integers
  // like "137" against "137 active" is dominated by coincidence at scale.
  const sotComparable: Array<{ family: string; unit: StatUnit; value: number }> = [];
  if (hasSot) {
    for (const sot of sourceOfTruth!) {
      const unit = unitForFamily(sot.metricFamily);
      if (!unit) continue;
      for (const v of normalizeForCompare(sot.metricFamily, sot.metricValue)) {
        sotComparable.push({ family: sot.metricFamily, unit, value: v });
      }
      // Wave 5 — SP/LP derivation acceptance.
      //
      // SP_LP is the sale-price-to-list-price ratio, stored as a fraction
      // (0.967 = 96.7%). The script frequently expresses it as the
      // INVERSE ("selling 3.3% below asking", "5% discount off list") or
      // (above 100%) as a premium ("selling 2.4% above asking"). The
      // naive comparison only matches 96.7%/0.967 — a "3.3% below" line
      // looks like an unanchored fabrication.
      //
      // Push the derived percent values explicitly so the
      // withinTolerance match in the main loop picks them up. The
      // derivation rule itself is documented in the system prompt under
      // "Round-narrative-number anti-pattern" rule 3.
      if (sot.metricFamily === "SP_LP") {
        const ratio = sot.metricValue <= 2 ? sot.metricValue : sot.metricValue / 100;
        const discount = (1 - ratio) * 100;
        if (discount > 0) {
          // "3.3% below asking" / "selling X below list" — push the gap.
          sotComparable.push({ family: "SP_LP_DERIVED", unit: "percent", value: discount });
        } else if (discount < 0) {
          // Premium case — "2.4% above asking".
          sotComparable.push({ family: "SP_LP_DERIVED", unit: "percent", value: -discount });
        }
      }
    }
  }
  if (hasCited) {
    // Parse each cited-fact raw string ("$625,000", "8.3%", "2.1 months")
    // with the same extractor used for the script body, so units stay
    // consistent on both sides of the comparison.
    for (const c of citedFacts!) {
      if (!c.raw) continue;
      for (const t of extractStatTokens(c.raw)) {
        sotComparable.push({ family: "CITED_FACT", unit: t.unit, value: t.value });
      }
    }
  }

  const violations: ScriptViolation[] = [];
  const seen = new Set<string>(); // dedupe identical "raw|family|kind"
  for (const tok of tokens) {
    // Wave 5 — drop narrative time references ("18 months to show up
    // clearly", "over the next 90 days") that look like stat tokens but
    // aren't. Only applies to month/day units; currency + percent are
    // unaffected. See `TIME_REFERENCE_PATTERN` for full rationale.
    if (
      (tok.unit === "months" || tok.unit === "days") &&
      TIME_REFERENCE_PATTERN.test(tok.raw) &&
      !isMarketTimeAnchored(dialogue, tok.offset)
    ) {
      continue;
    }

    // Only compare against SoT entries whose family produces the same
    // spoken unit as the token. This is what stops "5%" colliding with
    // a "$5K" SoT row or "30 days" colliding with "30 months" inventory.
    const match = sotComparable.find(
      (s) => s.unit === tok.unit && withinTolerance(s.value, tok.value),
    );

    // Path A — unmatched stat (fabrication suspect). Token's unit has
    // matchable SoT/cited-fact entries (i.e. we have anchors to compare
    // against in that unit), but no anchor matches within 2%. Surfaced
    // as a WARNING (advisory, never blocks save) so the member sees a
    // "this number isn't in your data" cue without the re-prompt loop
    // firing on false positives. If we have zero anchors of this unit,
    // we skip — that means the rule can't speak to fabrication here.
    if (!match) {
      const haveAnchorsOfUnit = sotComparable.some((s) => s.unit === tok.unit);
      if (!haveAnchorsOfUnit) continue;

      // Wave 5 follow-up — profile-sourced whitelist. Before flagging
      // this token as fabricated, check whether its raw form appears
      // verbatim in the neighbourhood/avatar profile text OR whether
      // any UNIT-MATCHED profile number is within the 2% tolerance
      // band. Profile text holds demographic numbers (median income,
      // household size, year-built ranges) that legitimately surface
      // in dialogue but are NOT in the SoT/cited-facts blocks.
      //
      // Verbatim match is unit-agnostic (exact multi-digit string
      // collision is rare enough to trust). Tolerance match is
      // unit-aware so a stray identifier digit in profile JSON can't
      // mask a real fabrication of a different unit.
      const normalizedRaw = tok.raw.replace(/[$,%\s]/g, "");
      if (profileTokenSet.has(normalizedRaw)) continue;
      const profileMatch = profileNumbers.some(
        (p) => p.unit === tok.unit && withinTolerance(p.value, tok.value),
      );
      if (profileMatch) continue;

      const dedupeKey = `${tok.raw}|UNANCHORED|${tok.unit}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      violations.push({
        rule: "unanchored_stat",
        // Wave 5 — promoted from "warning" to "error" so the existing
        // re-prompt loop fires on fabricated stats. Safe to promote now
        // that the time-reference filter and SP/LP derivation
        // acceptance above have eliminated the known false-positive
        // sources (narrative time spans + inverse-ratio percentages).
        severity: "error",
        message:
          `Stat "${tok.raw}" doesn't match any value in your deterministic ` +
          `source-of-truth metrics or the cited-facts block (within 2% tolerance). ` +
          `Either re-anchor to a real number from the data, or remove the stat — ` +
          `the channel's edge is precision, not vibes.`,
        snippet: dialogue
          .slice(Math.max(0, tok.offset - 60), tok.offset + tok.raw.length + 20)
          .trim(),
      });
      continue;
    }

    // Path B — misattribution. Token matches an anchor (member's own
    // data), but the 30-word backward window names CREB/CMHC/BoC/etc.
    const window = attributionWindowBefore(dialogue, tok.offset);
    const outsideMarker = OUTSIDE_SOURCE_PATTERNS.find((p) => p.test(window));
    if (!outsideMarker) continue;

    const key = `${tok.raw}|${match.family}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const matched = window.match(outsideMarker)?.[0] ?? "(outside source)";
    violations.push({
      rule: "no_misattributed_stats",
      // Wave 5 — promoted from "warning" to "error". Misattribution is
      // a hard editorial fail (gives the channel's edge away to CREB /
      // CMHC / BoC). The re-prompt loop now corrects it instead of
      // surfacing as advisory-only.
      severity: "error",
      message:
        `Stat "${tok.raw}" appears to match your own deterministic ${match.family} ` +
        `aggregation, but is attributed to "${matched}" in the dialogue. ` +
        `Re-attribute to your own market analysis (e.g. "from the data we ran this month") ` +
        `so the channel's edge isn't given away to an outside source.`,
      snippet: dialogue.slice(Math.max(0, tok.offset - 60), tok.offset + tok.raw.length + 20).trim(),
    });
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Wave 8 Fix 2 — min_dialogue_length (ERROR).                           */
/*                                                                        */
/*  The script body must clear 2,200 dialogue words. Anything shorter is  */
/*  a structural fail — the runtime can't hit the channel target without  */
/*  it. Counts ONLY dialogue (post-strip), so bracket annotations and     */
/*  heading lines don't pad the total.                                    */
/* ────────────────────────────────────────────────────────────────────── */

export const MIN_DIALOGUE_WORDS = 2200;

export function checkMinDialogueLength(script: string): ScriptViolation[] {
  const { dialogue } = stripToDialogue(script);
  const wordCount = dialogue.split(/\s+/).filter(Boolean).length;
  if (wordCount >= MIN_DIALOGUE_WORDS) return [];
  return [
    {
      rule: "min_dialogue_length",
      severity: "error",
      message:
        `Script body is ${wordCount} dialogue words, below the ${MIN_DIALOGUE_WORDS}-word floor. ` +
        `Expand using the FULL neighbourhood profile content already in your system prompt — ` +
        `add named anchors, specific data points, editorial reactions, and back-half synthesis. ` +
        `DO NOT pad with filler, restated thesis, or generic framing.`,
    },
  ];
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Wave 8 Fix 3 — no_announced_credibility (ERROR).                      */
/*                                                                        */
/*  The voice guide bans announced credibility ("Hi my name is X, I've    */
/*  been a top agent for N years"). Credentials only land sideways,       */
/*  woven into Revelation. Flagged patterns are channel-banned wherever   */
/*  they appear, but the most common offence site is the opening, so      */
/*  the retry hint points the model back at the ARC Revelation rules.    */
/* ────────────────────────────────────────────────────────────────────── */

const ANNOUNCED_CREDIBILITY_PATTERNS: RegExp[] = [
  // "I've been a top agent for 22 years" / "leading agent for N years"
  /\b(?:i'?ve\s+been|been)\s+(?:a\s+)?(?:top|leading|best|number\s*one)\s+(?:real\s*estate\s+)?agent\s+for\s+\d+\+?\s+years?\b/i,
  // "After 22 years in real estate" — the announced front-load
  /\bafter\s+\d+\+?\s+years?\s+in\s+(?:real\s*estate|the\s+real\s*estate\s+business|the\s+(?:business|industry))\b/i,
  // First-person introduction: "Hi, my name is …" / "Hello, I'm Jared …"
  /\b(?:hi|hello|hey),?\s+(?:my\s+name\s+is|i'?m)\s+[A-Z][a-z]+/i,
  // Bare "my name is <Name>" intro at the start of a line
  /^\s*my\s+name\s+is\s+[A-Z][a-z]+/im,
];

export function checkNoAnnouncedCredibility(script: string): ScriptViolation[] {
  const { dialogue, dialogueLineMap } = stripToDialogue(script);
  const violations: ScriptViolation[] = [];
  const seen = new Set<string>();
  for (const re of ANNOUNCED_CREDIBILITY_PATTERNS) {
    const m = dialogue.match(re);
    if (!m || m.index === undefined) continue;
    const key = m[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Map character offset → 1-indexed dialogue line → original line.
    const before = dialogue.slice(0, m.index);
    const dialogueLi = before.split("\n").length - 1;
    const originalLine = dialogueLineMap[dialogueLi];
    violations.push({
      rule: "no_announced_credibility",
      severity: "error",
      message:
        `Announced credibility detected: "${m[0]}". The Revelation beat in your ARC ` +
        `opening must drop credibility SIDEWAYS, not announce it. Use one of: ` +
        `"Our team helps a family move every [X] hours" (use the real number from ` +
        `MarketConfig.teamCredentials if available, else "every few days"), ` +
        `"Weekly since June 2020", "What I've learned in helping thousands of ` +
        `families through this market is...", or "After helping [X] families ` +
        `move through this exact pattern, here's what I know...". Sideways = ` +
        `woven into the explanation, never the first sentence, never a self-introduction.`,
      snippet: dialogue
        .slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)
        .trim(),
      line: originalLine,
    });
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Wave 8 Fix 4 — people_like_us_in_lm (ERROR).                          */
/*                                                                        */
/*  The phrase "people like us" is a high-impact identity move and must   */
/*  appear OUTSIDE any lead-magnet placement (voice guide). Flag any      */
/*  occurrence within 100 characters of a [LEAD MAGNET …] tag (in either  */
/*  direction). Distance is measured on the RAW script text (with tags    */
/*  intact), since the tag boundary is what defines the LM window.        */
/* ────────────────────────────────────────────────────────────────────── */

const LEAD_MAGNET_TAG_RE = /\[LEAD\s*MAGNET[^\]]*\]/gi;
const PEOPLE_LIKE_US_RE = /\bpeople\s+like\s+us\b/gi;
const PEOPLE_LIKE_US_LM_WINDOW = 100;

export function checkPeopleLikeUsInLm(script: string): ScriptViolation[] {
  const lmTagOffsets: Array<{ start: number; end: number }> = [];
  for (const m of script.matchAll(LEAD_MAGNET_TAG_RE)) {
    if (m.index === undefined) continue;
    lmTagOffsets.push({ start: m.index, end: m.index + m[0].length });
  }
  if (lmTagOffsets.length === 0) return [];
  const violations: ScriptViolation[] = [];
  const seen = new Set<number>();
  for (const m of script.matchAll(PEOPLE_LIKE_US_RE)) {
    if (m.index === undefined) continue;
    const phraseStart = m.index;
    const phraseEnd = m.index + m[0].length;
    const nearLm = lmTagOffsets.find(
      ({ start, end }) =>
        phraseStart - end <= PEOPLE_LIKE_US_LM_WINDOW &&
        start - phraseEnd <= PEOPLE_LIKE_US_LM_WINDOW,
    );
    if (!nearLm) continue;
    if (seen.has(phraseStart)) continue;
    seen.add(phraseStart);
    violations.push({
      rule: "people_like_us_in_lm",
      severity: "error",
      message:
        `The phrase "people like us" must appear outside lead magnet placements per voice guide. ` +
        `It's a high-impact identity move that loses power when used inside conversion pitches. ` +
        `Move it to a content beat (data peak, clarity moment) or remove it from this script.`,
      snippet: script
        .slice(Math.max(0, phraseStart - 40), phraseEnd + 40)
        .replace(/\s+/g, " ")
        .trim(),
    });
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  B1 — presenter-identity guardrails.                                   */
/* ────────────────────────────────────────────────────────────────────── */

/** Literal placeholders the prompt emits when identity/credibility is unset. */
const IDENTITY_PLACEHOLDERS = [
  "[SET YOUR CREDIBILITY IN ONBOARDING]",
  "[SET YOUR NAME IN ONBOARDING]",
];

/**
 * B1 — an unfilled identity/credibility placeholder must never ship. The
 * Script Builder injects these tokens (instead of borrowing another member's
 * numbers) when the resolved member hasn't completed onboarding Step 5; the
 * validator blocks them at ERROR so the member fills in real data first.
 */
function checkUnfilledCredibilityPlaceholder(
  script: string,
): ScriptViolation[] {
  const violations: ScriptViolation[] = [];
  for (const token of IDENTITY_PLACEHOLDERS) {
    if (script.includes(token)) {
      violations.push({
        rule: "unfilled_credibility_placeholder",
        severity: "error",
        message:
          `The script still contains the placeholder "${token}". The presenter ` +
          `must set their identity/credibility in onboarding before this script ` +
          `can ship — never fabricate or borrow credentials to fill it.`,
        snippet: token,
      });
    }
  }
  return violations;
}

/**
 * Common English words that are ALSO frequent surnames. A bare match of one of
 * these ("close to the LRT", "a brown brick bungalow", "the deal will close")
 * must never be read as a cross-member identity leak — only a full first+last
 * name or a clearly name-positioned proper noun counts. Lowercased.
 */
const COMMON_SURNAME_WORDS = new Set([
  "close", "brown", "gray", "grey", "white", "black", "smith", "baker",
  "miller", "hunt", "hall", "young", "king", "bishop", "page", "wood",
  "ford", "fox", "wolf", "lane", "park", "hill", "stone", "rose", "may",
  "march", "june", "august", "summer", "winter", "north", "south", "east",
  "west",
]);

/**
 * Intro / self-introduction cues that mark the IMMEDIATELY FOLLOWING word as a
 * personal name ("I'm Jared", "with Chamberlain", "this is Jared"). Tested
 * against the text right before a candidate token. Case-insensitive.
 */
const NAME_INTRO_CUE =
  /(?:^|[^A-Za-z])(?:i['’]m|i am|with|by|meet|from|at|name['’]?s?(?:\s+is)?|this is|presenter|agent|realtor)\s*$/i;

/**
 * B1 — cross-member identity leak guard. Rejects (ERROR) when a script names
 * ANOTHER member's identity. `forbiddenIdentities` is built from real member
 * records (`User.fullName` of every other member) — NOT from prompt or
 * style-example content — so a hit means a genuine cross-member leak.
 *
 * Matching is deliberately conservative to avoid flagging common English words
 * that happen to be surnames ("close", "brown", "smith", ...):
 *   - Full first+last names match as ONE unit (distinctive → case-insensitive).
 *   - A single token only trips when it (a) is a proper noun matched
 *     CASE-SENSITIVELY on word boundaries (so lowercase "close" can never hit a
 *     surname), (b) is NOT a common-English word, (c) is NOT part of the current
 *     presenter's own name, and (d) sits in a NAME-LIKE context: preceded by an
 *     intro cue ("I'm"/"with"/...) for any token, or — for a surname (last
 *     token) — followed by a capitalized brand continuation ("Chamberlain Real
 *     Estate", "Chamberlain Group").
 */
function checkNoOtherMemberIdentity(
  script: string,
  opts: ValidateScriptOptions,
): ScriptViolation[] {
  const violations: ScriptViolation[] = [];
  const forbidden = opts.forbiddenIdentities ?? [];
  if (forbidden.length === 0) return violations;
  const current = (opts.currentMemberName ?? "").trim().toLowerCase();
  // Tokens of the current presenter's own name — never flag these, even if
  // another member happens to share a first/last name with them.
  const currentTokens = new Set(
    current.split(/\s+/).filter((t) => t.length > 0),
  );
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const pushViolation = (label: string, index: number, message: string): void => {
    violations.push({
      rule: "no_other_member_identity",
      severity: "error",
      message,
      snippet: script
        .slice(Math.max(0, index - 30), index + label.length + 30)
        .replace(/\s+/g, " ")
        .trim(),
    });
  };

  // Full multi-token name appearing verbatim — distinctive enough to match
  // case-insensitively as a whole phrase (e.g. "Jared Chamberlain").
  const matchWholePhrase = (needle: string): RegExpExecArray | null =>
    new RegExp(`\\b${escape(needle)}\\b`, "i").exec(script);

  // A single capitalized proper-noun token in a name-like position. CASE
  // SENSITIVE, so a lowercase common word ("close to the LRT") never matches.
  const matchContextualToken = (
    properToken: string,
    allowBrandAfter: boolean,
  ): RegExpExecArray | null => {
    const re = new RegExp(`\\b${escape(properToken)}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(script)) !== null) {
      const before = script.slice(Math.max(0, m.index - 24), m.index);
      const after = script.slice(
        m.index + properToken.length,
        m.index + properToken.length + 24,
      );
      const introBefore = NAME_INTRO_CUE.test(before);
      // Brand / full-name continuation: followed by another capitalized word
      // ("Chamberlain Real Estate", "Chamberlain Group", "Chamberlain & Co").
      const brandAfter =
        allowBrandAfter && /^\s+(?:&\s+)?[A-Z][A-Za-z]/.test(after);
      if (introBefore || brandAfter) return m;
    }
    return null;
  };

  const seenFull = new Set<string>();
  const seenToken = new Set<string>();

  for (const raw of forbidden) {
    const name = raw.trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (lower === current) continue; // the current presenter's OWN name is fine
    const tokens = name.split(/\s+/);
    if (tokens.length < 2) continue; // full (multi-token) names only

    // 1) Whole-phrase full-name match — catches "Jared Chamberlain" outright.
    if (!seenFull.has(lower)) {
      const m = matchWholePhrase(lower);
      if (m) {
        seenFull.add(lower);
        pushViolation(
          name,
          m.index,
          `The script names "${name}", which belongs to a different member. A ` +
            `script must use ONLY the current presenter from the "## PRESENTER ` +
            `IDENTITY" block. Remove this name and any credentials attached to it.`,
        );
        continue; // full name caught — don't also flag its individual tokens
      }
    }

    // 2) Distinctive individual tokens (first/last name) leaking on their own,
    //    only in a name-like context and never a common English word.
    tokens.forEach((tok, ti) => {
      if (tok.length < 4) return;
      if (!/^[a-zA-Z]+$/.test(tok)) return;
      const lowerTok = tok.toLowerCase();
      if (COMMON_SURNAME_WORDS.has(lowerTok)) return;
      if (currentTokens.has(lowerTok)) return;
      if (seenToken.has(lowerTok)) return;
      // Search for the proper-noun form. Preserve the original internal casing
      // when it's already capitalized (so "McDonald"/"DeVries" match exactly);
      // only synthesize a leading cap when the record stored it all-lowercase.
      const proper = /^[A-Z]/.test(tok)
        ? tok
        : lowerTok.charAt(0).toUpperCase() + lowerTok.slice(1);
      const isSurname = ti === tokens.length - 1;
      const m = matchContextualToken(proper, isSurname);
      if (m) {
        seenToken.add(lowerTok);
        pushViolation(
          proper,
          m.index,
          `The script uses the name "${m[0]}", which is part of another ` +
            `member's identity. Use ONLY the presenter from the "## PRESENTER ` +
            `IDENTITY" block — replace this name.`,
        );
      }
    });
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Rule — binge_target_match (ERROR severity).                           */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Phrases that tease a SPECIFIC upcoming video. Kept deliberately tight to
 * keep the false-positive rate low — every form here unambiguously points
 * the viewer at a "next video", which is only legitimate when a real binge
 * target is configured. Stateless (no `/g`), so `.test()`/`.exec()` are safe
 * to reuse across calls.
 */
export const NEXT_VIDEO_PATTERNS: readonly RegExp[] = [
  /\bnext video\b/i, // covers "my/the/this next video"
  /\bwatch this next\b/i,
  /\bthis next one\b/i,
  /\bnext one for you\b/i,
];

// Common words stripped before comparing a quoted title to the real binge
// title — they carry no distinctive signal and would mask a genuine mismatch.
const BINGE_TITLE_STOPWORDS = new Set([
  "this",
  "that",
  "your",
  "with",
  "from",
  "what",
  "when",
  "video",
  "watch",
  "next",
  "here",
  "they",
  "them",
  "were",
  "will",
  "about",
  "into",
  "over",
  "the",
  "and",
  "for",
  "you",
]);

/** Distinctive (≥4-char, non-stopword) lowercase tokens of a title string. */
function bingeDistinctiveTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const tok of s.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
    if (!BINGE_TITLE_STOPWORDS.has(tok)) out.add(tok);
  }
  return out;
}

// A quoted phrase that DIRECTLY follows an explicit next-video cue — the shape
// a fabricated next-video TITLE takes (e.g. `next video "The Airdrie Flip"`,
// `video titled "..."`, `video called "..."`). The cue MUST be next-video
// anchored: bare `called "..."` / `titled "..."` are excluded because scripts
// say "a strategy called …" in normal dialogue, and double quotes are used
// heavily for viewer-thought / emphasis (e.g. `they think "okay, the zone
// matters more"`) — none of which are preceded by a next-video cue. Straight +
// curly double quotes; single quotes excluded (contractions / possessives).
const TITLE_CUE_QUOTE_RE =
  /(?:next video|next one|video (?:titled|called|named))\b[\s:,()–—-]*[“"]([^“”"\n]{3,80})[”"]/gi;

/**
 * binge_target_match — prevents the script from fabricating a "next video"
 * tease.
 *
 *   bingeTargetConfigured === undefined → INERT (caller didn't resolve binge
 *     context; don't guess).
 *   bingeTargetConfigured === false → ANY next-video reference is a
 *     fabrication (no target exists) → ERROR.
 *   bingeTargetConfigured === true → a clearly-quoted title appearing on a
 *     line that also teases the next video must share at least one distinctive
 *     token with the real `bingeTargetTitle`; otherwise it's pointing at a
 *     different/invented video → ERROR. (Untitled teases are allowed — "(if
 *     any)".)
 */
function checkBingeTargetMatch(
  script: string,
  opts: ValidateScriptOptions,
): ScriptViolation[] {
  if (opts.bingeTargetConfigured === undefined) return [];
  const { dialogue, dialogueLineMap } = stripToDialogue(script);
  const lines = dialogue.split("\n");
  const violations: ScriptViolation[] = [];

  if (opts.bingeTargetConfigured === false) {
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      for (const p of NEXT_VIDEO_PATTERNS) {
        const m = p.exec(line);
        if (m) {
          violations.push({
            rule: "binge_target_match",
            severity: "error",
            message:
              "This plan has no binge target configured, so the script must " +
              'NOT reference a "next video" / "watch this next". Remove the ' +
              "next-video tease and close on the recap + a generic CTA " +
              "(e.g. message me on Instagram, or grab the guide in the " +
              "description).",
            snippet: snippetAround(line, m),
            line: dialogueLineMap[li],
          });
          break; // one violation per line is enough
        }
      }
    }
    return violations;
  }

  // configured === true → flag only a quoted title that directly follows a
  // next-video / title cue and shares no distinctive token with the real
  // target. "(if any)" — untitled teases are allowed.
  const real = (opts.bingeTargetTitle ?? "").trim();
  const realTokens = bingeDistinctiveTokens(real);
  if (realTokens.size === 0) return violations; // nothing to compare against
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    TITLE_CUE_QUOTE_RE.lastIndex = 0;
    let q: RegExpExecArray | null;
    while ((q = TITLE_CUE_QUOTE_RE.exec(line)) !== null) {
      const quoted = q[1].trim();
      const quotedTokens = bingeDistinctiveTokens(quoted);
      if (quotedTokens.size === 0) continue; // generic quote, not a title
      let overlaps = false;
      for (const t of quotedTokens) {
        if (realTokens.has(t)) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        violations.push({
          rule: "binge_target_match",
          severity: "error",
          message:
            `The script teases a next video titled "${quoted}", but the ` +
            `configured binge target is "${real}". Reference the EXACT ` +
            "configured title — do not invent a different one.",
          snippet: snippetAround(line, q),
          line: dialogueLineMap[li],
        });
      }
    }
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Umbrella validator.                                                   */
/* ────────────────────────────────────────────────────────────────────── */

export interface ValidateScriptOptions extends HyperLocalOptions {
  /**
   * Wave 1 — deterministic source-of-truth values for the script's cited
   * uploads. When provided, the `no_misattributed_stats` rule runs at
   * WARNING severity (does NOT block save, does NOT trigger re-prompt).
   */
  sourceOfTruth?: SourceOfTruthValue[];
  /**
   * Wave 1 — raw stat strings from the planner's cited-facts block
   * (e.g. "$625,000", "8.3%", "2.1 months"). Cross-checked alongside
   * `sourceOfTruth` so a stat the member legitimately surfaced via the
   * planner is also treated as member-attributable.
   */
  citedFacts?: CitedFactValue[];
  /**
   * Wave 5 follow-up — arbitrary prose strings (full neighbourhood
   * profile content, primary-avatar summary, avatar profile JSON
   * flattened, etc.) that the stat validator treats as additional
   * legal anchor sources. A spoken stat whose raw form appears
   * verbatim in this prose, OR whose numeric value is within 2% of
   * any number in this prose, is accepted instead of flagged.
   *
   * Set this from the v2 route with the FULL neighbourhoodContext
   * map values plus the avatar text. Leaving it empty preserves the
   * pre-follow-up behaviour (SoT + cited facts only).
   */
  profileText?: string[];
  /**
   * B1 — the resolved member's own full name (presenter identity). Used by
   * `no_other_member_identity` to know which name is legitimately allowed.
   */
  currentMemberName?: string;
  /**
   * B1 — full names of OTHER members in the system. If any appears in the
   * generated script, `no_other_member_identity` fires at ERROR severity so a
   * cross-member identity leak (e.g. the legacy hardcoded presenter) can never
   * ship. Only multi-token names are checked to avoid common-word collisions.
   */
  forbiddenIdentities?: string[];
  /**
   * Binge guard — whether this plan has a USABLE binge target (a committed,
   * non-idea-stage next video). Drives `binge_target_match`:
   *   - `true`  → the script MAY tease the next video, but a clearly-quoted
   *               title near a next-video reference must match `bingeTargetTitle`.
   *   - `false` → the script must NOT reference any "next video" at all
   *               (no target exists → any tease is fabricated).
   *   - `undefined` → the rule is INERT (back-compat for callers that don't
   *               resolve binge context). Both the streaming route AND the
   *               save-script route MUST set this, or a direct POST could
   *               persist a script that fabricates a next-video tease.
   */
  bingeTargetConfigured?: boolean;
  /**
   * Binge guard — the real binge target's title (only meaningful when
   * `bingeTargetConfigured === true`). A quoted title in the script that
   * shares no distinctive token with this is treated as a fabricated/wrong
   * target.
   */
  bingeTargetTitle?: string;
}

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
  // Wave 5 — ERROR severity (promoted from Wave 1 WARNING). The two
  // known false-positive sources (narrative time spans, inverse-ratio
  // percentages) are pre-filtered inside `checkNoMisattributedStats`,
  // so the re-prompt loop can safely fire on what's left.
  violations.push(
    ...checkNoMisattributedStats(
      script,
      opts.sourceOfTruth,
      opts.citedFacts,
      opts.profileText,
    ),
  );
  // Wave 8 Fix 2 / Fix 3 / Fix 4 — ERROR severity, all gated through the
  // existing re-prompt loop.
  violations.push(...checkMinDialogueLength(script));
  violations.push(...checkNoAnnouncedCredibility(script));
  violations.push(...checkPeopleLikeUsInLm(script));
  // B1 — presenter-identity guardrails (cross-member leak + unfilled placeholder).
  violations.push(...checkNoOtherMemberIdentity(script, opts));
  violations.push(...checkUnfilledCredibilityPlaceholder(script));
  // Binge guard — no fabricated next-video tease.
  violations.push(...checkBingeTargetMatch(script, opts));

  const ok = !violations.some((v) => v.severity === "error");
  return { ok, violations, metrics: hyperLocal.metrics };
}

/**
 * Wave 6 — mechanical post-generation fixes.
 *
 * Applied AFTER Claude generates and BEFORE validation runs. Catches
 * mechanical violations that Claude struggles to maintain across long
 * scripts (no_why, no_abbrev_in_dialogue). Does NOT touch content inside
 * `[VISUAL: ...]` tags — abbreviations are allowed there.
 *
 * Returns the rewritten script. Idempotent on already-clean scripts.
 */
export function autoFixMechanicalRules(input: string): string {
  // Wave 9 — people_like_us_in_lm proximity strip (runs on FULL script,
  // BEFORE the dialogue/tag split below). Strips "people like us" if
  // it appears within 100 chars of any [LEAD MAGNET ...] tag. Usage
  // elsewhere in the script (content beats, data peaks) is preserved.
  // Mirrors the validator's PEOPLE_LIKE_US_LM_WINDOW (= 100); the
  // validator runs AFTER this auto-fix, so a clean strip here means
  // no people_like_us_in_lm violation reaches the retry gate.
  let script = input;
  const LM_TAG_PATTERN_AF = /\[LEAD\s*MAGNET[^\]]*\]/gi;
  // Horizontal whitespace only ([ \t]) — never \s — so the strip cannot
  // consume newlines around the phrase and collapse paragraph structure.
  const PEOPLE_LIKE_US_PATTERN_AF =
    /[ \t,;.\u2014-]*(?:People|people)[ \t]+like[ \t]+us[ \t,;.\u2014-]*/g;
  const lmTagMatches = Array.from(script.matchAll(LM_TAG_PATTERN_AF));
  if (lmTagMatches.length > 0) {
    const windows = lmTagMatches.map((m) => ({
      start: Math.max(0, (m.index ?? 0) - 100),
      end: Math.min(script.length, (m.index ?? 0) + m[0].length + 100),
    }));
    const phraseMatches = Array.from(
      script.matchAll(PEOPLE_LIKE_US_PATTERN_AF),
    );
    const removals: Array<{ start: number; end: number }> = [];
    for (const pm of phraseMatches) {
      const start = pm.index ?? 0;
      const phraseCenter = start + Math.floor(pm[0].length / 2);
      const insideWindow = windows.some(
        (w) => phraseCenter >= w.start && phraseCenter <= w.end,
      );
      if (insideWindow) {
        removals.push({ start, end: start + pm[0].length });
      }
    }
    // Apply removals in reverse so earlier indices stay valid. If the
    // phrase sits between newlines (its own line), drop it entirely;
    // otherwise replace with a single space so adjoining words don't
    // collide.
    removals.sort((a, b) => b.start - a.start);
    for (const r of removals) {
      const before = r.start > 0 ? script[r.start - 1] : "\n";
      const after = r.end < script.length ? script[r.end] : "\n";
      const isLineIsolated =
        (before === "\n" || before === "\r") &&
        (after === "\n" || after === "\r");
      const filler = isLineIsolated ? "" : " ";
      script = script.slice(0, r.start) + filler + script.slice(r.end);
    }
    if (removals.length > 0) {
      // Newline-safe cleanup: only collapse runs of tabs/spaces and pull
      // orphaned punctuation back to the preceding word. Leave \n alone
      // so paragraph structure survives.
      script = script
        .replace(/[ \t]+([,;.!?])/g, "$1")
        .replace(/[ \t]{2,}/g, " ");
    }
  }

  // Split into dialogue-vs-bracket-tag segments. Only rewrite dialogue.
  // [VISUAL: ...] tags, [LEAD MAGNET n/3] markers, [CALLBACK], [CONNECTION]
  // tags are preserved verbatim.
  const TAG_PATTERN =
    /\[(?:VISUAL|LEAD MAGNET[^\]]*|CALLBACK|CONNECTION[^\]]*)[^\]]*\]/g;
  const segments: Array<{ kind: "tag" | "dialogue"; text: string }> = [];
  let lastIndex = 0;
  for (const match of script.matchAll(TAG_PATTERN)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      segments.push({ kind: "dialogue", text: script.slice(lastIndex, idx) });
    }
    segments.push({ kind: "tag", text: match[0] });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < script.length) {
    segments.push({ kind: "dialogue", text: script.slice(lastIndex) });
  }

  for (const seg of segments) {
    if (seg.kind === "tag") continue;
    let t = seg.text;

    // ─ no_abbrev_in_dialogue ─────────────────────────────────────────────
    // Whole-word, case-insensitive expansion. Use \b to avoid corrupting
    // composed words. Don't touch occurrences inside parentheses that are
    // already glossing (e.g. "months of inventory (MOI)") — those are
    // author intent, not violations. Detect with a `)` lookahead.
    const ABBREV_MAP: Array<[RegExp, string]> = [
      [/\bMOI\b(?!\s*\))/g, "months of inventory"],
      [/\bDOM\b(?!\s*\))/g, "days on market"],
      [/\bPSF\b(?!\s*\))/g, "price per square foot"],
      [/\bSP\/LP\b(?!\s*\))/g, "sales to list price ratio"],
      [/\bSP-LP\b(?!\s*\))/g, "sales to list price ratio"],
    ];
    for (const [re, replacement] of ABBREV_MAP) {
      t = t.replace(re, replacement);
    }

    // ─ no_why ────────────────────────────────────────────────────────────
    // Replace "why" with context-appropriate alternatives. Order matters:
    // longer/more-specific patterns first.
    const WHY_REWRITES: Array<[RegExp, string]> = [
      // "the reason why X" → "the reason X" (redundant "why")
      [/\bthe\s+reason\s+why\b/gi, "the reason"],
      // "Here's why ..." → "Here's the reason ..."
      [/\bHere'?s\s+why\b/g, "Here's the reason"],
      [/\bhere'?s\s+why\b/g, "here's the reason"],
      // "That's why ..." → "That's the reason ..."
      [/\bThat'?s\s+why\b/g, "That's the reason"],
      [/\bthat'?s\s+why\b/g, "that's the reason"],
      // "Why X is happening" → "Here's what's behind X happening"
      [/^Why\b/gm, "Here's what's behind"],
      // Rhetorical sentence-end: "...but why?" — drop or rewrite
      [/\?\s*but\s+why\?/gi, "? What's behind it?"],
      // Generic "why" → "the reason" (catch-all, lowest priority)
      [/\bwhy\b/gi, "the reason"],
    ];
    for (const [re, replacement] of WHY_REWRITES) {
      t = t.replace(re, replacement);
    }

    // ─ no_avatar_pander — mechanical phrase rewrites ────────────────────
    // Banned avatar-pander phrases that have clean mechanical
    // substitutions. Phrases that require deeper sentence restructuring
    // (e.g. "I see you", "I want you to sit with that" is borderline)
    // stay on the validator gate; they're rare enough that the retry
    // loop handles them. Do NOT touch "you're not alone in feeling..."
    // (Wave 5 Fix B approved-phrase whitelist) or "I see you" (no clean
    // mechanical substitution).
    const PANDER_REWRITES: Array<[RegExp, string]> = [
      // "for people like you" → "for those" (drops the targeting "you").
      [/\bfor\s+people\s+like\s+you\b/gi, "for those"],
      // "{cohort} in your situation" → "{cohort} in this situation".
      // Group covers buyers/sellers/owners/families/households; the
      // captured noun is preserved verbatim via $1.
      [
        /\b(buyers|sellers|owners|families|households)\s+in\s+your\s+situation\b/gi,
        "$1 in this situation",
      ],
      // "Let me be direct with you here" — pure signposting; drop the
      // whole clause along with its trailing punctuation/whitespace.
      [/\bLet\s+me\s+be\s+direct\s+with\s+you\s+here[\.\,]?\s*/g, ""],
      [/\blet\s+me\s+be\s+direct\s+with\s+you\s+here[\.\,]?\s*/g, ""],
      // "I want you to sit with that" → "Think about that" (an approved
      // editorial reaction phrase per the master prompt).
      [/\bI\s+want\s+you\s+to\s+sit\s+with\s+that\b/gi, "Think about that"],
    ];
    for (const [re, replacement] of PANDER_REWRITES) {
      t = t.replace(re, replacement);
    }

    // ─ Em-dash ban (voice guide — HARD RULE) ────────────────────────────
    // Em dashes are not Jared's voice. Replace with comma (default) or
    // period+space (when the dash separates two complete sentences,
    // detected by an uppercase letter following the dash).
    //
    // Detection: " — " (space, em dash, space). Don't touch bare "—"
    // without surrounding spaces — those could appear inside quoted
    // sources or tables.
    const EM_DASH_PATTERN = /\s+—\s+/g;
    t = t.replace(EM_DASH_PATTERN, (match, offset: number, full: string) => {
      const next = full.slice(offset + match.length, offset + match.length + 1);
      if (next && /[A-Z]/.test(next)) return ". ";
      return ", ";
    });

    // ─ Jargon → plain language (voice-guide substitution table) ─────────
    const JARGON_REWRITES: Array<[RegExp, string]> = [
      [/\bpre-?approval\b/gi, "shopping budget"],
      [
        /\bsimultaneous\s+transactions?\b/gi,
        "selling and buying at the same time",
      ],
      [/\btimeline\s+synchronization\b/gi, "coordinating your closings"],
      [/\bmortgage\s+qualifications?\b/gi, "financial comfort zone"],
      [/\bmove-?up\s+propert(?:y|ies)\b/gi, "lifestyle upgrade"],
      [
        /\bselling\s+price\s+to\s+list\s+price\s+ratio\b/gi,
        "how close homes are selling to asking price",
      ],
      // Softer fix — "smooth transition" gets re-cast.
      [/\bsmooth\s+transition\b/gi, "making the move feel manageable"],
    ];
    for (const [re, replacement] of JARGON_REWRITES) {
      t = t.replace(re, replacement);
    }

    // ─ Audience-as-group → one viewer (voice-guide rule #1) ─────────────
    // "Hey guys" dropped (with trailing punct/space). "you guys" → "you".
    // We deliberately do NOT touch "everyone" / "everybody" — too many
    // legitimate uses ("everyone in Calgary…").
    const ONE_VIEWER_REWRITES: Array<[RegExp, string]> = [
      [/\bHey\s+guys[,!\.]?\s*/g, ""],
      [/\bhey\s+guys[,!\.]?\s*/g, ""],
      [/\byou\s+guys\b/gi, "you"],
    ];
    for (const [re, replacement] of ONE_VIEWER_REWRITES) {
      t = t.replace(re, replacement);
    }

    seg.text = t;
  }

  return segments.map((s) => s.text).join("");
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Wave 11 — autoSoftenUnanchoredStats (pre-validation pass).            */
/*                                                                        */
/*  When Claude fabricates a stat (e.g. "6.2%" that doesn't appear in     */
/*  SoT / cited facts / profile text), the validator's unanchored_stat    */
/*  rule fires at ERROR severity and the retry loop kicks in. Real-world */
/*  result: Claude often fabricates a DIFFERENT plausible number on the   */
/*  retry, retries burn out, hard-block, member can't ship the script.    */
/*                                                                        */
/*  This pass runs AFTER autoFixMechanicalRules and BEFORE validation.    */
/*  For each unanchored numeric token in the dialogue, it tries to        */
/*  rewrite the surrounding phrase to directional language ("down         */
/*  meaningfully" / "well above the citywide average" / "most listings")  */
/*  while leaving the rest of the sentence intact. Data integrity is      */
/*  preserved (we never invent a substitute number) and the script ships. */
/*                                                                        */
/*  Anchored decision MUST mirror checkNoMisattributedStats — same        */
/*  inputs, same SoT/cited/profile whitelists, same time-reference        */
/*  filter, same 2% tolerance — so we only soften what the validator      */
/*  would actually flag.                                                  */
/* ────────────────────────────────────────────────────────────────────── */

/** Escape a string for use inside a RegExp literal. */
function escRe(s: string): string {
  return s.replace(/[$.*+?^{}()|[\]\\]/g, "\\$&");
}

/**
 * Build the set of token-specific softening rules for one unanchored
 * raw token (e.g. "6.2%", "$340,000", "47 days"). Each rule's regex
 * embeds the token literally so anchored stats with the same surrounding
 * verb ("up 8.3%" when 8.3% IS in SoT) are NOT touched.
 */
function softenRulesForToken(
  raw: string,
  unit: StatUnit,
): Array<[RegExp, string]> {
  const esc = escRe(raw);
  // Wave 12 Fix 1 — bucket-based directional language for duration
  // tokens. Parse the numeric magnitude out of `raw` (matches both
  // decimal months like "0.55 months" / "2.42 months", whole days like
  // "10 days" / "18 days", and decimal MOI like "0.55 MOI" — the
  // extractStatTokens MOI pattern emits unit="months"). The buckets
  // mirror the seller-vs-buyer market thresholds the master prompt
  // teaches, so a fabricated stat collapses to the directional phrase
  // a real one would have surfaced.
  // Wave 12.5 — currency-aware numeric parse. The naive
  // `/(\d+(?:\.\d+)?)/` capture truncates "$649,000" to 649 and
  // strips K/M suffixes, so the dollar buckets all collapsed to
  // "around a meaningful amount". Mirror extractStatTokens here:
  // strip thousands commas, then scale by K/M suffix.
  let value: number;
  if (unit === "currency") {
    const m = raw.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*([KM]?)/i);
    if (m) {
      let n = parseFloat(m[1].replace(/,/g, ""));
      const suffix = (m[2] || "").toUpperCase();
      if (suffix === "K") n *= 1_000;
      else if (suffix === "M") n *= 1_000_000;
      value = n;
    } else {
      value = NaN;
    }
  } else {
    const numMatch = raw.match(/(\d+(?:\.\d+)?)/);
    value = numMatch ? parseFloat(numMatch[1]) : NaN;
  }
  const directionalForMonths = (v: number): string => {
    if (v < 1.5) return "deep seller territory";       // 0-1.5
    if (v < 3) return "tight seller territory";        // 1.5-3
    if (v <= 5) return "approaching balanced";         // 3-5
    return "buyer territory";                           // >5
  };
  const directionalForDays = (v: number): string => {
    if (v < 14) return "moving fast";                  // <14 days
    if (v <= 30) return "a two-to-four week window";   // 14-30 days
    return "sitting";                                   // >30 days
  };
  // Wave 12.5 — bucket-based directional language for dollar amounts.
  // Mirrors the months/days buckets above. Rounds the fabricated value
  // to the nearest readable band so the rewrite still SOUNDS like a
  // stat (members hate vague "a meaningful price") while no longer
  // claiming a specific, unverifiable dollar figure. Bands:
  //   <$1M  → nearest $50K, written "the 650K range"
  //   ≥$1M  → nearest $0.1M, written "the 1.2-million range"
  // CRITICAL — the output deliberately omits the "$" prefix so the
  // softened phrase no longer matches the currency regex in
  // extractStatTokens (which requires `\$`). Without that, the
  // bare-token fallback rule below would re-extract "around $650K"
  // as a new unanchored token on the next softenSpan iteration and
  // loop forever ("around around around …").
  const directionalForDollars = (v: number): string => {
    if (v >= 1_000_000) {
      const m = Math.round(v / 100_000) / 10;
      return `the ${m}-million range`;
    }
    if (v >= 1_000) {
      const band = Math.round(v / 50_000) * 50;
      return `the ${band}K range`;
    }
    return "a meaningful amount";
  };
  // Wave 12.5 — bucket-based directional language for percentages,
  // tuned for the SP/LP "over list" / "under list" framing that's by
  // far the most common percent stat the LLM fabricates. Used only as
  // a last-resort after the more specific directional / threshold
  // patterns below fail to match. Bands per spec:
  //   <2%   → "in line with list"
  //   2-5%  → "slightly over list"
  //   5-10% → "meaningfully over list"
  //   >10%  → "deep over list"
  //   <0    → "under list"
  const directionalForPercent = (v: number): string => {
    if (v < 0) return "under list";
    if (v < 2) return "in line with list";
    if (v < 5) return "slightly over list";
    if (v <= 10) return "meaningfully over list";
    return "deep over list";
  };
  // Wave 12.5 — SP/LP "X% of list" mapping. "98% of list" reads as
  // 2-points-under-list which the audience hears as "in line with
  // list", not the literal "under list" that the raw signed-delta
  // would produce. So we band on |delta| first, then sign. Symmetric
  // bucket cutoffs match directionalForPercent for over-list values.
  const directionalForOfList = (pct: number): string => {
    const delta = pct - 100;
    const abs = Math.abs(delta);
    // Wave 12.5 — inclusive 2-point band so the boundary cases the
    // LLM most often fabricates (98% / 102% of list) read as "in
    // line with list" rather than the harsher "slightly under/over".
    if (abs <= 2) return "in line with list";
    if (delta > 0) {
      if (delta <= 5) return "slightly over list";
      if (delta <= 10) return "meaningfully over list";
      return "deep over list";
    }
    if (abs <= 5) return "slightly under list";
    if (abs <= 10) return "meaningfully under list";
    return "deep under list";
  };
  // Wave 12.5 — single tolerance source of truth. All bucket-based
  // soften rules below (duration, dollar, percent) share the same
  // withinTolerance() helper at the autoSoftenUnanchoredStats call
  // site upstream — by the time control reaches here the token has
  // already been confirmed unanchored by that helper, so the rewrite
  // is safe to apply.
  if (unit === "percent") {
    return [
      // Directional movement
      [new RegExp(`\\bdown\\s+${esc}`, "gi"), "down meaningfully"],
      [new RegExp(`\\bup\\s+${esc}`, "gi"), "up meaningfully"],
      [new RegExp(`\\bdropped\\s+${esc}`, "gi"), "dropped meaningfully"],
      [new RegExp(`\\brose\\s+${esc}`, "gi"), "rose meaningfully"],
      [new RegExp(`\\bgrew\\s+${esc}`, "gi"), "grew meaningfully"],
      [new RegExp(`\\bfell\\s+${esc}`, "gi"), "fell meaningfully"],
      [new RegExp(`\\bdeclined\\s+${esc}`, "gi"), "declined meaningfully"],
      [new RegExp(`\\bincreased\\s+${esc}`, "gi"), "increased meaningfully"],
      [new RegExp(`\\bdecreased\\s+${esc}`, "gi"), "decreased meaningfully"],
      // Threshold language
      [
        new RegExp(`\\babove\\s+${esc}`, "gi"),
        "well above the citywide average",
      ],
      [
        new RegExp(`\\bbelow\\s+${esc}`, "gi"),
        "well below the citywide average",
      ],
      [
        new RegExp(`\\bover\\s+${esc}`, "gi"),
        "well over the citywide average",
      ],
      [
        new RegExp(`\\bunder\\s+${esc}`, "gi"),
        "well under the citywide average",
      ],
      // Failure/success/close framings with the token leading
      [
        new RegExp(`${esc}\\s+(failure|success|fail|close)`, "gi"),
        "most $1",
      ],
      [
        new RegExp(
          `${esc}\\s+of\\s+(listings|buyers|sellers|families|homes|sales|deals)`,
          "gi",
        ),
        "most $1",
      ],
      // Wave 12.5 — SP/LP-context bucket rewrites. MUST run BEFORE
      // the generic bare "at X%" / "around X%" / "near X%" rules
      // below — otherwise "at 98% of list" would be consumed by
      // `\bat\s+98%` first and produce "at a meaningful level of
      // list". By matching the longer "X% of list" / "X% over list"
      // phrase first, we collapse the whole SP/LP framing to a
      // single directional band. directionalForOfList bands on
      // |delta from 100|, so "98% of list" → "in line with list"
      // (not the literal "under list" a raw signed delta would
      // produce).
      [
        new RegExp(`(?:\\bat\\s+)?${esc}\\s+(?:over|above)\\s+list`, "gi"),
        directionalForPercent(value),
      ],
      [
        new RegExp(`(?:\\bat\\s+)?${esc}\\s+(?:under|below)\\s+list`, "gi"),
        directionalForPercent(-Math.abs(value)),
      ],
      [
        new RegExp(
          `(?:\\bat\\s+)?${esc}\\s+of\\s+(?:the\\s+)?list(?:\\s+price)?`,
          "gi",
        ),
        directionalForOfList(value),
      ],
      // Bare "at X%" / "around X%" / "near X%"
      [new RegExp(`\\bat\\s+${esc}`, "gi"), "at a meaningful level"],
      [new RegExp(`\\baround\\s+${esc}`, "gi"), "around a meaningful level"],
      [new RegExp(`\\bnear\\s+${esc}`, "gi"), "near a meaningful level"],
      // Last-resort: bare token in any context → directional language
      [new RegExp(`\\b${esc}`, "gi"), "a meaningful percentage"],
    ];
  }
  if (unit === "currency") {
    // Wave 12.5 — bucket-based dollar directional, used as last-resort
    // after the targeted phrase rewrites below. The validator was
    // hard-blocking on fabricated dollar amounts like "$649,000" that
    // didn't appear in cited facts within 2% tolerance; the soften
    // pass now rewrites the surrounding phrase to a $50K-band band
    // ("around $650K") rather than the generic "a meaningful price",
    // preserving the directional read members rely on without
    // claiming a specific unverified figure.
    const directional = directionalForDollars(value);
    return [
      [
        new RegExp(`${esc}\\s+homes?`, "gi"),
        "meaningfully-priced homes",
      ],
      [new RegExp(`\\bover\\s+${esc}`, "gi"), `over ${directional}`],
      [new RegExp(`\\bunder\\s+${esc}`, "gi"), `under ${directional}`],
      [new RegExp(`\\babove\\s+${esc}`, "gi"), `above ${directional}`],
      [new RegExp(`\\bbelow\\s+${esc}`, "gi"), `below ${directional}`],
      [new RegExp(`\\baround\\s+${esc}`, "gi"), directional],
      [new RegExp(`\\bnear\\s+${esc}`, "gi"), directional],
      [new RegExp(`\\bat\\s+${esc}`, "gi"), `at ${directional}`],
      // Last-resort bare dollar token → directional band.
      [new RegExp(esc, "g"), directional],
    ];
  }
  if (unit === "months" || unit === "days") {
    const span = unit === "months" ? "months" : "days";
    const directional =
      unit === "months"
        ? directionalForMonths(value)
        : directionalForDays(value);
    return [
      [
        new RegExp(`\\bin\\s+the\\s+last\\s+${esc}`, "gi"),
        "recently",
      ],
      [
        new RegExp(`\\bover\\s+the\\s+next\\s+${esc}`, "gi"),
        `in the coming ${span}`,
      ],
      [
        new RegExp(`\\bover\\s+the\\s+last\\s+${esc}`, "gi"),
        "over recent history",
      ],
      [
        new RegExp(`\\bwithin\\s+${esc}`, "gi"),
        `within a meaningful number of ${span}`,
      ],
      // Wave 12 Fix 1 — bucket-based directional rewrites for bare
      // duration tokens (e.g. "0.55 months", "10 days", "0.55 MOI").
      // These run AFTER the narrow-phrase rewrites above so that
      // anchored framings like "in the last 12 months" are caught
      // first and not blown away by the catch-all. The mapping:
      //   months 0-1.5 → "deep seller territory" / well under two months
      //   months 1.5-3 → "tight seller territory"
      //   months 3-5   → "approaching balanced"
      //   months >5    → "buyer territory"
      //   days <14     → "moving fast" / off the market in under two weeks
      //   days 14-30   → "two-to-four week window"
      //   days >30     → "sitting" / moving slowly
      [
        new RegExp(`\\bat\\s+${esc}`, "gi"),
        `at ${directional}`,
      ],
      [
        new RegExp(`\\baround\\s+${esc}`, "gi"),
        directional,
      ],
      [
        new RegExp(`\\bsitting\\s+at\\s+${esc}`, "gi"),
        `sitting in ${directional}`,
      ],
      [
        new RegExp(`\\bcurrently\\s+(?:at\\s+)?${esc}`, "gi"),
        `currently in ${directional}`,
      ],
      // Last-resort bare token → directional bucket.
      [new RegExp(`\\b${esc}`, "g"), directional],
    ];
  }
  return [];
}

export interface AutoSoftenResult {
  script: string;
  softenedCount: number;
  softenedTokens: string[];
}

/**
 * Pre-validation softening pass for unanchored stat tokens.
 *
 * MUST be called AFTER autoFixMechanicalRules and BEFORE validateScript.
 * Mirrors the anchored-check logic in checkNoMisattributedStats so we
 * only touch tokens the validator would actually flag with
 * unanchored_stat.
 *
 * Idempotent — running on an already-softened script produces identical
 * output (softened phrases no longer contain numeric tokens, so the
 * extractor finds nothing to re-soften).
 */
export function autoSoftenUnanchoredStats(
  script: string,
  sourceOfTruth: SourceOfTruthValue[] | undefined,
  citedFacts: CitedFactValue[] | undefined = undefined,
  profileText: string[] = [],
): AutoSoftenResult {
  const hasSot = sourceOfTruth && sourceOfTruth.length > 0;
  const hasCited = citedFacts && citedFacts.length > 0;
  // Match the validator's early-return: with no anchors we can't decide
  // anchored-vs-not, so we silently no-op.
  if (!hasSot && !hasCited) {
    return { script, softenedCount: 0, softenedTokens: [] };
  }

  // Build the SAME anchored sets the validator builds.
  const profileTokenSet = new Set<string>();
  const profileNumbers: ProfileNumber[] = [];
  for (const t of profileText) {
    for (const p of extractProfileNumbers(t)) {
      profileTokenSet.add(p.normalized);
      profileNumbers.push(p);
    }
  }

  const sotComparable: Array<{ unit: StatUnit; value: number }> = [];
  if (hasSot) {
    for (const sot of sourceOfTruth!) {
      const unit = unitForFamily(sot.metricFamily);
      if (!unit) continue;
      for (const v of normalizeForCompare(sot.metricFamily, sot.metricValue)) {
        sotComparable.push({ unit, value: v });
      }
      // SP/LP derivation (mirror of validator)
      if (sot.metricFamily === "SP_LP") {
        const ratio =
          sot.metricValue <= 2 ? sot.metricValue : sot.metricValue / 100;
        const discount = (1 - ratio) * 100;
        if (discount > 0) {
          sotComparable.push({ unit: "percent", value: discount });
        } else if (discount < 0) {
          sotComparable.push({ unit: "percent", value: -discount });
        }
      }
    }
  }
  if (hasCited) {
    for (const c of citedFacts!) {
      if (!c.raw) continue;
      for (const t of extractStatTokens(c.raw)) {
        sotComparable.push({ unit: t.unit, value: t.value });
      }
    }
  }

  // Mirror stripToDialogue's surface so we only soften tokens that
  // would reach the validator:
  //   - Whole lines matching HEADING_OR_TITLE_LINE_RE or
  //     ANNOTATION_ONLY_LINE_RE are stripped by the validator → NEVER
  //     soften.
  //   - Within remaining lines, SQUARE_BRACKET_ANNOTATION_RE and
  //     BOLD_LAYER_LABEL_RE spans are also stripped → don't soften
  //     inside them. Everything else is softenable dialogue.
  //
  // We process line-by-line, then split each softenable line into
  // alternating softenable / non-softenable spans by collecting all
  // bracket-annotation + bold-label matches. This is stricter than the
  // earlier Wave 11 narrow-tag splitter and matches the validator's
  // visible surface exactly.

  let softenedCount = 0;
  const softenedTokens: string[] = [];
  const seen = new Set<string>();

  // Soften a single softenable text span in-place. Returns the new text.
  const softenSpan = (input: string): string => {
    let dialogue = input;
    // Re-extract tokens after each successful softening pass — offsets
    // shift and a phrase we already rewrote shouldn't be revisited.
    let changed = true;
    // Wave 12.5 — hard iteration cap. If a future soften rule ever
    // reintroduces a tokenizable phrase (e.g. a directional phrase
    // that still parses as currency/percent/duration), this guard
    // prevents an infinite rewrite loop from hanging script
    // generation. 64 iterations is far above any plausible script's
    // unique-token count; hitting it indicates a soften-rule bug
    // upstream, not normal traffic.
    const MAX_ITERS = 64;
    let iters = 0;
    while (changed && iters++ < MAX_ITERS) {
      changed = false;
      const tokens = extractStatTokens(dialogue);
      for (const tok of tokens) {
        // Mirror validator: skip narrative time references unless
        // anchored to a market-time phrase.
        if (
          (tok.unit === "months" || tok.unit === "days") &&
          TIME_REFERENCE_PATTERN.test(tok.raw) &&
          !isMarketTimeAnchored(dialogue, tok.offset)
        ) {
          continue;
        }

        // Same unit must have at least one anchor; otherwise the
        // validator can't speak to fabrication here, so we don't either.
        const haveAnchorsOfUnit = sotComparable.some(
          (s) => s.unit === tok.unit,
        );
        if (!haveAnchorsOfUnit) continue;

        // SoT/cited match within 2% tolerance → anchored, leave alone.
        const sotMatch = sotComparable.find(
          (s) => s.unit === tok.unit && withinTolerance(s.value, tok.value),
        );
        if (sotMatch) continue;

        // Profile verbatim / unit-tolerance whitelist (Wave 5 Fix A).
        const normalizedRaw = tok.raw.replace(/[$,%\s]/g, "");
        if (profileTokenSet.has(normalizedRaw)) continue;
        const profileMatch = profileNumbers.some(
          (p) => p.unit === tok.unit && withinTolerance(p.value, tok.value),
        );
        if (profileMatch) continue;

        // Unanchored. Try token-specific softening rules in order.
        const rules = softenRulesForToken(tok.raw, tok.unit);
        let softenedHere = false;
        for (const [re, replacement] of rules) {
          const before = dialogue;
          dialogue = dialogue.replace(re, replacement);
          if (dialogue !== before) {
            softenedHere = true;
            const key = `${tok.raw}|${tok.unit}`;
            if (!seen.has(key)) {
              seen.add(key);
              softenedTokens.push(tok.raw);
            }
            softenedCount++;
            break;
          }
        }

        if (softenedHere) {
          // Re-extract from scratch — offsets and remaining-token set
          // both shifted.
          changed = true;
          break;
        }
        // else: no rule matched — fall through to validator/retry loop.
      }
    }
    return dialogue;
  };

  // Split one line into alternating softenable / non-softenable spans
  // by collecting SQUARE_BRACKET_ANNOTATION + BOLD_LAYER_LABEL matches.
  // Non-softenable spans are preserved verbatim; only softenable spans
  // are fed to softenSpan().
  const softenLine = (line: string): string => {
    type Span = { start: number; end: number };
    const blocks: Span[] = [];
    const collect = (re: RegExp) => {
      // Fresh regex per call so we don't share lastIndex state.
      const rx = new RegExp(re.source, re.flags);
      let m: RegExpExecArray | null;
      while ((m = rx.exec(line)) !== null) {
        blocks.push({ start: m.index, end: m.index + m[0].length });
        if (m[0].length === 0) rx.lastIndex++;
      }
    };
    collect(SQUARE_BRACKET_ANNOTATION_RE);
    collect(BOLD_LAYER_LABEL_RE);
    if (blocks.length === 0) return softenSpan(line);
    blocks.sort((a, b) => a.start - b.start);

    // Defensively merge overlapping / adjacent non-softenable spans.
    // SQUARE_BRACKET and BOLD_LABEL can't structurally overlap (one is
    // `[...]`, the other `**...**`), but a malformed line with nested or
    // touching matches would otherwise cause duplicate non-softenable
    // text in the rebuilt output. Merging guarantees alternating
    // softenable / non-softenable spans with no overlap.
    const merged: Span[] = [];
    for (const b of blocks) {
      const last = merged[merged.length - 1];
      if (last && b.start <= last.end) {
        last.end = Math.max(last.end, b.end);
      } else {
        merged.push({ start: b.start, end: b.end });
      }
    }

    const out: string[] = [];
    let cursor = 0;
    for (const b of merged) {
      if (b.start > cursor) {
        out.push(softenSpan(line.slice(cursor, b.start)));
      }
      out.push(line.slice(b.start, b.end));
      cursor = b.end;
    }
    if (cursor < line.length) {
      out.push(softenSpan(line.slice(cursor)));
    }
    return out.join("");

    // Cross-boundary note: stripToDialogue concatenates pre/post text
    // after removing non-softenable spans, so a stat fragmented by an
    // inline annotation (e.g. "12[VISUAL: …]34%") would be tokenised by
    // the validator as "1234%". This pass tokenises pre/post spans
    // independently and therefore won't see such tokens. That's an
    // acceptable strict subset: any token we can't see in the source
    // text we can't regex-replace anyway, and the validator → retry
    // loop catches them (per spec: "If a stat token can't be softened,
    // it falls through to validator → retry → hard-block as today").
    // Claude's output never splits numbers across annotations, so this
    // is theoretical.
  };

  const lines = script.split(/\r?\n/);
  const rebuilt: string[] = [];
  for (const line of lines) {
    if (
      HEADING_OR_TITLE_LINE_RE.test(line) ||
      ANNOTATION_ONLY_LINE_RE.test(line)
    ) {
      // Validator strips this line; never soften.
      rebuilt.push(line);
      continue;
    }
    rebuilt.push(softenLine(line));
  }
  // Preserve the original line-ending style as best we can: split was
  // /\r?\n/, so join with \n. Real script bodies use \n; CRLF would
  // only appear if upstream sources injected it, in which case
  // normalising to \n is acceptable and matches how validateScript
  // observes the text.
  return {
    script: rebuilt.join("\n"),
    softenedCount,
    softenedTokens,
  };
}

/* ────────────────────────────────────────────────────────────────────── */
/*  autoSoftenFabricatedBinge (pre-validation pass).                       */
/* ────────────────────────────────────────────────────────────────────── */

export interface BingeSoftenResult {
  script: string;
  /** Count of next-video sentences removed. */
  softenedCount: number;
  /** Trimmed previews of the removed sentences (for logging). */
  removed: string[];
}

/**
 * Mechanical recovery for the NULL binge case. Runs BEFORE validation in the
 * generation route: when no usable binge target is configured, any "next
 * video" tease is fabricated, so we drop the offending sentence(s) rather
 * than burning a re-prompt. The recap + lead-magnet CTA carry the close.
 *
 * Only the no-target case is auto-softened — when a real target IS configured
 * but the script quotes the WRONG title, we can't safely rewrite the dialogue,
 * so that falls through to `binge_target_match` → the re-prompt loop.
 *
 * Sentence-granular: a dialogue line teasing the next video has just that
 * sentence removed; the rest of the line (and all annotations/headings) is
 * preserved. Idempotent — a softened script has no next-video patterns left.
 */
export function autoSoftenFabricatedBinge(
  script: string,
  opts: { bingeTargetConfigured?: boolean },
): BingeSoftenResult {
  if (opts.bingeTargetConfigured !== false) {
    return { script, softenedCount: 0, removed: [] };
  }
  const lines = script.split(/\r?\n/);
  const out: string[] = [];
  let softenedCount = 0;
  const removed: string[] = [];

  for (const raw of lines) {
    // Validator strips these surfaces; leave them untouched.
    if (
      HEADING_OR_TITLE_LINE_RE.test(raw) ||
      ANNOTATION_ONLY_LINE_RE.test(raw)
    ) {
      out.push(raw);
      continue;
    }
    const dialoguePortion = raw
      .replace(SQUARE_BRACKET_ANNOTATION_RE, "")
      .replace(BOLD_LAYER_LABEL_RE, "");
    if (!NEXT_VIDEO_PATTERNS.some((p) => p.test(dialoguePortion))) {
      out.push(raw);
      continue;
    }
    // Drop only the sentence(s) that carry a next-video tease.
    const sentences = raw.split(/(?<=[.!?])\s+/);
    const kept: string[] = [];
    for (const s of sentences) {
      const sd = s
        .replace(SQUARE_BRACKET_ANNOTATION_RE, "")
        .replace(BOLD_LAYER_LABEL_RE, "");
      if (NEXT_VIDEO_PATTERNS.some((p) => p.test(sd))) {
        softenedCount++;
        removed.push(s.replace(/\s+/g, " ").trim().slice(0, 120));
        continue;
      }
      kept.push(s);
    }
    const rebuilt = kept.join(" ").replace(/[ \t]+/g, " ").trimEnd();
    if (rebuilt.length > 0) out.push(rebuilt);
    // If the whole line was next-video tease, drop the now-empty line.
  }

  return { script: out.join("\n"), softenedCount, removed };
}
