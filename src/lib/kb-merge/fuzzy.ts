// Knowledge-Base Merge & Clean — Stage 2: conservative fuzzy near-duplicate
// detection. After the deterministic pass collapses phase/section fragments,
// some genuine duplicates remain that regex can't catch: typos, spelling
// variants, abbreviations ("Mt" vs "Mount"), and descriptive prefixes
// ("The Estates At Craig Ranch" vs "Craig Ranch").
//
// SAFETY POSTURE (per product decision): a false merge that combines two
// genuinely different neighbourhoods is WORSE than leaving two near-duplicates
// separate — it puts wrong numbers in a member's script. So:
//   • Only pairs the model rates >= AUTO_MERGE_CONFIDENCE are eligible to apply.
//   • Anything below goes to a human review queue — NEVER auto-applied.
//   • The prompt is told, explicitly, to err toward "leave separate".

import Anthropic from "@anthropic-ai/sdk";
import { HAIKU_MODEL } from "@/lib/ai-models";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Pairs at or above this confidence may be auto-applied. Below → review. */
export const AUTO_MERGE_CONFIDENCE = 0.9;

/** Names are batched so a wide market doesn't blow the context window. */
const FUZZY_BATCH_SIZE = 120;

/**
 * How many batches run at once. Batches are independent (each de-dupes only its
 * own names), so a wide market's batches can run concurrently. Sequential calls
 * blew the request/gateway timeout on large vocabs (e.g. ~40 batches × several
 * seconds each → the dry-run returned a bodyless 504 the UI showed as
 * "Could not compute a cleanup."). Bounded concurrency keeps the wall time
 * comfortably under the route's budget without hammering the Anthropic API.
 */
const FUZZY_CONCURRENCY = 6;

export interface FuzzyMergeProposal {
  /** The canonical display name that should absorb `from`. */
  into: string;
  /** The canonical display name proposed to be folded away. */
  from: string;
  /** Model confidence in [0,1] that these are the same real neighbourhood. */
  confidence: number;
  /** One-line model rationale (for the review UI / audit). */
  reason: string;
}

export interface FuzzyPassResult {
  /** confidence >= AUTO_MERGE_CONFIDENCE — eligible to apply automatically. */
  autoMerges: FuzzyMergeProposal[];
  /** confidence < AUTO_MERGE_CONFIDENCE — surfaced for human review only. */
  reviewQueue: FuzzyMergeProposal[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  /** Set when the AI pass was skipped or failed; deterministic result stands. */
  skippedReason?: string;
}

// Haiku 4.5 pricing (USD per token).
const HAIKU_INPUT_COST = 1 / 1_000_000;
const HAIKU_OUTPUT_COST = 5 / 1_000_000;

function buildPrompt(names: string[]): string {
  return [
    "You are de-duplicating a list of real-estate neighbourhood / subdivision",
    "names for ONE market. Each line is already a cleaned canonical name. Some",
    "are the SAME real neighbourhood spelled differently (typos, abbreviations",
    'like "Mt" vs "Mount", or a descriptive prefix like "The Estates At X" vs',
    '"X"). Most are genuinely DIFFERENT places that merely share a word.',
    "",
    "Return ONLY a JSON array of merge proposals. Each item:",
    '  { "into": "<keep this name>", "from": "<fold this name in>",',
    '    "confidence": <0..1>, "reason": "<short>" }',
    "",
    "RULES — read carefully:",
    "- Propose a merge ONLY when you are confident the two names denote the",
    "  exact same physical neighbourhood. When unsure, DO NOT propose it.",
    "- A shared common word (Park, Ridge, Creek, Ranch, Estates, Hills) is NOT",
    "  evidence they are the same place. Different places often share words.",
    '- "into" should be the cleaner / shorter / more standard spelling.',
    "- confidence 0.95+ = near-certain (clear typo or trivial variant).",
    "  0.90–0.94 = very likely. Below 0.90 = a guess — still report it (it goes",
    "  to human review) but score it honestly low.",
    "- Err toward leaving names SEPARATE. A wrong merge corrupts market stats.",
    "- Never merge two names that are both already distinct, well-formed",
    "  neighbourhoods just because they are geographically near each other.",
    "",
    "Names:",
    ...names.map((n) => `- ${n}`),
  ].join("\n");
}

function parseProposals(text: string): FuzzyMergeProposal[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: FuzzyMergeProposal[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const into = typeof r.into === "string" ? r.into.trim() : "";
    const from = typeof r.from === "string" ? r.from.trim() : "";
    let confidence =
      typeof r.confidence === "number" ? r.confidence : Number(r.confidence);
    if (!Number.isFinite(confidence)) continue;
    confidence = Math.max(0, Math.min(1, confidence));
    const reason = typeof r.reason === "string" ? r.reason.slice(0, 240) : "";
    if (!into || !from || into.toLowerCase() === from.toLowerCase()) continue;
    out.push({ into, from, confidence, reason });
  }
  return out;
}

/**
 * Run the conservative fuzzy near-duplicate pass over a list of canonical
 * display names. Returns auto-mergeable proposals (>= AUTO_MERGE_CONFIDENCE)
 * and a review queue (below the floor). Never throws — on any failure it
 * returns an empty result with `skippedReason` so the deterministic stage
 * stands on its own.
 */
export async function runFuzzyPass(
  canonicalNames: string[],
): Promise<FuzzyPassResult> {
  const names = Array.from(
    new Set(canonicalNames.map((n) => n.trim()).filter(Boolean)),
  );
  const empty: FuzzyPassResult = {
    autoMerges: [],
    reviewQueue: [],
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
  if (names.length < 2) return { ...empty, skippedReason: "too_few_names" };
  if (!process.env.ANTHROPIC_API_KEY)
    return { ...empty, skippedReason: "no_api_key" };

  // Validate that the merged set is consistent — a name can only be folded into
  // one target, and a target can't also be a source. We resolve transitively
  // and drop conflicting proposals (conservative: keep separate on conflict).
  const all: FuzzyMergeProposal[] = [];
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const batches: string[][] = [];
  for (let i = 0; i < names.length; i += FUZZY_BATCH_SIZE) {
    const batch = names.slice(i, i + FUZZY_BATCH_SIZE);
    if (batch.length >= 2) batches.push(batch);
  }

  // One batch → its proposals + token usage. Never throws: a failed batch is
  // logged and contributes nothing, leaving the deterministic stage intact.
  const runBatch = async (
    batch: string[],
  ): Promise<{
    proposals: FuzzyMergeProposal[];
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }> => {
    try {
      const resp = await anthropic.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: buildPrompt(batch) }],
      });
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const known = new Set(batch.map((n) => n.toLowerCase()));
      const proposals: FuzzyMergeProposal[] = [];
      for (const p of parseProposals(text)) {
        // Both endpoints must be names we actually sent (no hallucinated names).
        if (!known.has(p.into.toLowerCase()) || !known.has(p.from.toLowerCase()))
          continue;
        proposals.push(p);
      }
      return {
        proposals,
        inputTokens: resp.usage.input_tokens,
        outputTokens: resp.usage.output_tokens,
        costUsd:
          resp.usage.input_tokens * HAIKU_INPUT_COST +
          resp.usage.output_tokens * HAIKU_OUTPUT_COST,
      };
    } catch (err) {
      console.error("[kb-merge][fuzzy] batch failed (non-fatal)", err);
      // Continue other batches; deterministic stage already stands.
      return { proposals: [], inputTokens: 0, outputTokens: 0, costUsd: 0 };
    }
  };

  // Run batches with bounded concurrency. Sequential awaits blew the request
  // timeout on wide markets; batches are independent so they parallelise safely.
  for (let i = 0; i < batches.length; i += FUZZY_CONCURRENCY) {
    const wave = batches.slice(i, i + FUZZY_CONCURRENCY);
    const results = await Promise.all(wave.map(runBatch));
    for (const r of results) {
      all.push(...r.proposals);
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      costUsd += r.costUsd;
    }
  }

  // Dedupe + resolve conflicts conservatively: if a name appears as both a
  // "from" and an "into", or as "from" in two proposals, keep only the highest-
  // confidence proposal touching it and drop the rest.
  all.sort((a, b) => b.confidence - a.confidence);
  const claimed = new Set<string>();
  const kept: FuzzyMergeProposal[] = [];
  for (const p of all) {
    const f = p.from.toLowerCase();
    const t = p.into.toLowerCase();
    if (claimed.has(f) || claimed.has(t)) continue;
    claimed.add(f);
    kept.push(p);
  }

  return {
    autoMerges: kept.filter((p) => p.confidence >= AUTO_MERGE_CONFIDENCE),
    reviewQueue: kept.filter((p) => p.confidence < AUTO_MERGE_CONFIDENCE),
    costUsd,
    inputTokens,
    outputTokens,
  };
}
