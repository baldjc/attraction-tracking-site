/**
 * POST /api/ai-tools/script-builder-v2/suggest-improvements
 *
 * Wave 3.5 — after the streaming generation returns a script, this
 * endpoint runs a fast Haiku review that compares what the script
 * USED against what the member's data library COULD have supported
 * (unused facts, untouched neighbourhood profiles, sub-personas
 * defined but not addressed, lead-magnet / binge assignments) and
 * returns 5 categorized suggestions plus a free-form delta metrics
 * payload the Step5 UI renders below the script.
 *
 * The 5 categories are FIXED and ORDERED — Claude returns exactly
 * one suggestion per category, ranked by impact:
 *   1. data_depth         — facts available but not cited
 *   2. specificity        — NeighbourhoodProfile context not pulled in
 *   3. audience_reach     — sub-personas defined but not addressed
 *   4. storytelling       — weakest section (intro / body / outro)
 *   5. cta_engagement     — lead-magnet pitch + next-video hook quality
 *
 * Gated under the EXISTING `tool_script_builder_v2` flag — no new flag.
 *
 * Cost target: ≤ $0.10 per call (Haiku, scoped prompt). Logged to
 * AIToolUsage with `toolType = 'script_suggest_improvements'` so the
 * admin AI-usage page can break it out separately from the main
 * Sonnet `script_builder_v2` rows.
 *
 * Defense-in-depth (matches the streaming route):
 *   1. Auth
 *   2. Flag (tool_script_builder_v2, with allowlist)
 *   3. v2 cost-cap pre-check (getCostCapStatus → 402)
 *   4. Ownership-filtered ContentPlan load
 *   5. Ownership-filtered MarketFact / NeighbourhoodProfile / Campaign
 *      / Binge plan loads — never cross-tenant.
 */
import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getCostCapStatus } from "@/lib/ai-tool-cost";
import { loadMarketConfigSummary } from "@/lib/content-engine-context";
import { getNeighbourhoodContext } from "@/lib/get-neighbourhood-context";

export const runtime = "nodejs";
export const maxDuration = 60;

// Oct 2025 pricing — same constants used by knowledge-base-parser.ts.
const HAIKU_MODEL = "claude-haiku-4-5";
const HAIKU_INPUT_COST_PER_TOKEN = 0.000001;
const HAIKU_OUTPUT_COST_PER_TOKEN = 0.000005;
const MAX_OUTPUT_TOKENS = 2000;

// Cap script length we ship to Claude — a 16-min talking-head clocks
// ~3000 words / ~18,000 chars. We trim hard at 24,000 chars (~4000
// words) so a pathological input can't push us over the $0.10 cost
// target.
const MAX_SCRIPT_CHARS = 24000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORY_ORDER = [
  "data_depth",
  "specificity",
  "audience_reach",
  "storytelling",
  "cta_engagement",
] as const;
type CategoryKey = (typeof CATEGORY_ORDER)[number];

interface RequestBody {
  planId?: string;
  script?: string;
}

interface SuggestionOut {
  id: string;
  category: CategoryKey;
  title: string;
  description: string;
  regenerationDirective: string;
}

interface MetricsOut {
  factsUsed: number;
  factsAvailable: number;
  subPersonasMentioned: string[];
  subPersonasMissing: string[];
  knowledgeBaseProfilesAvailable: number;
  knowledgeBaseProfilesReferenced: number;
  hasLeadMagnet: boolean;
  hasBingeTarget: boolean;
}

export async function POST(req: NextRequest) {
  // ── Auth + flag ──────────────────────────────────────────────────────
  const session = await auth();
  const userId = session?.user?.id;
  const userRole = session?.user?.role ?? null;
  if (!userId) return jsonError(401, "unauthorized");

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_script_builder_v2) return jsonError(404, "not_enabled");

  // ── Cost cap (hard block before any Claude work) ─────────────────────
  const cap = await getCostCapStatus(userId);
  if (cap.hardBlocked) {
    return jsonError(
      402,
      "monthly_cost_cap_reached",
      `You've hit your $${cap.capUsd.toFixed(2)} monthly AI budget. It resets on the 1st of next month.`,
    );
  }

  // ── Body ─────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json");
  }
  if (!body.planId) return jsonError(400, "missing_plan_id");
  if (!body.script || typeof body.script !== "string" || body.script.trim().length < 200) {
    return jsonError(400, "missing_or_short_script");
  }
  const script = body.script.slice(0, MAX_SCRIPT_CHARS);

  // ── Plan (ownership-filtered) ────────────────────────────────────────
  const plan = await prisma.contentPlan.findFirst({
    where: { id: body.planId, userId },
    select: {
      id: true,
      title: true,
      titlePromise: true,
      rotationSlot: true,
      linkedFactIds: true,
      linkedCampaignId: true,
      bingeVideoId: true,
    },
  });
  if (!plan) return jsonError(404, "plan_not_found");

  const linkedFactIds: string[] = Array.isArray(plan.linkedFactIds)
    ? (plan.linkedFactIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  // ── Facts: linked + available (all headline-safe owned by user) ──────
  const [linkedFacts, allHeadlineSafeFacts] = await Promise.all([
    linkedFactIds.length
      ? prisma.marketFact.findMany({
          where: { id: { in: linkedFactIds }, userId },
          select: {
            id: true,
            neighbourhood: true,
            metricName: true,
            metricValueString: true,
            dateContext: true,
          },
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof prisma.marketFact.findMany>>),
    prisma.marketFact.findMany({
      where: { userId, usageClass: "headline_safe" },
      select: {
        id: true,
        neighbourhood: true,
        metricName: true,
        metricValueString: true,
        dateContext: true,
      },
      take: 200,
    }),
  ]);

  const linkedFactIdSet = new Set(linkedFactIds);
  const unusedFacts = allHeadlineSafeFacts.filter((f) => !linkedFactIdSet.has(f.id));

  // ── MarketConfig (sub-personas defined) ──────────────────────────────
  const marketConfig = await loadMarketConfigSummary(userId);
  const definedSubPersonas = extractSubPersonaSlugs(marketConfig?.subPersonas);
  const scriptLower = script.toLowerCase();
  const subPersonasMentioned: string[] = [];
  const subPersonasMissing: string[] = [];
  for (const persona of definedSubPersonas) {
    if (mentionsPersona(scriptLower, persona)) subPersonasMentioned.push(persona);
    else subPersonasMissing.push(persona);
  }

  // ── Neighbourhood profiles (Wave 1.5) ────────────────────────────────
  const citedNeighbourhoods = Array.from(
    new Set(linkedFacts.map((f) => f.neighbourhood).filter((n): n is string => !!n)),
  );
  const profileContext = citedNeighbourhoods.length
    ? await getNeighbourhoodContext(userId, citedNeighbourhoods, "summary")
    : {};
  const profilesAvailable = Object.keys(profileContext);
  const profilesReferenced = profilesAvailable.filter((name) => {
    // Heuristic: a profile is "referenced" only if the script mentions
    // the neighbourhood name AND any non-trivial substring of the
    // summary (>= 12 chars) appears in the script. Pure neighbourhood
    // mentions don't count — the fact line already does that.
    const summary = (profileContext[name] ?? "").toLowerCase();
    if (!scriptLower.includes(name.toLowerCase())) return false;
    const chunks = summary.split(/[.\n]/).map((s) => s.trim()).filter((s) => s.length >= 12);
    return chunks.some((c) => scriptLower.includes(c.slice(0, 30)));
  });

  // ── Lead magnet + binge assignment ───────────────────────────────────
  let assignedCampaign: {
    name: string;
    description: string | null;
    pitchOneLiner: string | null;
    audience: string | null;
  } | null = null;
  if (plan.linkedCampaignId) {
    const c = await prisma.campaign.findFirst({
      where: { id: plan.linkedCampaignId, userId, deletedAt: null },
      select: { name: true, description: true, pitchOneLiner: true, audience: true },
    });
    if (c) assignedCampaign = c;
  }
  let assignedBinge: { title: string; theme: string | null } | null = null;
  if (plan.bingeVideoId) {
    const b = await prisma.contentPlan.findFirst({
      where: { id: plan.bingeVideoId, userId },
      select: { title: true, theme: true },
    });
    if (b) assignedBinge = b;
  }

  const metrics: MetricsOut = {
    factsUsed: linkedFacts.length,
    factsAvailable: allHeadlineSafeFacts.length,
    subPersonasMentioned,
    subPersonasMissing,
    knowledgeBaseProfilesAvailable: profilesAvailable.length,
    knowledgeBaseProfilesReferenced: profilesReferenced.length,
    hasLeadMagnet: assignedCampaign !== null,
    hasBingeTarget: assignedBinge !== null,
  };

  // ── Build user message for Haiku ────────────────────────────────────
  const userMessage = buildUserMessage({
    plan: { title: plan.title, titlePromise: plan.titlePromise ?? "", rotationSlot: plan.rotationSlot },
    script,
    linkedFacts,
    unusedFacts: unusedFacts.slice(0, 50),
    definedSubPersonas,
    subPersonasMentioned,
    subPersonasMissing,
    profilesAvailable,
    profileSummaries: profileContext,
    profilesReferenced,
    assignedCampaign,
    assignedBinge,
  });

  // ── Claude call (Haiku, JSON-forced via prompt) ─────────────────────
  let resp;
  try {
    resp = await anthropic.messages.create(
      {
        model: HAIKU_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      },
      { signal: req.signal },
    );
  } catch (err) {
    if (req.signal.aborted || (err as Error).name === "AbortError") {
      return jsonError(499, "client_aborted");
    }
    console.error("[suggest-improvements] haiku error:", err);
    return jsonError(502, "claude_call_failed", "Suggestion service is unavailable right now. Try again in a moment.");
  }

  const inputTokens = resp.usage?.input_tokens ?? 0;
  const outputTokens = resp.usage?.output_tokens ?? 0;
  const costUsd =
    inputTokens * HAIKU_INPUT_COST_PER_TOKEN +
    outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN;

  // Log to AIToolUsage with a precomputed Haiku cost — we can't reuse
  // `logUsage()` which is hardcoded to Sonnet pricing.
  await prisma.aIToolUsage
    .create({
      data: {
        userId,
        toolType: "script_suggest_improvements",
        inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(6),
      },
    })
    .catch((e) => console.error("[suggest-improvements] usage log failed:", e));

  // Parse JSON out of the response (Haiku sometimes wraps in a fence)
  const rawText = resp.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");
  const suggestions = parseSuggestions(rawText);
  if (!suggestions) {
    return new Response(
      JSON.stringify({
        error: "haiku_unparseable",
        message: "The suggestion service returned an unrecognised response. Try again.",
        rawText: rawText.slice(0, 1000),
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      suggestions,
      metrics,
      cost: Number(costUsd.toFixed(4)),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function jsonError(status: number, error: string, message?: string): Response {
  return new Response(
    JSON.stringify(message ? { error, message } : { error }),
    { status, headers: { "content-type": "application/json" } },
  );
}

/**
 * MarketConfig.subPersonas is a JSON column (unknown at the TS layer).
 * Accept any of: string[], Array<{slug|key|name|id: string}>, or fall
 * back to []. Slugs are lowercased + snake_cased so the mention
 * heuristic below is forgiving.
 */
function extractSubPersonaSlugs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const slugs: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      slugs.push(normalizeSlug(item));
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const candidate =
        (typeof o.slug === "string" && o.slug) ||
        (typeof o.key === "string" && o.key) ||
        (typeof o.id === "string" && o.id) ||
        (typeof o.name === "string" && o.name) ||
        null;
      if (candidate) slugs.push(normalizeSlug(candidate));
    }
  }
  return Array.from(new Set(slugs.filter(Boolean)));
}

function normalizeSlug(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * "Mentions" check is loose on purpose — the script doesn't tag its
 * sub-personas with slugs, it names them in natural language. We
 * accept either the slug spelled out ("first_time_buyer" / "first
 * time buyer" / "first-time buyer") or any natural-language token
 * derived from the slug (>= 4 chars).
 */
function mentionsPersona(scriptLower: string, slug: string): boolean {
  const slugSpaced = slug.replace(/_/g, " ");
  const slugDashed = slug.replace(/_/g, "-");
  if (scriptLower.includes(slugSpaced)) return true;
  if (scriptLower.includes(slugDashed)) return true;
  if (scriptLower.includes(slug)) return true;
  // Token fallback: every >=4-char token in the slug must appear.
  // Avoids the dictionary problem with "move_up" (2-char "up").
  const tokens = slug.split("_").filter((t) => t.length >= 4);
  if (tokens.length === 0) return false;
  return tokens.every((t) => scriptLower.includes(t));
}

const SYSTEM_PROMPT = `You are reviewing a Canadian real estate YouTube script to surface 5 specific improvements that would make it meaningfully better.

You receive:
- The script (markdown)
- A list of facts the script cited vs facts available but unused
- Neighbourhood profile summaries available (if any) and whether the script referenced them
- Sub-personas defined in the member's market config vs sub-personas the script actually addresses
- Lead magnet + binge video assignments (if any) and how the script handled them
- The title promise the script is meant to pay off

Return EXACTLY 5 suggestions, one per category, in this exact order:
1. data_depth
2. specificity
3. audience_reach
4. storytelling
5. cta_engagement

For each suggestion provide:
- title: 6-10 word punchy summary (becomes a button label)
- description: 2-3 sentences explaining the gap and the proposed fix
- regenerationDirective: 1-2 sentences in instructional voice ("Incorporate X", "Strengthen Y by Z") that will be passed verbatim to the regeneration prompt

Rules:
- Be specific. "Add more data" is not useful. "Add Saddle Ridge 52% failure rate to the body" is useful.
- Order suggestions by IMPACT (most impactful first). The member will probably only click 1-3.
- If a category has nothing meaningful to suggest (e.g., script already references all available facts), surface that honestly: "Script already uses all 50 headline-safe facts — further data depth would mean uploading a richer month." Don't fabricate gaps.
- No generic platitudes. No "consider adding more compelling language."
- Canadian spelling throughout (neighbourhood, colour, centre, analyse).

Output format — return ONLY a single JSON object, no preamble, no fences:

{
  "suggestions": [
    {
      "id": "suggestion-1",
      "category": "data_depth",
      "title": "...",
      "description": "...",
      "regenerationDirective": "..."
    },
    { "id": "suggestion-2", "category": "specificity", "...": "..." },
    { "id": "suggestion-3", "category": "audience_reach", "...": "..." },
    { "id": "suggestion-4", "category": "storytelling", "...": "..." },
    { "id": "suggestion-5", "category": "cta_engagement", "...": "..." }
  ]
}`;

function buildUserMessage(args: {
  plan: { title: string; titlePromise: string; rotationSlot: string | null };
  script: string;
  linkedFacts: Array<{
    id: string;
    neighbourhood: string;
    metricName: string;
    metricValueString: string | null;
    dateContext: Date | null;
  }>;
  unusedFacts: Array<{
    id: string;
    neighbourhood: string;
    metricName: string;
    metricValueString: string | null;
    dateContext: Date | null;
  }>;
  definedSubPersonas: string[];
  subPersonasMentioned: string[];
  subPersonasMissing: string[];
  profilesAvailable: string[];
  profileSummaries: Record<string, string>;
  profilesReferenced: string[];
  assignedCampaign: {
    name: string;
    description: string | null;
    pitchOneLiner: string | null;
    audience: string | null;
  } | null;
  assignedBinge: { title: string; theme: string | null } | null;
}): string {
  const lines: string[] = [];
  lines.push("## Idea card");
  lines.push(`- Title: ${args.plan.title}`);
  lines.push(`- Title promise: ${args.plan.titlePromise || "(none)"}`);
  if (args.plan.rotationSlot) lines.push(`- Rotation slot: ${args.plan.rotationSlot}`);
  lines.push("");

  lines.push("## Facts cited by the script");
  if (args.linkedFacts.length === 0) {
    lines.push("(none — script wasn't anchored to any facts)");
  } else {
    for (const f of args.linkedFacts) {
      lines.push(`- ${f.neighbourhood} · ${f.metricName} = ${f.metricValueString ?? "?"}`);
    }
  }
  lines.push("");

  lines.push(`## Facts AVAILABLE but unused (${args.unusedFacts.length} of ${args.unusedFacts.length + args.linkedFacts.length} headline-safe)`);
  if (args.unusedFacts.length === 0) {
    lines.push("(none — script uses every available headline-safe fact)");
  } else {
    for (const f of args.unusedFacts.slice(0, 30)) {
      lines.push(`- ${f.neighbourhood} · ${f.metricName} = ${f.metricValueString ?? "?"}`);
    }
    if (args.unusedFacts.length > 30) {
      lines.push(`- … and ${args.unusedFacts.length - 30} more.`);
    }
  }
  lines.push("");

  lines.push(`## Sub-personas defined in member's market config: ${args.definedSubPersonas.length}`);
  lines.push(`- Mentioned in script: ${args.subPersonasMentioned.join(", ") || "(none)"}`);
  lines.push(`- Defined but NOT mentioned: ${args.subPersonasMissing.join(", ") || "(none)"}`);
  lines.push("");

  lines.push(`## Neighbourhood profiles (Knowledge Base): ${args.profilesAvailable.length} available, ${args.profilesReferenced.length} referenced`);
  for (const name of args.profilesAvailable) {
    const summary = (args.profileSummaries[name] ?? "").slice(0, 300);
    const ref = args.profilesReferenced.includes(name) ? "referenced" : "NOT referenced";
    lines.push(`- ${name} (${ref}): ${summary}`);
  }
  lines.push("");

  lines.push("## Lead magnet assignment");
  if (args.assignedCampaign) {
    lines.push(`- Name: ${args.assignedCampaign.name}`);
    if (args.assignedCampaign.description) lines.push(`- What it is: ${args.assignedCampaign.description}`);
    if (args.assignedCampaign.pitchOneLiner) lines.push(`- Calibrated pitch: ${args.assignedCampaign.pitchOneLiner}`);
    if (args.assignedCampaign.audience) lines.push(`- Audience: ${args.assignedCampaign.audience}`);
    if (!args.assignedCampaign.pitchOneLiner) {
      lines.push("- (Note: no calibrated one-line pitch — admin may want to add one.)");
    }
  } else {
    lines.push("- (none assigned — script uses generic placeholders)");
  }
  lines.push("");

  lines.push("## Binge target assignment");
  if (args.assignedBinge) {
    lines.push(`- Title: ${args.assignedBinge.title}`);
    if (args.assignedBinge.theme) lines.push(`- Theme: ${args.assignedBinge.theme}`);
  } else {
    lines.push("- (none assigned — script uses a generic next-video tease)");
  }
  lines.push("");

  lines.push("## SCRIPT TO REVIEW");
  lines.push("```");
  lines.push(args.script);
  lines.push("```");
  lines.push("");
  lines.push("Now return the JSON object with exactly 5 suggestions, one per category, ordered as specified.");

  return lines.join("\n");
}

/**
 * Parse Haiku's response into our SuggestionOut[] shape. Resilient to:
 *   - ```json fences around the object
 *   - extra commentary before/after the JSON
 *   - extra suggestions beyond the 5 categories (clamped to one per
 *     category, in canonical order)
 * Returns null if we can't recover 5 categorized suggestions.
 */
function parseSuggestions(raw: string): SuggestionOut[] | null {
  const cleaned = raw
    .replace(/```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    // Last-ditch: pull the first {...} block out of the response.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      json = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  if (!json || typeof json !== "object") return null;
  const arr = (json as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(arr)) return null;

  const byCategory = new Map<CategoryKey, SuggestionOut>();
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const category = typeof o.category === "string" ? (o.category as string) : "";
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const description = typeof o.description === "string" ? o.description.trim() : "";
    const regenerationDirective =
      typeof o.regenerationDirective === "string" ? o.regenerationDirective.trim() : "";
    if (!CATEGORY_ORDER.includes(category as CategoryKey)) continue;
    if (!title || !description || !regenerationDirective) continue;
    const cat = category as CategoryKey;
    if (byCategory.has(cat)) continue; // keep first
    byCategory.set(cat, {
      id: typeof o.id === "string" && o.id ? o.id : `suggestion-${byCategory.size + 1}`,
      category: cat,
      title,
      description,
      regenerationDirective,
    });
  }
  if (byCategory.size !== CATEGORY_ORDER.length) return null;
  return CATEGORY_ORDER.map((c) => byCategory.get(c)!);
}
