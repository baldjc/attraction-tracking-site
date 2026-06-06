// Knowledge-Base Merge & Clean — Stage 1: deterministic neighbourhood
// normalization. Pure functions, no I/O, no AI. This is the free, instant pass
// that collapses the dominant fragmentation pattern in raw MLS subdivision
// names: phase/section/installment suffixes and trailing lot numbers (e.g.
// "Woodbridge Ph 5B", "Woodbridge #8", "Woodbridge 1" → "woodbridge").
//
// Conservative by design: it ONLY strips well-known phase/section/number
// decorations. It will NOT collapse genuinely different names or descriptive
// prefixes ("Chateaus Of Woodbridge Pkwy" stays separate) — that ambiguous
// territory is deferred to the fuzzy pass, which routes anything below the
// confidence floor to a human review queue instead of auto-merging.

const SMALL_WORDS = new Set([
  "of",
  "at",
  "the",
  "and",
  "in",
  "on",
  "by",
  "to",
  "a",
  "an",
]);

/**
 * Deterministic normalization key for a raw subdivision name. Two raw names
 * that normalize to the same non-empty key are the SAME canonical area with
 * certainty (Stage 1). Returns "" for blank / non-place values so callers can
 * skip them.
 */
export function normalizeAreaName(raw: string): string {
  if (!raw) return "";
  let s = raw.toLowerCase().trim();

  // phase / section / installment / addition + number (+ optional letter):
  // "ph 5b", "phase 02a", "sec 3", "section 12", "inst 4", "add 2", "addition 7"
  s = s.replace(
    /\b(ph|phase|sec|section|installment|inst|add|addition|unit|blk|block)\b\.?\s*[0-9]+[a-z]?\b/g,
    " ",
  );
  // "#8", "# 12c"
  s = s.replace(/#\s*[0-9]+[a-z]?\b/g, " ");
  // "no 3", "number 12"
  s = s.replace(/\b(no|number)\s*[0-9]+\b/g, " ");
  // trailing 1–3 digit lot/phase number with optional letter: "woodbridge 1",
  // "windsong ranch 61s", "camelot 12"
  s = s.replace(/\s+[0-9]{1,3}[a-z]?$/g, " ");
  // collapse everything non-alphanumeric to single spaces
  s = s
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/**
 * True for keys we never treat as a real neighbourhood (blank, "unknown", the
 * citywide rollup bucket). Callers filter these out before grouping.
 */
export function isNonAreaKey(normKey: string): boolean {
  return (
    normKey.length === 0 ||
    normKey === "unknown" ||
    normKey === "all neighbourhoods" ||
    normKey === "all"
  );
}

/** Title-case a normalized key for display, keeping small joining words lower. */
export function titleCaseArea(normKey: string): string {
  const words = normKey.split(" ").filter(Boolean);
  return words
    .map((w, i) => {
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/**
 * Choose the human-facing canonical display name for a group of raw variants
 * that all share `normKey`. Preference order:
 *   1. A raw variant that is exactly the bare name (its own normalization equals
 *      normKey) — preserves real-world casing like "McKinney". Shortest wins,
 *      then alphabetical for stability.
 *   2. Title-cased normKey as a clean fallback.
 */
export function pickCanonicalDisplay(
  normKey: string,
  rawVariants: string[],
): string {
  // A "bare" variant is one with NO phase/section/lot decoration to strip — its
  // plain alphanumeric form already equals the key. (A variant like
  // "Windsong Ranch 5" normalizes to the key but is NOT bare, so it must not win
  // the display and drag a stray number into the canonical name.)
  const plainKey = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  const bare = rawVariants
    .map((r) => r.trim().replace(/\s+/g, " "))
    .filter((r) => plainKey(r) === normKey)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  if (bare.length > 0) return bare[0];
  return titleCaseArea(normKey);
}

/**
 * Group a list of raw names by their deterministic key. Returns one entry per
 * canonical key with the chosen display name and the raw variants that fold
 * into it. Non-area keys are dropped.
 */
export function groupByNormKey(
  rawNames: string[],
): Array<{ normKey: string; display: string; variants: string[] }> {
  const byKey = new Map<string, string[]>();
  for (const raw of rawNames) {
    const cleaned = (raw ?? "").toString().trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    const key = normalizeAreaName(cleaned);
    if (isNonAreaKey(key)) continue;
    const list = byKey.get(key) ?? [];
    if (!list.includes(cleaned)) list.push(cleaned);
    byKey.set(key, list);
  }
  return [...byKey.entries()]
    .map(([normKey, variants]) => ({
      normKey,
      display: pickCanonicalDisplay(normKey, variants),
      variants: variants.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.display.localeCompare(b.display));
}
