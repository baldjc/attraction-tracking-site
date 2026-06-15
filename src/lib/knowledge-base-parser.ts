// Wave 1.5 — Neighbourhood Knowledge Base
// Server-only: extracts plaintext from uploaded files and turns a long
// research document into per-neighbourhood profiles.
//
// Two parse paths:
//   A) Deterministic — split on `### Name` headings (or bare-name lines whose
//      next non-blank line is the `Snapshot` anchor). Free, instant, and the
//      win path for template-compliant uploads.
//   B) Chunked Haiku fallback — when deterministic can't find enough anchors
//      to be confident, we split into ~25-profile chunks and run the existing
//      Haiku prompt per chunk. Hard-caps projected cost so a 1 MB free-form
//      blob can't blow past Anthropic's 200K context window the way the old
//      single-call path did.

import Anthropic from "@anthropic-ai/sdk";
import { HAIKU_MODEL } from "@/lib/ai-models";

// Haiku pricing (Oct 2025): $1 / 1M input, $5 / 1M output
const HAIKU_INPUT_COST_PER_TOKEN = 0.000001;
const HAIKU_OUTPUT_COST_PER_TOKEN = 0.000005;

// Tunables for the chunked fallback path.
const PROFILES_PER_CHUNK = 25;
// Hard refusal threshold — projected input tokens above this we refuse to
// even try. Keeps a 1 MB free-form upload from racking up multi-dollar
// Haiku spend before failing.
const MAX_PROJECTED_INPUT_TOKENS_FALLBACK = 100_000;
// Rough chars-per-token estimate for projection only (Anthropic's own
// counter is what bills; this is just to short-circuit obvious overrun).
const CHARS_PER_TOKEN_ESTIMATE = 3.5;
// When there are no heading anchors at all, fall back to even char-split
// at this size per chunk (~17K tokens — well under the 200K wall).
const EVEN_SPLIT_CHARS = 60_000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ParsedProfile {
  neighbourhood: string;
  content: string;
  summary: string;
}
export interface UnmatchedSection {
  rawHeading: string;
  content: string;
}
export type ParsePath = "deterministic" | "haiku-chunked";
export interface ParseResult {
  profiles: ParsedProfile[];
  unmatchedSections: UnmatchedSection[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  // Which path produced this result. Logged by the upload route so we can
  // verify in workflow logs that template-compliant uploads are winning on
  // the free deterministic path.
  path: ParsePath;
}

/**
 * Extract plain text from an uploaded research document. Supports markdown
 * text (passed through), .txt, .md, .docx (mammoth) and .pdf (pdf-parse).
 */
export async function extractTextFromUpload(
  file: File,
): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".md") || name.endsWith(".txt") || file.type.startsWith("text/")) {
    return buf.toString("utf8").replace(/^\uFEFF/, "");
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }

  if (name.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const result = await parser.getText();
    return result?.text ?? "";
  }

  // Fallback: treat as UTF-8 text
  return buf.toString("utf8").replace(/^\uFEFF/, "");
}

// ─── Path A: Deterministic split ──────────────────────────────────────────

/**
 * Normalize a candidate neighbourhood name for comparison:
 * - strip leading `# `/`## `/`### `
 * - strip surrounding/embedded `*`
 * - drop a leading "The "
 * - collapse internal whitespace
 * - lowercase
 */
function normalizeName(s: string): string {
  return s
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*+/g, "")
    .trim()
    .replace(/^the\s+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Levenshtein distance — small/iterative, no deps. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * Match a raw heading candidate against the allowed vocab. Returns the
 * canonical spelling on match, or null on miss.
 *
 * Tolerance: exact-normalized first, then Levenshtein ≤ 2 (only for names
 * length ≥ 4 to avoid spurious matches between very short distinct names).
 */
function matchAllowed(candidate: string, allowed: string[]): string | null {
  const cand = normalizeName(candidate);
  if (!cand) return null;
  for (const a of allowed) {
    if (normalizeName(a) === cand) return a;
  }
  if (cand.length < 4) return null;
  let best: string | null = null;
  let bestDist = 3;
  for (const a of allowed) {
    const d = levenshtein(normalizeName(a), cand);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

const SNAPSHOT_ANCHOR_RE = /^\*?\*?\s*snapshot\s*\*?\*?\s*$/i;
const MD_HEADING_RE = /^###\s+\S/;

/**
 * Indices of lines that begin a neighbourhood profile.
 *
 * Two rules — first match wins per line:
 *   1. `### Name` markdown heading.
 *   2. A non-blank line whose NEXT non-blank line is a `Snapshot` anchor
 *      (handles demarkdowned variants where copy-paste stripped `### ` /
 *      `**`).
 */
function findHeadingLines(lines: string[]): number[] {
  const anchors: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (MD_HEADING_RE.test(line)) {
      anchors.push(i);
      continue;
    }
    const trimmed = line.trim();
    // Skip obvious non-name lines: blank, list markers, block quotes,
    // code fences, table separators, anything that's a section anchor itself.
    if (!trimmed || trimmed.length > 100) continue;
    if (/^[-*#>|`]/.test(trimmed)) continue;
    if (SNAPSHOT_ANCHOR_RE.test(trimmed)) continue;

    // Look ahead to next non-blank line.
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    if (j >= lines.length) continue;
    if (SNAPSHOT_ANCHOR_RE.test(lines[j].trim())) anchors.push(i);
  }
  return anchors;
}

/** First paragraph after the `Snapshot` anchor inside a profile chunk. */
function extractSummary(profileLines: string[]): string {
  let i = 0;
  // Walk past the heading line (we don't know which rule matched, but the
  // anchor is at index 0 by construction).
  i = 1;
  // Find the Snapshot anchor.
  while (i < profileLines.length && !SNAPSHOT_ANCHOR_RE.test(profileLines[i].trim())) {
    i++;
  }
  if (i >= profileLines.length) return "";
  i++; // step past the Snapshot line itself
  // Skip blanks.
  while (i < profileLines.length && profileLines[i].trim() === "") i++;
  // Collect until next blank line or next bold sub-heading.
  const paragraphLines: string[] = [];
  while (i < profileLines.length) {
    const t = profileLines[i].trim();
    if (!t) break;
    if (/^\*\*[^*]+\*\*\s*$/.test(t)) break; // next sub-heading
    paragraphLines.push(t);
    i++;
  }
  const summary = paragraphLines.join(" ").trim();
  return summary.length > 500 ? summary.slice(0, 500).trim() : summary;
}

export function splitDocumentDeterministic(
  rawContent: string,
  allowedNeighbourhoods: string[],
): ParseResult {
  const lines = rawContent.split(/\r?\n/);
  const anchors = findHeadingLines(lines);

  const profiles: ParsedProfile[] = [];
  const unmatched: UnmatchedSection[] = [];

  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i];
    const end = i + 1 < anchors.length ? anchors[i + 1] : lines.length;
    const profileLines = lines.slice(start, end);
    const content = profileLines.join("\n").trim();
    if (!content) continue;

    const candidate = profileLines[0]
      .replace(/^#{1,6}\s+/, "")
      .replace(/\*+/g, "")
      .trim();
    if (!candidate) continue;

    const canon = matchAllowed(candidate, allowedNeighbourhoods);
    if (canon) {
      profiles.push({
        neighbourhood: canon,
        content,
        summary: extractSummary(profileLines),
      });
    } else {
      unmatched.push({ rawHeading: candidate, content });
    }
  }

  return {
    profiles,
    unmatchedSections: unmatched,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    path: "deterministic",
  };
}

// ─── Path B: Chunked Haiku fallback ───────────────────────────────────────

/**
 * Split rawContent into chunks for Haiku parsing.
 * - If heading anchors exist: chunk every `profilesPerChunk` anchors so each
 *   call stays well under the 200K context wall.
 * - If no anchors: even char-split at ~60K chars (~17K tokens) so something
 *   coherent still reaches the model.
 */
function chunkByHeadingAnchors(
  rawContent: string,
  profilesPerChunk: number,
): string[] {
  const lines = rawContent.split(/\r?\n/);
  const anchors = findHeadingLines(lines);

  if (anchors.length === 0) {
    const chunks: string[] = [];
    for (let i = 0; i < rawContent.length; i += EVEN_SPLIT_CHARS) {
      chunks.push(rawContent.slice(i, i + EVEN_SPLIT_CHARS));
    }
    return chunks.length ? chunks : [rawContent];
  }

  const chunks: string[] = [];
  for (let i = 0; i < anchors.length; i += profilesPerChunk) {
    const startLine = anchors[i];
    const endLine =
      i + profilesPerChunk < anchors.length
        ? anchors[i + profilesPerChunk]
        : lines.length;
    chunks.push(lines.slice(startLine, endLine).join("\n"));
  }
  // Preserve any preamble before the first anchor by prepending to chunk 0,
  // so context like the doc title isn't dropped.
  if (anchors[0] > 0 && chunks.length > 0) {
    const preamble = lines.slice(0, anchors[0]).join("\n").trim();
    if (preamble) chunks[0] = `${preamble}\n\n${chunks[0]}`;
  }
  return chunks;
}

interface HaikuParseChunk {
  profiles: ParsedProfile[];
  unmatchedSections: UnmatchedSection[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * One Haiku call against one chunk of the research document. Same prompt
 * and validation behaviour as the previous single-call implementation —
 * just now invoked per chunk by the fallback path.
 */
async function runHaikuParse(
  chunkContent: string,
  allowedNeighbourhoods: string[],
): Promise<HaikuParseChunk> {
  const system = `You are parsing a neighbourhood research document into structured per-neighbourhood profiles.

The document SHOULD follow this structure: ### [Neighbourhood Name] headings, each followed by ** sub-section headings.

Your job:
1. Identify each ### heading and the neighbourhood name.
2. Extract the FULL content between that heading and the next ### heading (preserve markdown).
3. Generate a 200-word summary capturing the most script-useful facts: demographics anchors, housing stock anchors, what makes it distinctive, who the typical buyer is, key amenities/transit.
4. Match neighbourhood names to this allowed list (case-insensitive, fuzzy — minor punctuation, spacing, or "the" variants are fine):
${allowedNeighbourhoods.map((n) => `   - ${n}`).join("\n")}
5. If a section's heading doesn't match any allowed neighbourhood name, return it in \`unmatchedSections\` for member review — DO NOT drop silently and DO NOT invent a match.
6. Use the EXACT allowed-list spelling for matched neighbourhoods in the \`neighbourhood\` field.

Return strict JSON only, no prose, no markdown fences:
{
  "profiles": [
    { "neighbourhood": "...", "content": "...", "summary": "..." }
  ],
  "unmatchedSections": [
    { "rawHeading": "...", "content": "..." }
  ]
}`;

  const userMsg = `Research document:\n\n${chunkContent}`;

  const resp = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  const text =
    resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim() || "{}";

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: {
    profiles?: Array<{ neighbourhood?: unknown; content?: unknown; summary?: unknown }>;
    unmatchedSections?: Array<{ rawHeading?: unknown; content?: unknown }>;
  } = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {};
  }

  // Re-match neighbourhoods against the canonical vocab (case-insensitive)
  // to be defensive — Haiku usually echoes back the allowed spelling, but
  // we don't want a typo to break the unique upsert key.
  const canonByLower = new Map(
    allowedNeighbourhoods.map((n) => [n.toLowerCase().trim(), n] as const),
  );

  const profiles: ParsedProfile[] = [];
  const unmatched: UnmatchedSection[] = [];

  for (const p of parsed.profiles ?? []) {
    const rawName = typeof p.neighbourhood === "string" ? p.neighbourhood.trim() : "";
    const content = typeof p.content === "string" ? p.content.trim() : "";
    const summary = typeof p.summary === "string" ? p.summary.trim() : "";
    if (!rawName || !content) continue;

    const canon = canonByLower.get(rawName.toLowerCase());
    if (canon) {
      profiles.push({ neighbourhood: canon, content, summary });
    } else {
      unmatched.push({ rawHeading: rawName, content });
    }
  }

  for (const u of parsed.unmatchedSections ?? []) {
    const rawHeading = typeof u.rawHeading === "string" ? u.rawHeading.trim() : "";
    const content = typeof u.content === "string" ? u.content.trim() : "";
    if (rawHeading && content) unmatched.push({ rawHeading, content });
  }

  const inputTokens = resp.usage.input_tokens ?? 0;
  const outputTokens = resp.usage.output_tokens ?? 0;
  const costUsd =
    inputTokens * HAIKU_INPUT_COST_PER_TOKEN +
    outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN;

  return {
    profiles,
    unmatchedSections: unmatched,
    costUsd,
    inputTokens,
    outputTokens,
  };
}

// ─── Top-level entry point ────────────────────────────────────────────────

/**
 * Parse a research document into per-neighbourhood profiles.
 *
 * Strategy:
 *   1. Try the free deterministic split.
 *   2. If it found heading anchors AND matched at least half of them to the
 *      allowed vocab, return it — that's the win path. (Note: the original
 *      spec proposed `matchRate = profiles.length / vocab.length`, but that
 *      would force a small upload — one profile against a 164-entry vocab —
 *      into the Haiku fallback, regressing existing behaviour. We instead
 *      measure match rate over DETECTED anchors, which both lets Jared's
 *      164-profile file win at 100% and keeps single-profile pastes free.)
 *   3. Otherwise fall back to chunked Haiku — but hard-refuse first if the
 *      projected input would exceed ~100K tokens (operator protection
 *      against multi-dollar surprise spend on free-form garbage uploads).
 */
export async function parseResearchDocument(
  rawContent: string,
  allowedNeighbourhoods: string[],
): Promise<ParseResult> {
  const det = splitDocumentDeterministic(rawContent, allowedNeighbourhoods);
  const detectedAnchors = det.profiles.length + det.unmatchedSections.length;
  const anchorMatchRate =
    detectedAnchors > 0 ? det.profiles.length / detectedAnchors : 0;

  if (det.profiles.length > 0 && anchorMatchRate >= 0.5) {
    return det;
  }

  // Fallback path — operator protection first.
  const projectedInputTokens = Math.ceil(
    rawContent.length / CHARS_PER_TOKEN_ESTIMATE,
  );
  if (projectedInputTokens > MAX_PROJECTED_INPUT_TOKENS_FALLBACK) {
    const projectedCost = (
      projectedInputTokens * HAIKU_INPUT_COST_PER_TOKEN
    ).toFixed(2);
    throw new Error(
      `This file would cost ~$${projectedCost} to parse with AI. ` +
        `Either split it into smaller uploads (one per ~30 neighbourhoods) ` +
        `or reformat it with "### Neighbourhood Name" and "**Snapshot**" ` +
        `headings so we can parse it deterministically for free.`,
    );
  }

  const chunks = chunkByHeadingAnchors(rawContent, PROFILES_PER_CHUNK);
  const merged: ParseResult = {
    profiles: [],
    unmatchedSections: [],
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    path: "haiku-chunked",
  };
  for (const chunk of chunks) {
    const c = await runHaikuParse(chunk, allowedNeighbourhoods);
    merged.profiles.push(...c.profiles);
    merged.unmatchedSections.push(...c.unmatchedSections);
    merged.costUsd += c.costUsd;
    merged.inputTokens += c.inputTokens;
    merged.outputTokens += c.outputTokens;
  }
  return merged;
}
