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
  | "binge_target_match"
  /** Script states a "%-failed-to-sell" figure, misreading the offMarket/sold
   *  failure_rate ratio as a share of all listings. */
  | "failure_rate_framing"
  /** A quantitative claim leaked a malformed/placeholder number ("the 0K
   *  range", "$500,000-to-the 600K", "a meaningful amount", a dangling
   *  value verb like "average sitting.") instead of a clean traceable value. */
  | "placeholder_number"
  /** The CLOSING is a backward recap or a closing sales pitch instead of a
   *  counter-intuitive forward/binge hook to the next video. */
  | "recap_close"
  /** The opening's Expertise Bridge invented a specific credibility cadence
   *  ("a family every 53 hours") whose number isn't backed by the member's
   *  profile/credentials. */
  | "fabricated_credibility_stat"
  /** A SPECIFIC factual claim — demographic figure (median income/age,
   *  population), or a dated event ("opened in 2019") — that doesn't trace to a
   *  cited fact, the source-of-truth, or the member's Knowledge Base
   *  neighbourhood profile. Grounding extends past pure market stats to any
   *  asserted specific. */
  | "unsourced_factual_claim"
  /** A spoken number agrees with a per-fact cited value but DISAGREES (beyond
   *  rounding) with the canonical aggregated source-of-truth for the same
   *  metric. Canonical = source-of-truth, so the per-fact number must yield. */
  | "no_sot_disagreement"
  /** A real market number (any family: failure rate, SP/LP, DOM, PSF, …) is
   *  spoken in the body but is missing from the "## Sources" footnote. Every
   *  spoken number must trace to a fact id in Sources, not just MOI + price. */
  | "unlisted_market_stat";

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
 * ARC fact-citation footnote. Everything from a "## Sources" (or
 * "**Sources**") heading to the end of the script is editor-facing audit
 * metadata mapping each market number to its fact id — it is never spoken.
 * `stripToDialogue` stops collecting at this line so no dialogue rule scans
 * the footnote's ids/labels. Singular "Source" (e.g. the prompt's
 * "## SOURCE-OF-TRUTH METRICS") is intentionally NOT matched.
 *
 * Anchored to the WHOLE line (optional trailing colon / closing `**`) so it
 * only matches the bare footnote heading the prompt emits ("## Sources",
 * "**Sources:**"). A content heading like "## Sources of demand" must NOT
 * terminate dialogue collection — otherwise everything after it (real spoken
 * dialogue) would silently escape every grounding/refusal check.
 */
const SOURCES_FOOTNOTE_HEADING_RE =
  /^\s*(?:#{1,6}\s+|\*\*\s*)sources\s*:?\s*\*{0,2}\s*$/i;

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
    // Stop at the Sources footnote — it and everything after it is audit
    // metadata, never spoken dialogue.
    if (SOURCES_FOOTNOTE_HEADING_RE.test(raw)) break;
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

/**
 * Return the text of the `## Sources` footnote (everything AFTER the bare
 * Sources heading), or "" when the script has no footnote. Mirror image of the
 * `stripToDialogue` cut: that function keeps everything BEFORE the heading; this
 * keeps everything after. Used by `checkUnlistedMarketStat` to confirm every
 * real market number the body speaks is also listed in the audit footnote.
 */
export function extractSourcesFootnote(script: string): string {
  const lines = script.split(/\r?\n/);
  const idx = lines.findIndex((l) => SOURCES_FOOTNOTE_HEADING_RE.test(l));
  if (idx === -1) return "";
  return lines.slice(idx + 1).join("\n");
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
/*  Rule 2b — no "...for a second" filler tail.                           */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * ARC polish decision: the standalone signature "Think about that." stays
 * approved, but the padded "...for a second" tail ("think about that for a
 * second", "stop on that for a second", "sit with that for a second") is a
 * filler tic that softens the beat. We catch the tail anywhere in spoken
 * dialogue. Because the bare "Think about that." never contains "for a
 * second", the approved signature is unaffected.
 *
 * The lookahead requires "for a second" to sit at a clause/sentence boundary
 * (end-of-line or punctuation) — the adverbial filler form. This avoids
 * false-positiving the literal "a second <noun>" sense ("for a second home",
 * "for a second opinion", "for a second time"), where a noun (not punctuation)
 * follows.
 */
const FOR_A_SECOND_RE = /\bfor a second\b(?=\s*(?:[.,!?;:]|$))/i;

export function checkNoForASecondTail(script: string): ScriptViolation[] {
  const { dialogue, dialogueLineMap } = stripToDialogue(script);
  const violations: ScriptViolation[] = [];
  const lines = dialogue.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const m = FOR_A_SECOND_RE.exec(normalizeApostrophes(lines[li]));
    if (!m) continue;
    violations.push({
      rule: "no_avatar_pander",
      severity: "error",
      message:
        'Found the filler tail "for a second". Drop it — the standalone ' +
        '"Think about that." lands harder than "Think about that for a ' +
        'second." Remove the padded tail.',
      snippet: snippetAround(lines[li], m),
      line: dialogueLineMap[li],
    });
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Rule 2c — no "wait a second, let me back up" self-interruption filler. */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Voice watch list (extension): the "wait a second, let me back up" tic — and
 * its close variants — is a verbal stall that breaks the confident, forward
 * cadence the channel runs on. We ban the self-interruption family anywhere in
 * spoken dialogue. The full phrase ("wait a second, let me back up") is the
 * canonical example; the variants below catch the same move expressed as
 * "hold on, let me rewind", "let me back up for a second", "let me start over",
 * etc. Reported under `no_avatar_pander` (the existing filler bucket) so the
 * re-prompt loop + Script Review treat it like the other padded-filler bans.
 */
const BACKUP_FILLER_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\bwait a (?:second|sec|minute|moment)\b/i, label: "wait a second" },
  { pattern: /\bhold on a (?:second|sec|minute|moment)\b/i, label: "hold on a second" },
  { pattern: /\bhold on,?\s+let me\b/i, label: "hold on, let me…" },
  { pattern: /\blet me back up\b/i, label: "let me back up" },
  { pattern: /\bback up for a (?:second|sec|minute|moment)\b/i, label: "back up for a second" },
  { pattern: /\blet me rewind\b/i, label: "let me rewind" },
  { pattern: /\blet me start (?:over|again)\b/i, label: "let me start over" },
];

export function checkNoBackupFiller(script: string): ScriptViolation[] {
  const { dialogue, dialogueLineMap } = stripToDialogue(script);
  const violations: ScriptViolation[] = [];
  const lines = dialogue.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const line = normalizeApostrophes(lines[li]);
    for (const { pattern, label } of BACKUP_FILLER_PATTERNS) {
      const m = pattern.exec(line);
      if (!m) continue;
      violations.push({
        rule: "no_avatar_pander",
        severity: "error",
        message:
          `Found the self-interruption filler "${label}". Cut it — the line ` +
          `lands harder without the verbal stall. Restructure so the point ` +
          `arrives directly instead of backing up to it.`,
        snippet: snippetAround(lines[li], m),
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
  /**
   * Neighbourhood the value belongs to. Optional for backward compatibility,
   * but when supplied (the v2 route + scriptBuilder pass the full
   * `SourceOfTruthMetric` rows, which carry it) `no_sot_disagreement` scopes
   * its canonical-value comparison to the neighbourhood the spoken stat is
   * actually about — so a wrong figure for one neighbourhood can't be excused
   * by a coincidentally-matching value from a DIFFERENT neighbourhood.
   */
  neighbourhood?: string;
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
    // "15-20%" / "15 to 20%" / "15–20%" ranges — the trailing "20%" is caught
    // by the percent pattern above, but the LEADING endpoint ("15") has no "%"
    // of its own. Capture it too so an unsourced industry-norm range ("failure
    // rates run 15-20%", "selling 5-10% below asking") is grounded on BOTH ends.
    { re: /\b(\d+(?:\.\d+)?)\s*(?:-|–|—|\bto\b)\s*\d+(?:\.\d+)?\s*%/gi, unit: "percent" },
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

/* ─────────────────────────────────────────────────────────────────────── */
/*  Framework / definitional number exemptions (family-agnostic grounding) */
/*                                                                         */
/*  The grounding rules treat EVERY market-shaped number in the body as a  */
/*  claim about the member's market that must trace to a fact. A small set  */
/*  of numbers are NOT member data, though — they're the channel's own      */
/*  definitional FRAMEWORK constants and must stay ALLOWED unsourced, or    */
/*  the validator over-blocks legitimate framework language ("anything      */
/*  below 2.5 months of inventory is a sellers market"; "100% of asking     */
/*  means full price"). Structural numbers (lead-magnet 1/3, timestamps,    */
/*  title numbers, section counts) are bare integers with no currency /     */
/*  percent / duration unit, so extractStatTokens never surfaces them — no  */
/*  exemption needed for those.                                            */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Months-of-inventory market-state band cutoffs from the channel's own
 * framework (below 2.5 = sellers, 2.5–4.0 = balanced, above 4.0 = buyers,
 * plus the 5–6 high-end balanced exception). Only these canonical band
 * values are candidates — an arbitrary "4.44 months" is real data, not a
 * band cutoff, and stays subject to grounding.
 */
const MOI_BAND_VALUES = new Set([2, 2.5, 3, 4, 4.5, 5, 6]);

/** Market-state language signalling a band DEFINITION (not a data claim). */
const MOI_BAND_MARKET_CONTEXT =
  /(seller'?s?\s+market|buyer'?s?\s+market|balanced|market\s+type|threshold)/i;

/**
 * Comparator / range framing a band cutoff is stated with ("below 2.5",
 * "above 4.0", "2.5 to 4.0", "between", "anything above"). Requiring a
 * comparator AND market context together is what separates a framework band
 * ("below 2.5 months is a sellers market") from a market DATA claim ("we're
 * sitting at 2.5 months here") — the latter carries the band value but no
 * band framing, so it stays flagged and must be sourced.
 */
const MOI_BAND_COMPARATOR =
  /(below|under|above|over|less\s+than|more\s+than|between|up\s+to|at\s+least|anything\s+(?:below|above|under|over)|\bto\b)/i;

/**
 * First-person CURRENT-STATE inventory phrasing ("we're at 2.5", "we are
 * below 2.5", "sitting at 2.5 right now"). When a band value is framed this
 * way it's a DATA claim about the member's OWN market — not the framework
 * definition — so it must NOT be exempted even though the band value +
 * comparator + market-type words happen to co-occur in the window. (The
 * definitional form "anything below 2.5 months is a sellers market" carries
 * none of these subjects, so it stays exempt.)
 */
const MOI_DATA_CLAIM_OVERRIDE =
  /\b(?:we'?re|we\s+are)\s+(?:currently\s+|now\s+|sitting\s+)?(?:at|below|under|above|over|around)\b|\bsitting\s+at\b/i;

/**
 * Whether a numeric stat token is a FRAMEWORK constant / definitional number
 * (allowed unsourced) rather than a specific member-market data claim. Covers
 * the MOI market-state bands and the "100% of asking means full price"
 * definition. Everything else — comparison/temporal stats, %, $, months,
 * days, ranges, "in [year]" figures — is a data claim and must trace to a
 * fact and appear in "## Sources".
 */
function isFrameworkOrDefinitionalNumber(
  dialogue: string,
  tok: ExtractedStatToken,
): boolean {
  const window = windowAround(dialogue, tok.offset, 7);
  // MOI band cutoff: a canonical band value stated with comparator + market
  // context ("anything below 2.5 months of inventory is a sellers market").
  if (
    tok.unit === "months" &&
    MOI_BAND_VALUES.has(tok.value) &&
    MOI_BAND_MARKET_CONTEXT.test(window) &&
    MOI_BAND_COMPARATOR.test(window) &&
    !MOI_DATA_CLAIM_OVERRIDE.test(window)
  ) {
    return true;
  }
  // Definitional "100% of asking/list = full price" — NOT a sale-to-list data
  // claim. A bare "selling at 100%" / "99% of list" without the "of asking …
  // full price" definition stays a data claim and must be sourced.
  if (
    tok.unit === "percent" &&
    tok.value === 100 &&
    /100\s*%\s+of\s+(?:the\s+)?(?:asking|list)/i.test(window) &&
    /(full\s+price|means|equals|=|that'?s|is\s+full)/i.test(window)
  ) {
    return true;
  }
  return false;
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

    // Framework constant / definitional number ("anything below 2.5 months
    // of inventory is a sellers market", "100% of asking means full price")
    // — allowed unsourced; it's the channel's own framework, not member data.
    if (isFrameworkOrDefinitionalNumber(dialogue, tok)) continue;

    // Only compare against SoT entries whose family produces the same
    // spoken unit as the token. This is what stops "5%" colliding with
    // a "$5K" SoT row or "30 days" colliding with "30 months" inventory.
    const match = sotComparable.find(
      (s) => s.unit === tok.unit && withinTolerance(s.value, tok.value),
    );

    // Path A — untraceable stat (fabrication / unsourced market claim).
    // FAMILY-AGNOSTIC: every market-shaped number is a claim about the
    // member's market and must trace to a fact, REGARDLESS of whether the
    // data set happens to carry that metric family. Previously this path
    // only fired when an anchor of the SAME unit already existed (the
    // `haveAnchorsOfUnit` gate), so an invented number in a unit with no
    // matching family — "buyers are taking 40% longer to make an offer than
    // 2024" when there's no SP/LP or failure-rate fact — slipped through
    // both this rule and unlisted_market_stat. That gate is removed:
    // framework/definitional numbers are exempted above, profile numbers
    // below, and everything else must resolve to a real fact or it's an
    // ERROR that drives the re-prompt loop (same as an unsourced MOI).
    if (!match) {
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
          `Stat "${tok.raw}" is presented as a fact about this market but ` +
          `doesn't match any value in your deterministic source-of-truth ` +
          `metrics or the cited-facts block (within 2% tolerance). This holds ` +
          `for EVERY number family and shape — comparison/temporal stats ` +
          `("40% longer than 2024"), %, $, months, days, ranges ("15-20%"), ` +
          `sale-to-list ("100%/99%"), industry-norm figures. Either re-anchor ` +
          `"${tok.raw}" to a real number from the data AND list it in ` +
          `"## Sources", or remove it / reframe it as general with no specific ` +
          `figure — the channel's edge is precision, not vibes.`,
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
/*  unlisted_market_stat — every REAL number must appear in ## Sources.   */
/*                                                                        */
/*  Fix 2 — source EVERY number family, not just MOI + price. The prompt  */
/*  already asks for a complete "## Sources" footnote, but nothing        */
/*  enforced it, so drafts shipped with failure-rate (181%, 72%), DOM     */
/*  (21, 34, 36) and sale-to-list numbers spoken in the body but absent   */
/*  from the footnote. `unanchored_stat` only catches FABRICATIONS        */
/*  (numbers NOT in the data); a real number that's just unsourced slips   */
/*  through. This rule closes that gap: for each body stat token that      */
/*  matches a real SoT / cited-fact value (so it IS a market number),      */
/*  require its value to also appear in the "## Sources" footnote. Missing */
/*  → ERROR, so the re-prompt loop forces the writer to list it — exactly  */
/*  the way an unsourced MOI is rejected. Ships drafts at 0 issues only    */
/*  once every family is sourced.                                          */
/* ────────────────────────────────────────────────────────────────────── */

export function checkUnlistedMarketStat(
  script: string,
  sourceOfTruth: SourceOfTruthValue[] | undefined,
  citedFacts: CitedFactValue[] | undefined = undefined,
): ScriptViolation[] {
  const hasSot = sourceOfTruth && sourceOfTruth.length > 0;
  const hasCited = citedFacts && citedFacts.length > 0;
  // Without any anchors we can't tell which body numbers are real market
  // stats, so we stay silent (the same guard the other grounding rules use).
  if (!hasSot && !hasCited) return [];

  const { dialogue } = stripToDialogue(script);
  const tokens = extractStatTokens(dialogue);
  if (tokens.length === 0) return [];

  // Build the set of real market values (with unit) the body could legitimately
  // speak — direct SoT, member-cited facts, plus the SP/LP inverse derivation.
  // `derivedOnly` marks anchors that only exist as an inverse phrasing ("3.3%
  // below asking"): we do NOT force those into the footnote (the writer lists
  // the ratio, not every inverse phrasing), to keep the rule false-positive-free.
  const anchors: Array<{ unit: StatUnit; value: number; derivedOnly: boolean }> = [];
  if (hasSot) {
    for (const sot of sourceOfTruth!) {
      const unit = unitForFamily(sot.metricFamily);
      if (!unit) continue;
      for (const v of normalizeForCompare(sot.metricFamily, sot.metricValue)) {
        anchors.push({ unit, value: v, derivedOnly: false });
      }
      if (sot.metricFamily === "SP_LP") {
        const ratio = sot.metricValue <= 2 ? sot.metricValue : sot.metricValue / 100;
        const discount = (1 - ratio) * 100;
        if (discount !== 0) {
          anchors.push({ unit: "percent", value: Math.abs(discount), derivedOnly: true });
        }
      }
    }
  }
  if (hasCited) {
    for (const c of citedFacts!) {
      if (!c.raw) continue;
      for (const t of extractStatTokens(c.raw)) {
        anchors.push({ unit: t.unit, value: t.value, derivedOnly: false });
      }
    }
  }
  if (anchors.length === 0) return [];

  // Footnote numbers — parsed unit-agnostically (bare digits included) so a
  // "21 — days on market" bullet counts even without a unit suffix. Presence in
  // the footnote is matched on VALUE within tolerance; an audit bullet listing
  // the number is enough proof it's sourced, regardless of how it's phrased.
  const footnote = extractSourcesFootnote(script);
  const footnoteValues = extractProfileNumbers(footnote).map((p) => p.value);

  const violations: ScriptViolation[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    // Skip narrative time references ("over the next 90 days") — same filter
    // unanchored_stat applies so we never treat a non-stat as a market number.
    if (
      (tok.unit === "months" || tok.unit === "days") &&
      TIME_REFERENCE_PATTERN.test(tok.raw) &&
      !isMarketTimeAnchored(dialogue, tok.offset)
    ) {
      continue;
    }

    // Framework / definitional numbers (MOI bands, "100% of asking means
    // full price") are allowed unsourced — never force them into the footnote.
    if (isFrameworkOrDefinitionalNumber(dialogue, tok)) continue;

    const matched = anchors.filter(
      (a) => a.unit === tok.unit && withinTolerance(a.value, tok.value),
    );
    // Not a real market number (fabrications are unanchored_stat's job), or it
    // only matches an inverse SP/LP derivation we don't force into the footnote.
    if (matched.length === 0) continue;
    if (matched.every((a) => a.derivedOnly)) continue;

    // Listed if the footnote carries a number within tolerance of the spoken
    // token OR of the underlying anchor value it matched (covers footnote/body
    // rounding differences — body "$615K", footnote "$615,000").
    const listed = footnoteValues.some(
      (v) =>
        withinTolerance(v, tok.value) ||
        matched.some((a) => withinTolerance(v, a.value)),
    );
    if (listed) continue;

    const dedupeKey = `${tok.unit}|${tok.value}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    violations.push({
      rule: "unlisted_market_stat",
      severity: "error",
      message:
        `Stat "${tok.raw}" is a real number from your data but it is not listed ` +
        `in the "## Sources" footnote. EVERY market number you speak — months of ` +
        `inventory, price, price per square foot, sale-to-list, days on market, ` +
        `failure rate, absorption — must appear in the footnote mapped to its fact ` +
        `id. Add a "## Sources" bullet for this number, or remove it from the script.`,
      snippet: dialogue
        .slice(Math.max(0, tok.offset - 60), tok.offset + tok.raw.length + 20)
        .trim(),
    });
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  no_sot_disagreement — canonical = Source-of-Truth (ERROR).            */
/*                                                                        */
/*  Extends grounding past "is this number real anywhere?" to "does this  */
/*  number agree with the CANONICAL aggregate?". The failure mode this    */
/*  catches: a per-fact cited value disagrees with the aggregated         */
/*  source-of-truth for the same metric, and the script followed the      */
/*  per-fact value. Real case: Westmount MOI — SoT 3.8, a cited fact      */
/*  said 4.29, and the script wrote 4.3. unanchored_stat PASSES that      */
/*  (4.3 is within 2% of the cited 4.29), so we need a second gate:       */
/*  when a token matches a cited fact of its unit but disagrees with the  */
/*  SoT of that same unit beyond rounding, the SoT wins — flag it.        */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Tight "rounding-only" agreement: two values are the same number once you
 * account for display rounding. Absolute 0.05 covers 1-decimal metrics
 * (MOI/percent: 3.80 vs 3.82), and 0.5% relative covers rounded currency
 * ($611,500 → "$612,000"). Deliberately MUCH tighter than the 2% used for
 * "does this trace to a fact at all" — here we're asking "is it the SAME
 * canonical number", not "is it in the ballpark of a real number".
 */
function withinRounding(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  const denom = Math.max(Math.abs(a), Math.abs(b));
  return diff <= Math.max(0.05, 0.005 * denom);
}

export function checkNoSotDisagreement(
  script: string,
  sourceOfTruth: SourceOfTruthValue[] | undefined,
  citedFacts: CitedFactValue[] | undefined = undefined,
  neighbourhoods: readonly string[] | undefined = undefined,
): ScriptViolation[] {
  const hasSot = sourceOfTruth && sourceOfTruth.length > 0;
  const hasCited = citedFacts && citedFacts.length > 0;
  // The rule is only meaningful when BOTH a canonical SoT and per-fact cited
  // values exist — it arbitrates a disagreement BETWEEN them. With only one
  // source there's nothing to reconcile.
  if (!hasSot || !hasCited) return [];

  const sotComparable: Array<{
    family: string;
    unit: StatUnit;
    value: number;
    neighbourhood?: string;
  }> = [];
  for (const sot of sourceOfTruth!) {
    const unit = unitForFamily(sot.metricFamily);
    if (!unit) continue;
    const hood = sot.neighbourhood?.trim().toLowerCase();
    for (const v of normalizeForCompare(sot.metricFamily, sot.metricValue)) {
      sotComparable.push({ family: sot.metricFamily, unit, value: v, neighbourhood: hood });
    }
  }
  if (sotComparable.length === 0) return [];

  // For neighbourhood scoping: locate the neighbourhood name nearest BEFORE a
  // given offset so a spoken stat is compared only against its own
  // neighbourhood's canonical values (+ the "All Neighbourhoods" rollup).
  const neighbourhoodRe = neighbourhoods
    ? buildNeighbourhoodRegex(neighbourhoods)
    : null;
  const ALL_HOODS = "all neighbourhoods";
  const nearestHoodBefore = (text: string, offset: number): string | null => {
    if (!neighbourhoodRe) return null;
    neighbourhoodRe.lastIndex = 0;
    let last: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = neighbourhoodRe.exec(text)) !== null) {
      if (m.index >= offset) break;
      last = m[0].toLowerCase();
      if (m.index === neighbourhoodRe.lastIndex) neighbourhoodRe.lastIndex++;
    }
    return last;
  };

  const citedComparable: Array<{ unit: StatUnit; value: number }> = [];
  for (const c of citedFacts!) {
    if (!c.raw) continue;
    for (const t of extractStatTokens(c.raw)) {
      citedComparable.push({ unit: t.unit, value: t.value });
    }
  }
  if (citedComparable.length === 0) return [];

  const { dialogue } = stripToDialogue(script);
  const tokens = extractStatTokens(dialogue);
  if (tokens.length === 0) return [];

  const violations: ScriptViolation[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    // Skip narrative time spans ("18 months to show up") — same guard the
    // misattribution rule uses; they aren't market stats.
    if (
      (tok.unit === "months" || tok.unit === "days") &&
      TIME_REFERENCE_PATTERN.test(tok.raw) &&
      !isMarketTimeAnchored(dialogue, tok.offset)
    ) {
      continue;
    }

    const sotOfUnit = sotComparable.filter((s) => s.unit === tok.unit);
    if (sotOfUnit.length === 0) continue;

    // The contested case only: the token follows a per-fact cited value
    // (within the loose 2% trace tolerance) ...
    const citedMatch = citedComparable.some(
      (c) => c.unit === tok.unit && withinTolerance(c.value, tok.value),
    );
    if (!citedMatch) continue;

    // Scope the canonical pool to the neighbourhood the spoken stat is about.
    // Use the neighbourhood named nearest BEFORE the token, restricting to that
    // neighbourhood's rows plus the "All Neighbourhoods" rollup. This stops a
    // wrong figure for one neighbourhood from being excused by a coincidentally
    // identical value belonging to a DIFFERENT neighbourhood. We only narrow
    // when the scoped pool is non-empty; otherwise (no hood context, or SoT
    // rows carry no neighbourhood tag) we fall back to the full unit pool so
    // coverage is never lost.
    const tokHood = nearestHoodBefore(dialogue, tok.offset);
    let sotScoped = sotOfUnit;
    if (tokHood) {
      const narrowed = sotOfUnit.filter(
        (s) => s.neighbourhood === tokHood || s.neighbourhood === ALL_HOODS,
      );
      if (narrowed.length > 0) sotScoped = narrowed;
    }

    // ... but does NOT agree with ANY canonical SoT value of that unit once
    // rounding is accounted for. If it agrees with some SoT value, it's fine
    // (the cited fact and SoT happen to match, or the script picked the SoT).
    const sotAgrees = sotScoped.some((s) => withinRounding(s.value, tok.value));
    if (sotAgrees) continue;

    // Report the nearest SoT value (from the neighbourhood-scoped pool) so the
    // re-prompt knows the canonical figure to swap in.
    const nearestSot = sotScoped.reduce((best, s) =>
      Math.abs(s.value - tok.value) < Math.abs(best.value - tok.value) ? s : best,
    );
    const dedupeKey = `${tok.raw}|${nearestSot.family}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    violations.push({
      rule: "no_sot_disagreement",
      severity: "error",
      message:
        `Stat "${tok.raw}" matches a per-fact cited value but disagrees with your ` +
        `canonical source-of-truth ${nearestSot.family} (${nearestSot.value}) beyond ` +
        `rounding. The aggregated source-of-truth is canonical — use ${nearestSot.value} ` +
        `(rounded), or drop the number. Never let a per-fact figure override the SoT.`,
      snippet: dialogue
        .slice(Math.max(0, tok.offset - 60), tok.offset + tok.raw.length + 20)
        .trim(),
    });
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  unsourced_factual_claim — ground SPECIFIC claims, not just stats.     */
/*                                                                        */
/*  Grounding historically covered market-stat units (currency, percent,  */
/*  MOI, DOM). But a script can still fabricate SPECIFIC non-market       */
/*  facts: demographics ("median household income is $95,000", "median    */
/*  age of 34"), population counts, or dated events ("the school opened   */
/*  in 2019"). These must trace to a real source too — a cited fact, the  */
/*  source-of-truth, or the member's Knowledge Base neighbourhood profile */
/*  text. If the asserted number isn't in any of those, it's invented and */
/*  must not be stated as fact.                                           */
/*                                                                        */
/*  Deterministic scope: NUMERIC claims sitting in an unambiguous factual */
/*  frame (demographic keyword, population, event-verb + year). Purely    */
/*  qualitative prose claims ("this is the most walkable area") are not    */
/*  regex-detectable without heavy false positives — those are enforced   */
/*  via the prompt + Script Review, not here.                             */
/* ────────────────────────────────────────────────────────────────────── */

type FactualClaim = {
  /** The numeric value asserted. */
  value: number;
  /** Normalized digit string ($/comma/% stripped) for verbatim matching. */
  normalized: string;
  /** Raw matched fragment for the snippet/message. */
  raw: string;
  /** 0-indexed offset of the number in the dialogue. */
  offset: number;
  /**
   * "year" claims (dated events) must match a source verbatim — a 2% band
   * around 2019 spans four decades, which is meaningless. "demographic"
   * claims may match within the normal 2% trace tolerance.
   */
  kind: "year" | "demographic";
};

/** Demographic frame keywords — a number near one of these reads as a stated
 *  demographic fact about the place, not a narrative aside. */
const DEMOGRAPHIC_KEYWORD_RE =
  /\b(?:median|average|avg\.?)\s+(?:household\s+)?(?:income|age|home\s+values?|household\s+size|net\s+worth)\b|\bpopulation\s+of\b|\b(?:residents|inhabitants)\b/i;

/** event-verb + 4-digit year, e.g. "opened in 2019", "built back in 1998". */
const DATED_EVENT_RE =
  /\b(?:opened|built|established|founded|completed|renovated|expanded|constructed|developed|launched)\s+(?:in\s+|back\s+in\s+)?((?:19|20)\d{2})\b/gi;

/** A currency/number token sitting within a demographic frame. */
const DEMOGRAPHIC_NUMBER_RE =
  /(\$?\s*\d[\d,]*(?:\.\d+)?\s*[KM]?)\s*(%)?/gi;

function collectFactualClaims(dialogue: string): FactualClaim[] {
  const claims: FactualClaim[] = [];

  // Dated events — the year must be sourced verbatim.
  DATED_EVENT_RE.lastIndex = 0;
  let dm: RegExpExecArray | null;
  while ((dm = DATED_EVENT_RE.exec(dialogue)) !== null) {
    const year = dm[1];
    const value = Number(year);
    if (!Number.isFinite(value)) continue;
    claims.push({
      value,
      normalized: year,
      raw: dm[0],
      offset: dm.index,
      kind: "year",
    });
  }

  // Demographic figures — scan each demographic-framed window for a number.
  // We walk the dialogue keyword-by-keyword so we only pull numbers that sit
  // inside an explicit demographic frame (keeps false positives off generic
  // numbers elsewhere in the script).
  const kw = new RegExp(DEMOGRAPHIC_KEYWORD_RE.source, "gi");
  let km: RegExpExecArray | null;
  while ((km = kw.exec(dialogue)) !== null) {
    // Look in a window starting a little before the keyword (covers "the
    // median income here, $95,000, ...") through ~12 words after it.
    const start = Math.max(0, km.index - 40);
    const windowText = dialogue.slice(start, km.index + km[0].length + 90);
    const numRe = new RegExp(DEMOGRAPHIC_NUMBER_RE.source, "gi");
    let nm: RegExpExecArray | null;
    while ((nm = numRe.exec(windowText)) !== null) {
      const rawNum = nm[1];
      const isPercent = Boolean(nm[2]);
      const cleaned = rawNum.replace(/[,$\s]/g, "");
      let value = Number(cleaned.replace(/[KM]$/i, ""));
      if (!Number.isFinite(value)) continue;
      if (/K$/i.test(cleaned)) value *= 1_000;
      else if (/M$/i.test(cleaned)) value *= 1_000_000;
      // Skip the year-like bare integers already covered as dated events, and
      // skip trivially-small ordinals (1, 2) that are almost never demographic
      // facts and inflate false positives.
      if (!isPercent && !/[$.,KM]/i.test(rawNum) && value >= 1 && value <= 4) {
        continue;
      }
      const absOffset = start + nm.index;
      claims.push({
        value,
        normalized: cleaned.replace(/[KM]$/i, ""),
        raw: rawNum.trim() + (isPercent ? "%" : ""),
        offset: absOffset,
        kind: "demographic",
      });
    }
  }

  return claims;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Qualitative (NON-numeric) neighbourhood facts.                         */
/*                                                                         */
/*  Build-era decades, housing-stock styles, worded demographic           */
/*  descriptors, and named-institution/amenity attributes are all         */
/*  *verifiable specifics* about a place. Asserted as fact they must trace */
/*  to the member's KB neighbourhood profile (or a cited fact) exactly     */
/*  like a market number — otherwise they're invented.                     */
/*                                                                         */
/*  Stays ALLOWED (don't over-block): the creator's interpretation of the */
/*  data ("buyers are being methodical"), framework mechanics (MOI         */
/*  thresholds), and clearly-experiential framing ("I've seen this area    */
/*  appeal to families"). Achieved via: a curated vocabulary (no generic   */
/*  pricing words), an attribution-frame requirement for soft descriptors, */
/*  and a first-person hedge exemption that applies ONLY to soft           */
/*  descriptors (a hedge can't launder a hard specific like a build        */
/*  decade, a named institution's rating, or an income comparative).       */
/* ────────────────────────────────────────────────────────────────────── */

type QualKind = "build_era" | "housing_style" | "demographic" | "institution";

type QualitativeClaim = {
  raw: string;
  offset: number;
  kind: QualKind;
  /** Lowercase salient terms grouped by requirement: the claim is "sourced"
   *  only when EVERY group has at least one term present in the profile /
   *  cited-fact text. A single group => "any of these"; two groups => e.g.
   *  the institution noun AND its attribute must both appear (so "top-rated
   *  schools" isn't grounded by a profile that merely lists "schools"). */
  termGroups: string[][];
  /** Soft descriptors may be reframed as the creator's experience — a
   *  first-person hedge exempts them. Hard specifics (decades, styles,
   *  institutions, demographic comparatives) may NOT be laundered by a hedge. */
  hedgeable: boolean;
};

const QUAL_LABEL: Record<QualKind, string> = {
  build_era: "Build-era claim",
  housing_style: "Housing-stock claim",
  demographic: "Demographic claim",
  institution: "Named institution/amenity claim",
};

/** Build/housing context — a decade only reads as a *housing-stock* fact when
 *  one of these sits next to it (keeps "back in the 1990s I started…" out). */
const BUILD_CONTEXT_RE =
  /\b(?:built|build|building|constructed|construction|developed|development|erected|homes?|housing|houses|neighbou?rhood|subdivisions?|stock|dating\s+back|date[sd]?\s+back|put\s+up)\b/i;

/** A decade reference: "1990s", "the 2010s", "mid-2010s", "early 2000s". */
const DECADE_RE = /\b(?:early|mid|late)?[-\s]?((?:19|20)\d0)['’]?s\b/gi;

/** Housing-stock STYLE descriptors. Deliberately excludes generic property
 *  types (condo/townhouse/detached) that appear constantly in pricing prose. */
const HOUSING_STYLE_RE =
  /\b(?:single|two|three)[-\s]?stor(?:y|ey|ies)\b|\branch(?:es)?(?:[-\s]?(?:style[ds]?|home[s]?|house[s]?))\b|\bbungalows?\b|\bsplit[-\s]?levels?\b|\bcraftsman\b|\bvictorians?\b|\btudors?\b|\bcolonials?\b|\bcape\s+cods?\b|\bmid[-\s]?century\b|\bcharacter\s+homes?\b|\bheritage\s+homes?\b|\bcustom[-\s]?built\b|\bnewer\s+construction\b|\bnew\s+construction\b|\bnew(?:ly)?\s+built\b|\brecently\s+built\b|\bpost[-\s]?war\b|\bpre[-\s]?war\b|\bmodern\s+amenities\b/gi;

/** Soft demographic descriptors — vague enough to be reframed as experience. */
const DEMO_SOFT_RE =
  /\bskews?\s+(?:much\s+|slightly\s+|noticeably\s+)?(?:older|younger|wealthier|more\s+affluent|affluent|blue[-\s]?collar|white[-\s]?collar)\b|\byoung\s+famil(?:y|ies)\b|\bgrowing\s+famil(?:y|ies)\b|\bfirst[-\s]?time\s+buyers?\b|\bempty[-\s]?nesters?\b|\bretirees?\b|\bmove[-\s]?up\s+buyers?\b/gi;

/** Hard demographic comparative (no number needed): "median household income
 *  runs higher than the regional average". */
const DEMO_HARD_RE =
  /\b((?:median|average)\s+(?:household\s+)?(?:income|age|home\s+values?|net\s+worth))\b[^.?!]{0,60}\b(?:higher|lower|above|below|outpaces?|exceeds?|trails?|tops?)\b[^.?!]{0,30}\b(?:average|regional|city|provincial|national|median)\b/gi;

/** Soft descriptors only count as an area-fact inside an attribution frame —
 *  "home to young families" (fact) vs "first-time buyers should watch rates"
 *  (audience address, allowed). "skews …" is self-attributing and exempt. */
const ATTRIBUTION_RE =
  /\b(?:home\s+to|full\s+of|filled\s+with|lots\s+of|plenty\s+of|attracts?|drawing|draws?|drew|drawn|popular\s+with|dominated\s+by|made\s+up\s+of|magnet\s+for|favou?red\s+by|geared\s+(?:toward|towards|to)|catering\s+to|caters\s+to|known\s+for|packed\s+with|teeming\s+with|are\s+mostly|mostly|primarily)\b/i;

/** School + a quality/rating attribute (either order). */
const SCHOOL_RATING_RE =
  /\bschools?\b[^.?!]{0,45}\b(?:rated|ranked|top[-\s]?rated|highly[-\s]?rated|ratings?|rankings?|scores?|test\s+scores?|best|award[-\s]?winning|blue[-\s]?ribbon|\d(?:\.\d)?\s*(?:out\s+of|\/)\s*10)\b|\b(?:rated|ranked|top[-\s]?rated|highly[-\s]?rated|ratings?|rankings?|award[-\s]?winning|blue[-\s]?ribbon)\b[^.?!]{0,25}\bschools?\b/gi;

const HOA_FEES_RE = /\bHOA\s+(?:fees?|dues?|costs?)\b/gi;
const ENERGY_EFFICIENT_RE = /\benergy[-\s]?efficient\b/gi;

/** Curated, non-generic style roots used to ground a housing-stock claim.
 *  Separators are normalized before matching, so "single stor" grounds both
 *  "single-story" and "single storey". Deliberately omits bare tokens like
 *  "single" or "story" that would let unrelated profile prose source a claim. */
const STYLE_ROOTS = [
  "single stor",
  "two stor",
  "three stor",
  "ranch",
  "bungalow",
  "split level",
  "craftsman",
  "victorian",
  "tudor",
  "colonial",
  "cape cod",
  "mid century",
  "character home",
  "heritage home",
  "custom built",
  "newer construction",
  "new construction",
  "newly built",
  "recently built",
  "post war",
  "pre war",
  "modern amenities",
];

/** Rating/ranking attribute words that must appear in the profile/cited facts
 *  alongside "school" before a "top-rated schools" claim is considered sourced. */
const SCHOOL_RATING_GROUP = [
  "rated",
  "rating",
  "ranked",
  "ranking",
  "score",
  "best",
  "award",
  "ribbon",
  "out of 10",
];
/** Community centre only flagged when paired with a specific attribute. */
const COMMUNITY_CENTRE_RE =
  /\bcommunity\s+cent(?:re|er)s?\b[^.?!]{0,40}\b(?:opened|built|hosts?|features?|named|brand[-\s]?new|new|state[-\s]?of[-\s]?the[-\s]?art|recently)\b|\b(?:brand[-\s]?new|new|state[-\s]?of[-\s]?the[-\s]?art)\b[^.?!]{0,20}\bcommunity\s+cent(?:re|er)s?\b/gi;

/** First-person experiential / opinion hedges — exempt SOFT descriptors. */
const QUAL_HEDGE_RE =
  /\b(?:i'?ve\s+seen|i\s+have\s+seen|in\s+my\s+experience|from\s+what\s+i'?ve\s+seen|i'?ve\s+noticed|i'?ve\s+found|i\s+find|in\s+my\s+opinion|i'?d\s+say|i\s+feel|i\s+think|personally|anecdotally|tends?\s+to|tend\s+to)\b/i;

/** Collapse hyphens/whitespace to a single space so separator variants match:
 *  "single-story", "single story", "single  storey" all normalize alike. */
function normalizeSeparators(s: string): string {
  return s.replace(/[-\s]+/g, " ").trim();
}

function decadeTerms(decade: string): string[] {
  // decade = "1990" → ["1990s", "1990", "90s"]
  return [`${decade}s`.toLowerCase(), decade.toLowerCase(), `${decade.slice(2)}s`];
}

function collectQualitativeClaims(dialogue: string): QualitativeClaim[] {
  const claims: QualitativeClaim[] = [];
  const window = (idx: number, len: number, before = 40, after = 40) =>
    dialogue.slice(Math.max(0, idx - before), idx + len + after);

  // Build-era decades (only in a housing/build context).
  DECADE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DECADE_RE.exec(dialogue)) !== null) {
    if (!BUILD_CONTEXT_RE.test(window(m.index, m[0].length))) continue;
    claims.push({
      raw: m[0].trim(),
      offset: m.index,
      kind: "build_era",
      termGroups: [decadeTerms(m[1])],
      hedgeable: false,
    });
  }

  // Housing-stock styles. Ground on the curated style root (e.g. "ranch") so a
  // profile that says "ranch homes" sources a "ranch styles" claim, without the
  // generic single-token fallback ("single"/"story") that lets unrelated prose
  // source it. The full phrase is kept as a fallback term.
  HOUSING_STYLE_RE.lastIndex = 0;
  while ((m = HOUSING_STYLE_RE.exec(dialogue)) !== null) {
    const full = normalizeSeparators(m[0].trim().toLowerCase());
    const roots = STYLE_ROOTS.filter((r) => full.includes(r));
    claims.push({
      raw: m[0].trim(),
      offset: m.index,
      kind: "housing_style",
      termGroups: [Array.from(new Set([full, ...roots]))],
      hedgeable: false,
    });
  }

  // Demographic descriptors — soft (require attribution frame).
  DEMO_SOFT_RE.lastIndex = 0;
  while ((m = DEMO_SOFT_RE.exec(dialogue)) !== null) {
    const isSkew = /^skews?\b/i.test(m[0]);
    if (!isSkew && !ATTRIBUTION_RE.test(window(m.index, m[0].length, 45, 0))) {
      continue;
    }
    claims.push({
      raw: m[0].trim(),
      offset: m.index,
      kind: "demographic",
      termGroups: [[m[0].trim().toLowerCase()]],
      hedgeable: true,
    });
  }

  // Demographic comparative — hard (specific, not hedgeable). Source on the
  // exact metric phrase OR its metric noun (income/age/home value/net worth) —
  // so a "median income" comparative is NOT grounded by a profile that only
  // mentions "median age".
  DEMO_HARD_RE.lastIndex = 0;
  while ((m = DEMO_HARD_RE.exec(dialogue)) !== null) {
    const phrase = m[1].toLowerCase();
    const nounMatch = phrase.match(
      /\b(income|age|home\s+values?|net\s+worth)\b/,
    );
    const group = [phrase];
    if (nounMatch) group.push(normalizeSeparators(nounMatch[1]));
    claims.push({
      raw: m[0].trim(),
      offset: m.index,
      kind: "demographic",
      termGroups: [Array.from(new Set(group))],
      hedgeable: false,
    });
  }

  // Named institutions / amenities + attributes. School-rating claims require
  // BOTH the institution noun AND a rating word in the source (so "schools and
  // parks" doesn't ground "top-rated schools"); the rest source on a single
  // group.
  for (const [re, groups] of [
    [SCHOOL_RATING_RE, [["school"], SCHOOL_RATING_GROUP]],
    [HOA_FEES_RE, [["hoa"]]],
    [ENERGY_EFFICIENT_RE, [["energy-efficient", "energy efficient"]]],
    [COMMUNITY_CENTRE_RE, [["community centre", "community center"]]],
  ] as [RegExp, string[][]][]) {
    re.lastIndex = 0;
    while ((m = re.exec(dialogue)) !== null) {
      claims.push({
        raw: m[0].trim().replace(/\s+/g, " "),
        offset: m.index,
        kind: "institution",
        termGroups: groups,
        hedgeable: false,
      });
    }
  }

  return claims;
}

export function checkUnsourcedFactualClaim(
  script: string,
  sourceOfTruth: SourceOfTruthValue[] | undefined,
  citedFacts: CitedFactValue[] | undefined = undefined,
  profileText: string[] = [],
): ScriptViolation[] {
  const hasSot = sourceOfTruth && sourceOfTruth.length > 0;
  const hasCited = citedFacts && citedFacts.length > 0;
  const hasProfile = profileText.some((t) => t && t.trim().length > 0);

  const { dialogue } = stripToDialogue(script);
  const violations: ScriptViolation[] = [];
  const seen = new Set<string>();

  // ── Qualitative claims ────────────────────────────────────────────────
  // These run REGARDLESS of whether numeric anchor sources exist: a specific
  // verifiable fact about a place that traces to no profile/fact is invented,
  // even when the member has no profile stored at all (then nothing can ground
  // it, so it must be cut or kept general).
  const sourceBlob = normalizeSeparators(
    [...profileText.filter(Boolean), ...(citedFacts ?? []).map((c) => c.raw || "")]
      .join("\n")
      .toLowerCase(),
  );
  for (const q of collectQualitativeClaims(dialogue)) {
    if (
      q.hedgeable &&
      QUAL_HEDGE_RE.test(dialogue.slice(Math.max(0, q.offset - 70), q.offset))
    ) {
      continue;
    }
    // Sourced only when EVERY required group has at least one term present
    // (separator-insensitive). Two groups => both the institution noun AND its
    // attribute must appear, so a profile that merely lists "schools" can't
    // ground a "top-rated schools" claim.
    const sourced = q.termGroups.every(
      (group) =>
        group.length > 0 &&
        group.some(
          (t) => t.length > 0 && sourceBlob.includes(normalizeSeparators(t)),
        ),
    );
    if (sourced) continue;

    const key = `q|${q.kind}|${q.raw.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    violations.push({
      rule: "unsourced_factual_claim",
      severity: "error",
      message:
        `${QUAL_LABEL[q.kind]} "${q.raw}" isn't backed by your Knowledge Base ` +
        `neighbourhood profile or any cited fact. Specific verifiable facts about ` +
        `a place — build era, housing style, demographics, named institutions/` +
        `amenities — must trace to your profile or data (and be cited in ` +
        `"## Sources"), exactly like a market stat. Either ground it in your ` +
        `profile, cut the specific and keep it general (e.g. "a family ` +
        `neighbourhood"), or reframe it as your own experience with no invented ` +
        `detail.`,
      snippet: dialogue
        .slice(Math.max(0, q.offset - 60), q.offset + q.raw.length + 20)
        .trim(),
    });
  }

  // ── Numeric claims (need at least one anchor source to judge against) ───
  // With no sources at all we can't tell a sourced number from an invented one,
  // so stay silent (matches the defensive posture of the other grounding rules).
  if (hasSot || hasCited || hasProfile) {
    // Build the anchor set: verbatim normalized digit strings + numeric values.
    const verbatim = new Set<string>();
    const numbers: number[] = [];
    const addNumber = (n: number, norm: string) => {
      if (Number.isFinite(n)) {
        numbers.push(n);
        verbatim.add(norm);
      }
    };
    for (const t of profileText) {
      for (const p of extractProfileNumbers(t)) addNumber(p.value, p.normalized);
    }
    if (hasCited) {
      for (const c of citedFacts!) {
        if (!c.raw) continue;
        for (const t of extractStatTokens(c.raw)) {
          addNumber(t.value, String(t.value));
        }
        // Also keep the raw cited digits verbatim (covers bare integers the
        // stat extractor skips, e.g. a population count in a cited fact).
        for (const dm of c.raw.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
          const norm = dm[0].replace(/,/g, "");
          addNumber(Number(norm), norm);
        }
      }
    }
    if (hasSot) {
      for (const sot of sourceOfTruth!) {
        for (const v of normalizeForCompare(sot.metricFamily, sot.metricValue)) {
          addNumber(v, String(v));
        }
      }
    }

    for (const claim of collectFactualClaims(dialogue)) {
      const anchored =
        verbatim.has(claim.normalized) ||
        (claim.kind === "demographic" &&
          numbers.some((n) => withinTolerance(n, claim.value)));
      if (anchored) continue;

      const dedupeKey = `${claim.kind}|${claim.normalized}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const what =
        claim.kind === "year"
          ? `Dated claim "${claim.raw}"`
          : `Demographic figure "${claim.raw}"`;
      violations.push({
        rule: "unsourced_factual_claim",
        severity: "error",
        message:
          `${what} isn't backed by any cited fact, your source-of-truth, or your ` +
          `Knowledge Base neighbourhood profile. Specific claims — demographics, ` +
          `dates, named-institution attributes — must trace to a real source, the ` +
          `same as market stats. Either ground it in your profile/data or cut the ` +
          `specific (keep it general).`,
        snippet: dialogue
          .slice(Math.max(0, claim.offset - 60), claim.offset + claim.raw.length + 20)
          .trim(),
      });
    }
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

/**
 * Lean floor applied when NO neighbourhood profile is loaded for the script.
 * The full 2,200-word floor assumes the model has FULL profile prose
 * (demographics, housing stock, lifestyle) to expand into. Without a profile,
 * demanding 2,200 words forces the model to invent demographic colour and
 * round-number stats — which the grounding gates (unsourced_factual_claim,
 * unanchored_stat) then reject, looping the script into a hard-fail. A lean,
 * fully-data-grounded market update is legitimately shorter, so we hold it to
 * a lower floor that's reachable from cited facts + the source-of-truth block
 * alone.
 */
export const LEAN_DIALOGUE_WORDS = 1200;

export function checkMinDialogueLength(
  script: string,
  hasProfile = true,
): ScriptViolation[] {
  const { dialogue } = stripToDialogue(script);
  const wordCount = dialogue.split(/\s+/).filter(Boolean).length;
  const floor = hasProfile ? MIN_DIALOGUE_WORDS : LEAN_DIALOGUE_WORDS;
  if (wordCount >= floor) return [];
  return [
    {
      rule: "min_dialogue_length",
      severity: "error",
      message: hasProfile
        ? `Script body is ${wordCount} dialogue words, below the ${floor}-word floor. ` +
          `Expand using the FULL neighbourhood profile content already in your system prompt — ` +
          `add named anchors, specific data points, editorial reactions, and back-half synthesis. ` +
          `DO NOT pad with filler, restated thesis, or generic framing.`
        : `Script body is ${wordCount} dialogue words, below the ${floor}-word lean floor. ` +
          `No neighbourhood profile is loaded for this script, so reach the floor using your cited ` +
          `facts and the SOURCE-OF-TRUTH METRICS block — segment by property type, compare ` +
          `neighbourhoods, and add genuine analysis of the numbers. ` +
          `DO NOT invent demographic colour, named amenities, or numbers to pad.`,
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
        `"Our team helps a family move every [X] hours" (ONLY the real number from ` +
        `MarketConfig.teamCredentials; if none is on file, do NOT state any ` +
        `frequency — not even a vague "every few days" — use a non-frequency ` +
        `experience bridge like "after years of running this analysis for ` +
        `families across the city..."), "Weekly since June 2020", "What I've ` +
        `learned in helping thousands of families through this market is...", or ` +
        `"After helping [X] families move through this exact pattern, here's what ` +
        `I know...". Sideways = woven into the explanation, never the first ` +
        `sentence, never a self-introduction.`,
      snippet: dialogue
        .slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)
        .trim(),
      line: originalLine,
    });
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  failure_rate_framing (ERROR).                                          */
/*                                                                        */
/*  failure_rate is offMarket / sold — a RATIO that can exceed 100%, NOT  */
/*  a share of all listings. Saying "47% of homes failed to sell" reads   */
/*  the ratio as a share and is mathematically wrong. Honest framing uses */
/*  sale_share ("X% of listings sold") or explicit counts ("for every 10 */
/*  that sold, 9 failed to sell"). Flag any percentage tied to a failure- */
/*  to-sell phrase in spoken dialogue.                                    */
/* ────────────────────────────────────────────────────────────────────── */

const FR_FAILURE_VERB =
  "(?:failed?\\s+to\\s+sell|did(?:n['’]?t| not)\\s+sell|never\\s+sold|don['’]?t\\s+sell|won['’]?t\\s+sell|fail(?:ed|ing)?\\s+to\\s+find\\s+a\\s+buyer)";
const FR_PERCENT = "\\d{1,3}(?:\\.\\d+)?\\s*(?:%|percent)";
const FR_PCT_THEN_FAIL = new RegExp(
  `${FR_PERCENT}[^.?!\\n]{0,40}${FR_FAILURE_VERB}`,
  "gi",
);
const FR_FAIL_THEN_PCT = new RegExp(
  `${FR_FAILURE_VERB}[^.?!\\n]{0,40}${FR_PERCENT}`,
  "gi",
);

export function checkFailureRateFraming(script: string): ScriptViolation[] {
  const { dialogue, dialogueLineMap } = stripToDialogue(script);
  const violations: ScriptViolation[] = [];
  const seen = new Set<number>();
  for (const re of [FR_PCT_THEN_FAIL, FR_FAIL_THEN_PCT]) {
    for (const m of dialogue.matchAll(re)) {
      if (m.index === undefined) continue;
      if (seen.has(m.index)) continue;
      seen.add(m.index);
      const before = dialogue.slice(0, m.index);
      const dialogueLi = before.split("\n").length - 1;
      const originalLine = dialogueLineMap[dialogueLi];
      violations.push({
        rule: "failure_rate_framing",
        severity: "error",
        message:
          `Failure-rate framing error: "${m[0].trim()}". failure_rate is ` +
          `offMarket / sold — a RATIO that can exceed 100%, NOT a share of all ` +
          `listings. Stating a "%-failed-to-sell" figure misreads it. Reframe ` +
          `as sale_share ("X% of listings actually sold") or as plain counts ` +
          `("for every 10 homes that sold, 9 failed to sell").`,
        snippet: dialogue
          .slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)
          .replace(/\s+/g, " ")
          .trim(),
        line: originalLine,
      });
    }
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
              "next-video tease and close on a single forward-looking line " +
              "(what to watch for next in the market — NOT a backward recap) " +
              "with the half-sentence lead-magnet reminder (LM 3/3) riding it.",
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
/*  Rule — placeholder_number (ERROR severity).                            */
/*                                                                        */
/*  A quantitative claim must be a clean, traceable value or be omitted    */
/*  entirely — never a malformed range ("$500,000-to-the 600K"), a zero-   */
/*  filled stand-in ("the 0K range"), filler ("a meaningful amount"), or a */
/*  dangling value verb with no number ("Days on market average sitting.").*/
/*  These leak when the model reaches for a value it doesn't cleanly have. */
/*  Patterns are deliberately tight to keep the false-positive rate low —  */
/*  e.g. "sitting close to 49.4%" (value present) must NOT trip, only      */
/*  "sitting." with nothing after it.                                     */
/* ────────────────────────────────────────────────────────────────────── */

const PLACEHOLDER_NUMBER_PATTERNS: readonly RegExp[] = [
  // Zero-filled placeholder: "the 0K range", "$0K". `\b0K\b` can't match the
  // "0K" inside real values like "$10K"/"$100K" (no word boundary before 0).
  /\b0K\b/gi,
  // Jammed range token from "$500,000-to-the 600K" / "range-to-the". Real
  // dialogue always writes "to the" with a space, never the hyphenated jam.
  /\bto-the\b/gi,
  // Filler quantity standing in for a number ("pricing runs a meaningful
  // amount."). Excludes the legitimate "a significant amount OF <noun>".
  /\ba\s+(?:meaningful|significant|substantial|sizm?eable|sizable|sizeable)\s+amount\b(?!\s+of)/gi,
  // Dangling value verb with no number after it ("average sitting." /
  // "pricing averaging."). Only fires when the verb runs straight into
  // sentence-end punctuation — "sitting close to X%" / "averaging $5/sqft"
  // (a value follows) are left alone.
  /\b(?:sitting|hovering|averaging)\s*[.?!]/gi,
];

export function checkPlaceholderNumber(script: string): ScriptViolation[] {
  const { dialogue, dialogueLineMap } = stripToDialogue(script);
  const violations: ScriptViolation[] = [];
  const lines = dialogue.split("\n");
  const seen = new Set<string>();
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (const re of PLACEHOLDER_NUMBER_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const key = `${li}:${m.index}:${m[0].toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        violations.push({
          rule: "placeholder_number",
          severity: "error",
          message:
            `Placeholder / filler number detected: "${m[0].trim()}". Every ` +
            `quantitative claim must be a clean, traceable fact value (e.g. ` +
            `"$612,000", "49.4%", "3.2 months of inventory") OR be omitted ` +
            `entirely. Never ship a malformed range ("$500,000-to-the 600K"), ` +
            `a zero-filled stand-in ("the 0K range"), filler like "a ` +
            `meaningful amount", or a dangling value verb with no number ` +
            `("average sitting."). Replace it with the real cited value or cut ` +
            `the claim.`,
          snippet: snippetAround(line, m),
          line: dialogueLineMap[li],
        });
      }
    }
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Rule — recap_close (ERROR severity).                                   */
/*                                                                        */
/*  The close must be a counter-intuitive forward/binge hook to the next  */
/*  video, never a backward recap or a closing sales pitch. We flag the    */
/*  PRESENCE of recap-opener or push-CTA language in the closing region    */
/*  (a missing forward hook is NOT flagged here — that would false-positive*/
/*  on clean scripts with no binge target). Scoped to the last stretch of  */
/*  dialogue so a mid-body "the takeaway is…" doesn't trip it.            */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Fallback close-region size when no structural close marker is present:
 * how many trailing dialogue characters count as the "close".
 */
const RECAP_CLOSE_WINDOW_CHARS = 900;

/**
 * Structural markers (in the RAW script, before dialogue stripping) that mark
 * the start of the closing beat: the CLOSING section heading, the once-only
 * `[CALLBACK]` beat, or the final `[LEAD MAGNET 3/3]` (which rides the hook).
 * When any of these is found, the close region starts at the EARLIEST of them
 * — so recap/push-CTA language anywhere in a long close is caught, not just in
 * the trailing 900 chars.
 */
const CLOSE_BOUNDARY_LINE_RE =
  /^\s*(?:#{1,6}|\*{2,})\s*clos(?:e|ing)\b|\[\s*callback\s*\]|\[\s*lead\s+magnet\s+3\s*\/\s*3\s*\]/i;

const RECAP_CLOSE_PATTERNS: readonly RegExp[] = [
  // Backward-summary openers.
  /\bto\s+recap\b/gi,
  /\blet'?s\s+recap\b/gi,
  /\bto\s+sum\s+up\b/gi,
  /\bto\s+summari[sz]e\b/gi,
  /\bin\s+summary\b/gi,
  /\bin\s+conclusion\b/gi,
  /\bto\s+wrap\s+(?:this\s+)?up\b/gi,
  /\blet'?s\s+review\b/gi,
  /\bthe\s+(?:big\s+)?takeaway\s+(?:here\s+)?is\b/gi,
  /\bif\s+you\s+(?:remember|take)\s+(?:just\s+)?one\s+thing\b/gi,
  /\bthe\s+bottom\s+line\s+is\b/gi,
  // Closing push / sales-CTA language.
  /\bbook\s+a\s+call\b/gi,
  /\bschedule\s+a\s+(?:call|consultation|strategy\s+session)\b/gi,
  /\bmake\s+an\s+offer\b/gi,
  /\bthis\s+is\s+the\s+one\b/gi,
  /\b(?:let'?s\s+)?pull\s+the\s+trigger\b/gi,
  /\breach\s+out\s+today\b/gi,
  /\bgive\s+me\s+a\s+call\b/gi,
];

export function checkRecapClose(script: string): ScriptViolation[] {
  const { dialogue, dialogueLineMap } = stripToDialogue(script);

  // The close region is the UNION of two heuristics (whichever starts earlier),
  // so recap/push-CTA language anywhere in the close is caught:
  //   (a) trailing-char fallback — the last RECAP_CLOSE_WINDOW_CHARS chars;
  //   (b) structural — from the EARLIEST close marker in the raw script
  //       (CLOSING heading / [CALLBACK] / [LEAD MAGNET 3/3]) onward.
  const charWindowStart = Math.max(
    0,
    dialogue.length - RECAP_CLOSE_WINDOW_CHARS,
  );
  let closeStart = charWindowStart;
  // (b): find the earliest raw line that is a structural close marker, then
  // translate it to a char offset in the stripped dialogue via dialogueLineMap.
  const rawLines = script.split(/\r?\n/);
  let boundaryRawLine = Infinity;
  for (let i = 0; i < rawLines.length; i++) {
    if (CLOSE_BOUNDARY_LINE_RE.test(rawLines[i])) {
      boundaryRawLine = i + 1; // dialogueLineMap is 1-indexed
      break;
    }
  }
  if (boundaryRawLine !== Infinity) {
    const dialogueLines = dialogue.split("\n");
    let charOffset = 0;
    for (let li = 0; li < dialogueLines.length; li++) {
      if (dialogueLineMap[li] >= boundaryRawLine) {
        closeStart = Math.min(closeStart, charOffset);
        break;
      }
      charOffset += dialogueLines[li].length + 1; // +1 for the "\n" join
    }
  }

  const violations: ScriptViolation[] = [];
  const seen = new Set<string>();
  for (const re of RECAP_CLOSE_PATTERNS) {
    for (const m of dialogue.matchAll(re)) {
      if (m.index === undefined || m.index < closeStart) continue;
      const key = m[0].toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const before = dialogue.slice(0, m.index);
      const dialogueLi = before.split("\n").length - 1;
      violations.push({
        rule: "recap_close",
        severity: "error",
        message:
          `Recap / pitch close detected: "${m[0].trim()}". The close must be a ` +
          `counter-intuitive forward/binge hook to the NEXT video (a Stakes ` +
          `pattern — what's at risk if they don't watch it), NOT a backward ` +
          `recap and NOT a closing sales pitch. Remove this and end on the ` +
          `forward hook, with only the half-sentence lead-magnet reminder ` +
          `(LM 3/3) riding it.`,
        snippet: dialogue
          .slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)
          .replace(/\s+/g, " ")
          .trim(),
        line: dialogueLineMap[dialogueLi],
      });
    }
  }
  return violations;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Rule — fabricated_credibility_stat (ERROR severity).                   */
/*                                                                        */
/*  The Expertise Bridge may drop a real credibility cadence ("our team    */
/*  helps a family move every 57 hours") only when that number is on the   */
/*  member's profile/credentials. An invented cadence (the earlier draft's */
/*  "every 53 hours") must be blocked. We flag an "every N hours/days"     */
/*  cadence whose number doesn't appear in any provided anchor (profile    */
/*  text, cited facts, source-of-truth). Vague frequencies ("every few     */
/*  days") are ALSO flagged (Fix 3) — but only when the member has NO       */
/*  stored cadence at all; a stored cadence exempts the vague phrasing.     */
/* ────────────────────────────────────────────────────────────────────── */

const CREDIBILITY_CADENCE_RE = /\bevery\s+(\d{1,4})\s+(?:hours?|days?)\b/gi;

/**
 * Fix 3 — a VAGUE personal cadence ("every few days", "every couple of days",
 * "every other day", "every day"). When the member has NO cadence value on
 * their credentials profile, the bridge must fall back to a NON-frequency
 * experience line ("after years of running this analysis…") — never a guessed
 * frequency, numeric OR vague. So this pattern is flagged exactly like an
 * invented numeric cadence whenever the profile carries no stored cadence.
 * Numeric "every N days" is intentionally NOT matched here (it has its own
 * anchored-or-flagged path above).
 */
const QUALITATIVE_CADENCE_RE =
  /\bevery\s+(?:(?:a\s+)?few|(?:a\s+)?couple(?:\s+of)?|several|other|single)\s+(?:hours?|days?|weeks?)\b|\bevery\s+(?:hour|day|week)\b/gi;

/** Presence test: does the member's credentials prose carry a stored "every N hours/days" cadence? */
const CADENCE_PRESENCE_RE = /\bevery\s+\d{1,4}\s+(?:hours?|days?)\b/i;

/**
 * A first-person / team subject — the cadence rule only fires when the
 * "every N hours/days" claim is the MEMBER's own throughput. This keeps the
 * rule off market statistics ("homes are selling every 12 days"), which have
 * an inanimate subject (homes/properties/listings) and no first-person cue.
 */
const CREDIBILITY_SUBJECT_RE = /\b(?:we|we'?re|we'?ve|our|us|i|i'?ve|my)\b/i;
/** A "help people" cue that, with a first-person subject, marks a personal cadence claim. */
const CREDIBILITY_ACTION_RE =
  /\b(?:help(?:s|ing|ed)?|move(?:s|d)?|moving|serve(?:s|d)?|serving|close(?:s|d)?|closing|sell(?:s|ing)?|sold|famil(?:y|ies)|client(?:s)?|buyer(?:s)?|seller(?:s)?|deal(?:s)?)\b/i;

export function checkFabricatedCredibilityStat(
  script: string,
  opts: ValidateScriptOptions,
): ScriptViolation[] {
  const { dialogue, dialogueLineMap } = stripToDialogue(script);
  // Build the set of numbers the member can legitimately claim as a PERSONAL
  // credibility cadence. This anchors ONLY on the member's dedicated
  // credentials prose (team-credibility figures + notes) — NOT on profileText
  // (neighbourhood/market prose), cited facts, or source-of-truth, all of
  // which are market statistics. A market number (e.g. 53 months of inventory,
  // or a "53" buried in neighbourhood context) must never legitimise an
  // invented personal cadence like "we help a family every 53 hours".
  const anchors: string[] = [];
  for (const c of opts.credentialsText ?? []) anchors.push(c);
  const anchorText = anchors.join(" \u0001 ");
  const violations: ScriptViolation[] = [];
  const seen = new Set<string>();

  // Scope to a PERSONAL credibility claim: the cadence must sit in a sentence
  // with a first-person/team subject AND a "help people" cue. This keeps the
  // rule off market statistics ("homes are selling every 12 days"), which have
  // an inanimate subject and no first-person cue. Evaluates the FULL containing
  // sentence — both sides of the cadence token — so cadence-first phrasing
  // ("Every 53 hours, our team helps a family…") scopes like cadence-last.
  const personalCadenceSentence = (index: number, len: number): boolean => {
    const before = dialogue.slice(0, index);
    const sentenceStart = Math.max(
      before.lastIndexOf("."),
      before.lastIndexOf("!"),
      before.lastIndexOf("?"),
      before.lastIndexOf("\n"),
    );
    const token = dialogue.slice(index, index + len);
    const after = dialogue.slice(index + len);
    const afterEndRel = after.search(/[.!?\n]/);
    const afterEnd = afterEndRel === -1 ? after.length : afterEndRel;
    const sentence = before.slice(sentenceStart + 1) + token + after.slice(0, afterEnd);
    return (
      CREDIBILITY_SUBJECT_RE.test(sentence) && CREDIBILITY_ACTION_RE.test(sentence)
    );
  };
  const lineOf = (index: number): number | undefined =>
    dialogueLineMap[dialogue.slice(0, index).split("\n").length - 1];

  let m: RegExpExecArray | null;
  CREDIBILITY_CADENCE_RE.lastIndex = 0;
  while ((m = CREDIBILITY_CADENCE_RE.exec(dialogue)) !== null) {
    const num = m[1];
    // Anchored if the exact integer appears as a standalone token anywhere in
    // the member's profile / credentials prose.
    const anchored = new RegExp(`(?<![\\d.])${num}(?![\\d.])`).test(anchorText);
    if (anchored) continue;
    if (!personalCadenceSentence(m.index, m[0].length)) continue;
    const key = m[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push({
      rule: "fabricated_credibility_stat",
      severity: "error",
      message:
        `Fabricated credibility cadence: "${m[0].trim()}". The Expertise ` +
        `Bridge may only state a "a family every X hours/days" figure when ` +
        `that exact number is on the member's credentials profile. This ` +
        `number isn't — never invent a cadence. Use the member's REAL ` +
        `credential (years in business, families helped, deals closed), or ` +
        `omit the cadence and use a non-frequency experience bridge ("after ` +
        `years of running this analysis…").`,
      snippet: dialogue
        .slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)
        .replace(/\s+/g, " ")
        .trim(),
      line: lineOf(m.index),
    });
  }

  // Fix 3 — vague personal cadence ("every few days") with NO stored cadence.
  // The earlier prompt RECOMMENDED "every few days" as the fallback, so drafts
  // for members with nothing on file (e.g. Phil) invented a soft frequency.
  // When the profile carries no stored cadence at all, a vague personal cadence
  // is flagged exactly like an invented numeric one — the bridge must instead
  // be a non-frequency experience line. (Members WITH a stored cadence, e.g.
  // Chris's "every 53 hours", are exempt — they cite the real number.)
  const hasStoredCadence = CADENCE_PRESENCE_RE.test(anchorText);
  if (!hasStoredCadence) {
    QUALITATIVE_CADENCE_RE.lastIndex = 0;
    while ((m = QUALITATIVE_CADENCE_RE.exec(dialogue)) !== null) {
      if (!personalCadenceSentence(m.index, m[0].length)) continue;
      const key = m[0].toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        rule: "fabricated_credibility_stat",
        severity: "error",
        message:
          `Guessed credibility cadence: "${m[0].trim()}". The member has NO ` +
          `cadence value on their credentials profile, so the Expertise Bridge ` +
          `must NOT state any frequency — not even a vague one like "every few ` +
          `days". Drop the cadence and use a non-frequency experience bridge ` +
          `("after years of running this analysis for families across the city…").`,
        snippet: dialogue
          .slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)
          .replace(/\s+/g, " ")
          .trim(),
        line: lineOf(m.index),
      });
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
   * Fix 1 — the member's PERSONAL credibility prose ONLY (team-credibility
   * figures: years in business, families helped, homes/year, team size, and
   * any free-text credibility notes). This is the dedicated anchor set for
   * `fabricated_credibility_stat`: a spoken "every N hours/days" cadence is
   * legal only when N appears here. Deliberately separate from `profileText`
   * (which carries neighbourhood/market prose) so a coincidental MARKET number
   * can never legitimise an invented PERSONAL cadence. Empty/unset ⇒ any
   * numeric cadence is treated as fabricated (real-stat-or-omit).
   */
  credentialsText?: string[];
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
  /**
   * Floor-only signal for `min_dialogue_length`. When `false`, the lean
   * word floor (`LEAN_DIALOGUE_WORDS`) applies instead of the full 2,200
   * floor — for scripts whose neighbourhoods have NO Knowledge Base profile,
   * where demanding 2,200 words forces invented colour the grounding gates
   * then reject.
   *
   * This is deliberately SEPARATE from `profileText`: the save-script route
   * can pass `hasNeighbourhoodProfile` to relax the floor WITHOUT passing
   * `profileText`, so it doesn't accidentally re-activate the qualitative /
   * stat grounding checks (which gate on `profileText` presence) at save and
   * regress scripts the streaming route already cleared.
   *
   * `undefined` ⇒ derive from `profileText` (preserves the streaming route's
   * existing behaviour, which always passes `profileText`).
   */
  hasNeighbourhoodProfile?: boolean;
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
  violations.push(...checkNoForASecondTail(script));
  // Voice watch list — "wait a second, let me back up" self-interruption filler.
  violations.push(...checkNoBackupFiller(script));
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
  // Canonical = Source-of-Truth: a per-fact number that disagrees with the
  // aggregated SoT (beyond rounding) is rejected so the SoT always wins.
  violations.push(
    ...checkNoSotDisagreement(
      script,
      opts.sourceOfTruth,
      opts.citedFacts,
      opts.neighbourhoods,
    ),
  );
  // Ground SPECIFIC claims (demographics, dates) — not just market stats —
  // against cited facts / SoT / Knowledge Base neighbourhood profile text.
  violations.push(
    ...checkUnsourcedFactualClaim(
      script,
      opts.sourceOfTruth,
      opts.citedFacts,
      opts.profileText,
    ),
  );
  // Fix 2 — every REAL market number (any family) must be listed in the
  // "## Sources" footnote, not just MOI + price. Missing → error → re-prompt.
  violations.push(
    ...checkUnlistedMarketStat(script, opts.sourceOfTruth, opts.citedFacts),
  );
  // Wave 8 Fix 2 / Fix 3 / Fix 4 — ERROR severity, all gated through the
  // existing re-prompt loop.
  // Floor-only: explicit `hasNeighbourhoodProfile` wins (save route uses it
  // WITHOUT passing profileText); otherwise derive from profileText, so the
  // streaming route's existing behaviour is unchanged.
  const hasProfileForFloor =
    opts.hasNeighbourhoodProfile ??
    (opts.profileText ?? []).some((t) => !!t && t.trim().length > 0);
  violations.push(...checkMinDialogueLength(script, hasProfileForFloor));
  violations.push(...checkNoAnnouncedCredibility(script));
  violations.push(...checkPeopleLikeUsInLm(script));
  // B1 — presenter-identity guardrails (cross-member leak + unfilled placeholder).
  violations.push(...checkNoOtherMemberIdentity(script, opts));
  violations.push(...checkUnfilledCredibilityPlaceholder(script));
  // Binge guard — no fabricated next-video tease.
  violations.push(...checkBingeTargetMatch(script, opts));
  // failure_rate honesty — no "%-failed-to-sell" misreading of the ratio.
  violations.push(...checkFailureRateFraming(script));
  // Fix 4 — no malformed/placeholder/filler numbers.
  violations.push(...checkPlaceholderNumber(script));
  // Fix 3 — close must be a forward/binge hook, not a recap or sales pitch.
  violations.push(...checkRecapClose(script));
  // Fix 1 — Expertise Bridge cadence must trace to the member's real profile.
  violations.push(...checkFabricatedCredibilityStat(script, opts));

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
    // Sub-$1k: a clean directional phrase that the placeholder_number rule
    // accepts (never the banned filler "a meaningful amount").
    return "the few-hundred-dollar range";
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

        // Framework / definitional numbers (MOI bands, "100% of asking
        // means full price") are allowed — never soften them, or legitimate
        // framework language ("below 2.5 months is a sellers market") would
        // be rewritten into mush.
        if (isFrameworkOrDefinitionalNumber(dialogue, tok)) continue;

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
