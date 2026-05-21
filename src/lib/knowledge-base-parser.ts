// Wave 1.5 — Neighbourhood Knowledge Base
// Server-only: extracts plaintext from uploaded files and runs the Haiku parse
// that turns a long research document into per-neighbourhood profiles.

import Anthropic from "@anthropic-ai/sdk";

const HAIKU_MODEL = "claude-haiku-4-5";
// Haiku pricing (Oct 2025): $1 / 1M input, $5 / 1M output
const HAIKU_INPUT_COST_PER_TOKEN = 0.000001;
const HAIKU_OUTPUT_COST_PER_TOKEN = 0.000005;

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
export interface ParseResult {
  profiles: ParsedProfile[];
  unmatchedSections: UnmatchedSection[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
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
    const mod: any = await import("pdf-parse");
    const pdfParse = mod.default ?? mod.pdf ?? mod;
    const result = await pdfParse(buf);
    return result?.text ?? "";
  }

  // Fallback: treat as UTF-8 text
  return buf.toString("utf8").replace(/^\uFEFF/, "");
}

/**
 * Run one Haiku call to split a research document into per-neighbourhood
 * profiles. The model receives the full plaintext + the allowed neighbourhood
 * vocabulary; it returns strict JSON with `profiles` and `unmatchedSections`.
 */
export async function parseResearchDocument(
  rawContent: string,
  allowedNeighbourhoods: string[],
): Promise<ParseResult> {
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

  const userMsg = `Research document:\n\n${rawContent}`;

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

  // Re-match neighbourhoods against the canonical vocab (case-insensitive) to
  // be defensive — Haiku usually echoes back the allowed spelling, but we
  // don't want a typo to break the unique upsert key.
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
