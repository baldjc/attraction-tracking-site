/**
 * Script Builder v2 — extractable core (DE-RISK SPIKE, Task: tool-extractability).
 *
 * `buildScript(params)` is the pure-ish core of the Script Builder v2 tool:
 * it takes fully-resolved inputs (plan context, cited facts, market config,
 * neighbourhood context, source-of-truth metrics, assigned assets, presenter
 * identity) and runs the generate → auto-fix → soften → validate → re-prompt
 * loop, returning a structured result. It has NO dependency on Next.js
 * Request/Response, React, Prisma, auth, cost-capping, or the SSE controller.
 *
 * The HTTP route (`src/app/api/ai-tools/script-builder-v2/route.ts`) keeps all
 * the request-bound concerns (auth, feature flags, cost cap, DB loads, SSE
 * framing, billing) and calls `buildScript()` with streaming callbacks wired
 * to its EventStream so client-observable behaviour is identical.
 *
 * The LLM call is injected via `ScriptLlmStreamer` so the function can be
 * driven from a unit test with a fake streamer — no network, no API key, no
 * HTTP. The default streamer wraps the Anthropic SDK exactly as the route did.
 */
import Anthropic from "@anthropic-ai/sdk";
import { SCRIPT_BUILDER_MODE_PROMPT } from "@/lib/script-builder-mode-prompt";
import {
  autoFixMechanicalRules,
  autoSoftenUnanchoredStats,
  autoSoftenFabricatedBinge,
  validateScript,
  type ScriptViolation,
  type ScriptValidationResult,
} from "@/lib/script-content-rules";
import {
  renderSourceOfTruthBlockWithLock,
  type SourceOfTruthMetric,
} from "@/lib/aggregated-metrics";
import {
  type MarketConfigSummary,
  credentialsAnchorText,
} from "@/lib/content-engine-context";
import {
  ROTATION_SLOT_LABELS,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import {
  classifyAnthropicError,
  makeScriptError,
  type ScriptError,
} from "@/lib/script-builder-errors";

// ───────────────────────────────────────────────────────────────────────
// Public input/output types (shared with the route)
// ───────────────────────────────────────────────────────────────────────

export interface CitedFact {
  id: string;
  neighbourhood: string;
  metricName: string;
  metricLabel: string;
  metricValueString: string;
  monthYear: string;
  marketType: string | null;
  trajectory: string | null;
  caveat: string | null;
}

/**
 * Research Reader — an EXTERNAL source the member attached in Jarvis chat
 * (article, report, chart image, pasted text). These are NEVER the member's
 * own market data: their thesis/claims/stats may be referenced in the script
 * ONLY as clearly-attributed outside research, and a research number must
 * never be spoken as one of the member's own market figures. They are kept
 * strictly separate from `CitedFact` (the member's validated MLS facts) so the
 * grounding validator can tell the two apart.
 */
export interface CitedResearch {
  title: string;
  /** Human-readable source reference (URL, filename, or "Pasted text"). */
  sourceRef: string;
  type: "pdf" | "text" | "url" | "image";
  thesis: string;
  claims: string[];
  stats: string[];
}

export interface PlanContext {
  id: string;
  title: string;
  rotationSlot: RotationSlotKey;
  titlePromise: string;
  visualPeak: string | null;
  thumbnailCallouts: string[];
  subPersonas: string[] | null;
  tactileType: string | null;
  framework: string | null;
  clarityPremise: string | null;
  estimatedRuntime: string | null;
}

export interface AssignedCampaign {
  name: string;
  destinationUrl: string;
  leadMagnetUrl: string | null;
  description: string | null;
  pitchOneLiner: string | null;
  audience: string | null;
}

export interface AssignedBingeVideo {
  title: string;
  theme: string | null;
  status: string;
  youtubeVideoId: string | null;
}

export interface RegenerationBrief {
  selectedSuggestions?: Array<{
    category?: string;
    title?: string;
    regenerationDirective?: string;
  }>;
  customNotes?: string;
  priorScript?: string;
}

// ───────────────────────────────────────────────────────────────────────
// Tuning constants (overridable via BuildScriptParams)
// ───────────────────────────────────────────────────────────────────────

const SONNET_MODEL = "claude-sonnet-4-20250514";
const MAX_REPROMPTS = 2;
const MAX_OUTPUT_TOKENS = 12000;
// Time budgeting — see the route's original notes. Keep generation strictly
// inside a budget below the platform wall and never START an attempt we can't
// finish, so a terminal (categorized) result is always returned.
const GENERATION_BUDGET_MS = 255_000;
const ATTEMPT_TIME_RESERVE_MS = 130_000;
const PER_ATTEMPT_TIMEOUT_MS = 180_000;


// ───────────────────────────────────────────────────────────────────────
// PropertyType lock helpers (Wave 4)
// ───────────────────────────────────────────────────────────────────────

// Ordered most-specific-first so a caveat like "Saddle Ridge Row/Townhouse"
// matches Row/Townhouse before falling through to a hypothetical future
// "Row" entry. Mirrors the values whitelisted in save-idea/route.ts.
const PROPERTY_TYPE_PATTERNS: Array<{ type: string; re: RegExp }> = [
  { type: "Row/Townhouse", re: /\brow\s*\/?\s*townhouse\b|\btownhouse\b|\brow\b/i },
  { type: "Semi-Detached", re: /\bsemi[-\s]?detached\b/i },
  { type: "Apartment", re: /\bapartment\b|\bcondo\b/i },
  { type: "Detached", re: /\bdetached\b/i },
];

function extractPropertyTypeFromCaveat(caveat: string | null): string | null {
  if (!caveat) return null;
  for (const { type, re } of PROPERTY_TYPE_PATTERNS) {
    if (re.test(caveat)) return type;
  }
  return null;
}

/**
 * Build the per-neighbourhood propertyType lock map consumed by
 * `renderSourceOfTruthBlockWithLock`. Precedence per neighbourhood:
 *   1. caveat-derived type from the first citedFact that mentions one
 *   2. plan.propertyTypeFocus (member-set on the plan)
 *   3. "All" — full per-type SoT exposure, no lock
 *
 * Caveat takes precedence over the plan-level focus because the cited
 * fact is the most specific signal — if the wizard linked a Row/Townhouse
 * stat, that's what the video is anchored on regardless of whether the
 * member also pinned "Detached" on the plan.
 */
export function buildPropertyTypeLock(
  facts: CitedFact[],
  planFocus: string | null,
): Record<string, string> {
  // First pass: group caveat-derived types per hood (preserving citedFact
  // order so "first caveat wins" remains deterministic). We must scan ALL
  // facts for a hood before falling back to planFocus / "All" — otherwise
  // a leading fact with no caveat type would shadow a trailing fact whose
  // caveat clearly names the type and let drift back in.
  const caveatTypesByHood = new Map<string, string[]>();
  const seenHoods: string[] = [];
  for (const f of facts) {
    if (!f.neighbourhood) continue;
    if (!caveatTypesByHood.has(f.neighbourhood)) {
      caveatTypesByHood.set(f.neighbourhood, []);
      seenHoods.push(f.neighbourhood);
    }
    const t = extractPropertyTypeFromCaveat(f.caveat);
    if (t) caveatTypesByHood.get(f.neighbourhood)!.push(t);
  }

  const map: Record<string, string> = {};
  for (const hood of seenHoods) {
    const caveatTypes = caveatTypesByHood.get(hood) ?? [];
    const distinct = Array.from(new Set(caveatTypes));
    if (distinct.length > 1) {
      // Multiple cited facts in the same hood disagree on propertyType —
      // a video that anchors on multiple types for one neighbourhood is
      // ambiguous. Honour plan.propertyTypeFocus if it picks a side;
      // otherwise fall through to "All" so no per-type lock is applied
      // (the cited facts themselves still constrain the script). Log so
      // the conflict is visible in [sb-v2:lock].
      console.log(
        `[sb-v2:lock] conflicting caveat types for ${hood}: ${distinct.join(",")} — planFocus=${planFocus ?? "(none)"}`,
      );
      if (planFocus && distinct.includes(planFocus)) {
        map[hood] = planFocus;
      } else {
        map[hood] = planFocus ?? "All";
      }
      continue;
    }
    const firstCaveat = distinct[0] ?? null;
    map[hood] = firstCaveat ?? planFocus ?? "All";
  }
  return map;
}


// ───────────────────────────────────────────────────────────────────────
// User-message builders
// ───────────────────────────────────────────────────────────────────────

/**
 * Initial draft request. Packs the plan + cited facts + market config +
 * neighbourhood summaries into the user message. The cached system prompt
 * (`SCRIPT_BUILDER_MODE_PROMPT`) supplies all the voice / structure rules;
 * this message supplies the specifics for THIS script.
 *
 * The OUTPUT FORMAT block at the bottom restates the locked content rules
 * the server-side validation gate enforces — Claude that knows what's
 * being checked produces fewer re-prompt rounds.
 */
function buildInitialUserMessage(args: {
  plan: PlanContext;
  facts: CitedFact[];
  citedResearch?: CitedResearch[];
  marketConfig: MarketConfigSummary;
  neighbourhoodContext: Record<string, string>;
  sourceOfTruthMetrics: SourceOfTruthMetric[];
  propertyTypeByHood: Record<string, string>;
  shootType: "talking_head" | "home_tour";
  assignedCampaign: AssignedCampaign | null;
  assignedBingeVideo: AssignedBingeVideo | null;
  regenerationBrief: RegenerationBrief | null;
  memberFullName: string | null;
  activeStressor: { name: string; coreStress: string } | null;
}): string {
  const {
    plan,
    facts,
    marketConfig,
    memberFullName,
    neighbourhoodContext,
    sourceOfTruthMetrics,
    propertyTypeByHood,
    shootType,
    assignedCampaign,
    assignedBingeVideo,
    regenerationBrief,
    activeStressor,
  } = args;
  const citedResearch = args.citedResearch ?? [];
  const hasResearch = citedResearch.length > 0;
  const lines: string[] = [];
  // LEAN GROUNDED MODE — when no neighbourhood profile prose is loaded, the
  // 2,200-word floor (which assumes a profile to expand from) does not apply;
  // the output instruction below must ask for a lean, fully-grounded draft
  // instead of telling the model to pad toward 2,200 with colour it can't source.
  const hasProfile = Object.keys(neighbourhoodContext).length > 0;
  // A market update earns its length from DATA, not profile prose. A 1,600-word
  // market update is already a full 10-12 minutes, so it uses the lean floor and
  // a 1,700-1,950 target even when a neighbourhood profile happens to be loaded —
  // pushing it toward 2,200 only invites padding.
  const isMarketUpdate = plan.rotationSlot === "market_update";

  // ── PRIOR ATTEMPT — REVISION NOTES ──────────────────────────────────
  // Wave 3.5: when the client sends a regenerationBrief, prepend a
  // targeted-revision block AT THE TOP of the USER message. The cached
  // system prompt (SCRIPT_BUILDER_MODE_PROMPT) must NOT change between
  // generations — otherwise prompt caching breaks. All revision context
  // lives here, in the user-message-only branch.
  if (regenerationBrief) {
    const selected = Array.isArray(regenerationBrief.selectedSuggestions)
      ? regenerationBrief.selectedSuggestions.filter(
          (s) =>
            s &&
            typeof s.title === "string" &&
            typeof s.regenerationDirective === "string" &&
            s.regenerationDirective.trim().length > 0,
        )
      : [];
    const notes =
      typeof regenerationBrief.customNotes === "string"
        ? regenerationBrief.customNotes.trim()
        : "";
    const priorScript =
      typeof regenerationBrief.priorScript === "string"
        ? regenerationBrief.priorScript.trim()
        : "";

    if (selected.length > 0 || notes || priorScript) {
      lines.push("# PRIOR ATTEMPT — REVISION NOTES");
      lines.push("");
      lines.push(
        "The previous script for this idea is below. The member has asked for the following specific improvements in this regeneration:",
      );
      lines.push("");
      if (selected.length > 0) {
        for (const s of selected) {
          lines.push(`- **${s.title}**: ${s.regenerationDirective!.trim()}`);
        }
        lines.push("");
      }
      if (notes) {
        // Quote-escape so embedded `"` don't break the prompt's mental model.
        const safe = notes.replace(/"/g, '\\"');
        lines.push(`Member's custom note: "${safe}"`);
        lines.push("");
      }
      lines.push(
        "Generate a FRESH script that addresses these specific improvements while keeping the core thesis (cited facts, title promise, framework, structure). Do NOT just patch the prior script — rewrite it stronger and tighter. The improvements above are the priority; everything else in the existing context still applies.",
      );
      lines.push("");
      if (priorScript) {
        // Cap at ~24k chars so a pathological prior script doesn't
        // blow out the context budget. The script writer rewrites
        // from scratch — they only need the prior as reference.
        const capped =
          priorScript.length > 24000
            ? priorScript.slice(0, 24000) + "\n…[truncated]"
            : priorScript;
        lines.push("PRIOR SCRIPT FOR REFERENCE:");
        lines.push("```");
        lines.push(capped);
        lines.push("```");
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
  }

  lines.push(`Shoot type: ${shootType}`);
  lines.push(`Market: ${marketConfig.marketName}`);
  lines.push("");

  // ── PRESENTER IDENTITY — the ONLY source of who is on camera (B1) ────
  // Strict read from the resolved member. Never a hardcoded fallback: if a
  // figure is unset, it is simply omitted (no other presenter's numbers).
  {
    const cred = marketConfig.teamCredibility;
    const hasCred = !!(
      cred &&
      (cred.yearsInBusiness != null ||
        cred.familiesHelped != null ||
        cred.annualTransactionCount != null ||
        (cred.notes != null && cred.notes.trim().length > 0))
    );
    lines.push(
      "## PRESENTER IDENTITY (the ONLY source for who is on camera — never invent or borrow)",
    );
    lines.push("");
    lines.push(
      `- Presenter name: ${memberFullName ?? "[SET YOUR NAME IN ONBOARDING]"}`,
    );
    lines.push(`- Market: ${marketConfig.marketName}`);
    if (hasCred && cred) {
      if (cred.yearsInBusiness != null)
        lines.push(`- Years in business: ${cred.yearsInBusiness}`);
      if (cred.familiesHelped != null)
        lines.push(`- Families helped: ${cred.familiesHelped}`);
      if (cred.annualTransactionCount != null)
        lines.push(`- Homes sold per year: ${cred.annualTransactionCount}`);
      if (cred.teamSize != null) lines.push(`- Team size: ${cred.teamSize}`);
      if (cred.notes != null && cred.notes.trim().length > 0)
        lines.push(`- Credibility notes: ${cred.notes.trim()}`);
      lines.push("");
      lines.push(
        "Use ONLY this name and these figures for any self-identification or credibility moment. Do NOT invent or substitute any other name, city, tenure, or numbers.",
      );
    } else {
      lines.push("");
      lines.push(
        "This presenter has NOT set credibility figures yet. Do NOT state any years-in-business, transaction counts, or families-helped numbers, and do NOT borrow them from anyone else. Omit credentials entirely. If a credibility reference is structurally unavoidable, do NOT print any placeholder or bracketed token — instead use a qualitative experience bridge that claims NO specific figure (e.g. \"after running these numbers across the city\" / \"having watched this market closely\"). NEVER write a literal token such as [SET YOUR CREDIBILITY IN ONBOARDING] in the script, and never fill it with a guess or anyone else's numbers.",
      );
    }
    lines.push("");
  }

  lines.push("## Idea card (what to script)");
  lines.push("");
  lines.push(`**Title:** ${plan.title}`);
  lines.push(
    `**Rotation slot:** ${plan.rotationSlot} (${ROTATION_SLOT_LABELS[plan.rotationSlot] ?? plan.rotationSlot})`,
  );
  lines.push(`**Title promise:** ${plan.titlePromise}`);
  if (plan.clarityPremise)
    lines.push(`**Clarity premise:** ${plan.clarityPremise}`);
  if (plan.framework) lines.push(`**Framework:** ${plan.framework}`);
  if (plan.tactileType) lines.push(`**Tactile type:** ${plan.tactileType}`);
  if (plan.estimatedRuntime)
    lines.push(`**Estimated runtime:** ${plan.estimatedRuntime}`);
  if (plan.visualPeak) lines.push(`**Visual peak:** ${plan.visualPeak}`);
  if (plan.thumbnailCallouts.length)
    lines.push(
      `**Thumbnail callouts:** ${plan.thumbnailCallouts.join(" | ")}`,
    );
  if (plan.subPersonas && plan.subPersonas.length)
    lines.push(
      `**Sub-personas to name in the body:** ${plan.subPersonas.join(", ")}`,
    );
  lines.push("");

  if (activeStressor) {
    lines.push("## Active Avatar Stressor (REQUIRED — acknowledge in the BODY)");
    lines.push("");
    lines.push(
      `This idea is being scripted under the **${activeStressor.name}** Avatar Stressor — the specific worry this avatar carries, in their own voice:`,
    );
    lines.push(`> "${activeStressor.coreStress}"`);
    lines.push("");
    lines.push(
      "REQUIRED (server-checked — the draft is rejected and you are re-prompted if it's missing): weave ONE or TWO genuine acknowledgements of THIS worry into the body (the psychology layer). Reuse two or three distinctive words from the quoted question verbatim, paired with felt language (\"the part that actually keeps you up\", \"the fear of…\", \"what you're really weighing\", \"that hesitation is normal\"), so the beat is unmistakably about THIS stressor and not generic. Empowered, never aggrieved — name the worry, then steady it. Distribute the beats; never stack them, and never put them in the title, thumbnail, packaging, or the two-beat intro.",
    );
    lines.push("");
  }

  lines.push("## Cited facts (USE THESE — do NOT invent stats)");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(facts, null, 2));
  lines.push("```");
  lines.push("");

  // ── CITED RESEARCH (EXTERNAL) — Research Reader ──────────────────────────
  // External sources the member attached in chat (article, report, chart,
  // pasted text). These are NOT the member's own market data. They may be
  // referenced in the body ONLY as clearly-attributed outside research, and a
  // research number must NEVER be spoken as one of the member's own market
  // figures (the member's data leads; research is the supporting outside lens).
  if (hasResearch) {
    lines.push("## CITED RESEARCH (EXTERNAL — attribute clearly, never as your own market data)");
    lines.push("");
    lines.push(
      "The member attached the following EXTERNAL research. These are outside sources — NOT the member's own MLS data. You MAY reference their thesis, claims, and figures to frame or contextualise the local story, but you MUST attribute every one to the named source in-dialogue (e.g. \"a recent [source] report found…\", \"according to [source]…\"). Rules:",
    );
    lines.push("");
    lines.push(
      "- **The member's local data LEADS.** Research is the supporting outside lens, never the headline. Open and anchor on the member's own validated facts; bring research in to contrast or contextualise.",
    );
    lines.push(
      "- **NEVER speak a research number as the member's own market figure.** A figure from research must always carry its external attribution (\"the national report shows X\"), never \"our market\"/\"we pulled\"/\"this market\"/\"locally\". Doing so is a hard server-side failure.",
    );
    lines.push(
      "- **Do not invent or round research figures.** Use them exactly as stated below, with attribution, or omit them.",
    );
    lines.push("");
    for (const r of citedResearch) {
      lines.push(`### ${r.title} (${r.type})`);
      lines.push(`- **Source reference:** ${r.sourceRef}`);
      if (r.thesis) lines.push(`- **Thesis:** ${r.thesis}`);
      if (r.claims.length) {
        lines.push("- **Key claims:**");
        for (const c of r.claims) lines.push(`  - ${c}`);
      }
      if (r.stats.length) {
        lines.push("- **Key figures (external — attribute to this source):**");
        for (const s of r.stats) lines.push(`  - ${s}`);
      }
      lines.push("");
    }
  }

  // ── SOURCE-OF-TRUTH METRICS (Wave 1, deterministic) ──────────────────
  // These rows were computed directly from the member's CSV BEFORE the
  // Sonnet validator ran. They are the ground truth for any number that
  // appears in the script. The server-side `no_misattributed_stats`
  // validator cross-checks every numeric token in the draft against this
  // set; numbers attributed to outside sources (CREB, CMHC, etc.) that
  // actually match a SoT value within 2% surface as warnings to the
  // member. Render the section even when empty so Claude doesn't fill the
  // vacuum with invented stats.
  // Wave 4: per-neighbourhood propertyType lock. Non-citywide neighbourhoods
  // whose lock is set (caveat-derived OR plan.propertyTypeFocus) get filtered
  // to (lock-matching rows + "All" rows) and an EXCLUDED marker appended.
  // "All Neighbourhoods" rollup passes through unchanged.
  const sotBlock = renderSourceOfTruthBlockWithLock(
    sourceOfTruthMetrics,
    propertyTypeByHood,
  );
  const lockedHoods = Object.entries(propertyTypeByHood).filter(
    ([, v]) => v && v !== "All",
  );
  lines.push(
    "## SOURCE-OF-TRUTH METRICS (deterministic, computed from member's CSV — these are LAW)",
  );
  lines.push("");
  if (sotBlock) {
    lines.push(
      "Every numeric stat you write in the script body must match one of these values within 2% tolerance, and must be attributed to the member's own market analysis (NOT to CREB, CMHC, or any outside body). These are the deterministic aggregations from the member's uploaded MLS data — they are the channel's edge.",
    );
    const hasPeriodRows = sourceOfTruthMetrics.some(
      (m) => !/^\d{4}-\d{2}$/.test(m.monthYear),
    );
    const hasYearAgoRows = (() => {
      const months = sourceOfTruthMetrics
        .map((m) => m.monthYear)
        .filter((my) => /^\d{4}-\d{2}$/.test(my))
        .sort();
      if (months.length < 2) return false;
      // A ~12-month gap between the earliest and latest cited month means
      // year-ago endpoints are present (we inject them under their own header).
      const first = months[0];
      const last = months[months.length - 1];
      return first.slice(0, 4) !== last.slice(0, 4);
    })();
    if (hasPeriodRows || hasYearAgoRows) {
      lines.push("");
      lines.push(
        "**TREND ROWS PRESENT.** The most recent `(month: …)` rows are your spine. " +
          (hasYearAgoRows
            ? "**Year-ago rows are present (under their own earlier `(month: …)` header), so a year-over-year comparison is a REQUIRED beat — not optional texture.** For EACH headline metric that has both endpoints — median price, months of inventory (MOI), and sale-to-list ratio — state BOTH the year-ago value and the current value and name each period (e.g. \"the median was $591,250 in May last year, and it's $X today\"). Cite both real numbers, not just a percentage; treating the year-ago rows as mere extra sources without comparing is a FAIL. "
            : "") +
          (hasPeriodRows
            ? "`(period: 90-day pooled …)` rows are a TRUE trailing-quarter pooled figure — reference them as \"over the last 90 days,\" never as a single month. "
            : "") +
          "Only reference a period whose row is actually shown; if a period is absent, do not mention it. Cite every trend number in `## Sources`, scoped to its period.",
      );
    }
    if (lockedHoods.length > 0) {
      lines.push("");
      lines.push(
        "**PROPERTY-TYPE LOCK** — this video covers a specific property type per neighbourhood. Per-type rows for excluded types have been suppressed and replaced with an `EXCLUDED property types` marker. Writing about an excluded type is a HARD FAIL:",
      );
      for (const [hood, type] of lockedHoods) {
        lines.push(`- ${hood}: **${type}** only`);
      }
    }
    lines.push("");
    lines.push(sotBlock);
    lines.push("");
  } else {
    lines.push(
      "No deterministic aggregations were found for the cited neighbourhoods in this script. Use ONLY the numbers from the Cited facts block above; do not introduce stats from any other source.",
    );
    lines.push("");
  }

  // ── VIEWER AVATAR ─────────────────────────────────────────────────────
  // Promoted to its own section (separate from MarketConfig JSON) so Claude
  // treats the avatar as the SOURCE for psychology beats, not as background
  // reference. The connection-language phrase list in the system prompt is
  // scaffolding; the avatar is what makes those phrases land as recognition.
  //
  // Gating is intentionally strict: an empty default MarketConfig still
  // carries an object-shaped primaryAvatar AND the full preset subPersonas
  // array (all `enabled: false`), so a truthy check would render an empty
  // section and confuse Claude. Only render when (a) the avatar has a real
  // snapshot — non-empty `snappedAt` + at least one of `summary`/`profile`
  // — and/or (b) at least one sub-persona is enabled.
  const rawAvatar = marketConfig.primaryAvatar as
    | { snappedAt?: unknown; summary?: unknown; profile?: unknown }
    | null
    | undefined;
  const hasSubstantiveAvatar = !!(
    rawAvatar &&
    typeof rawAvatar === "object" &&
    typeof rawAvatar.snappedAt === "string" &&
    rawAvatar.snappedAt.length > 0 &&
    ((typeof rawAvatar.summary === "string" &&
      rawAvatar.summary.trim().length > 0) ||
      (rawAvatar.profile &&
        typeof rawAvatar.profile === "object" &&
        Object.keys(rawAvatar.profile as Record<string, unknown>).length > 0))
  );
  const rawPersonas = marketConfig.subPersonas;
  const enabledPersonas = Array.isArray(rawPersonas)
    ? (rawPersonas as Array<{ id?: unknown; label?: unknown; enabled?: unknown }>)
        .filter((p) => p && typeof p === "object" && p.enabled === true)
        .map((p) => ({
          id: typeof p.id === "string" ? p.id : undefined,
          label: typeof p.label === "string" ? p.label : undefined,
        }))
        .filter((p): p is { id: string; label: string } => !!p.id && !!p.label)
    : [];
  if (hasSubstantiveAvatar || enabledPersonas.length > 0) {
    lines.push("## VIEWER AVATAR — the source for psychology beats");
    lines.push("");
    lines.push(
      "This is the specific viewer this script is for. Use their stated situation, internal language, and decision pressures as the raw material for the 1-3 psychology beats. When you write a 'that's me' recognition moment, cite a specific detail from this avatar profile — NOT the generic phrase list from the system prompt. The system prompt's CONNECTION LANGUAGE phrases are scaffolding; what makes them land is filling them with content drawn from THIS avatar.",
    );
    lines.push("");
    lines.push(
      "Specifically: at each psychology beat, name something concrete from the avatar's situation (their stage of life, the specific decision they're stuck on, the language they use, the thing they keep doing at 11pm), and connect it to the data you just laid down. Avoid generic 'families like yours' — that's targeting, not recognition.",
    );
    lines.push("");
    if (hasSubstantiveAvatar) {
      lines.push("### Primary avatar");
      lines.push("```json");
      lines.push(JSON.stringify(marketConfig.primaryAvatar, null, 2));
      lines.push("```");
      lines.push("");
    }
    if (enabledPersonas.length > 0) {
      lines.push(
        "### Sub-personas the member has enabled (use as variations within the body where natural)",
      );
      lines.push("");
      for (const p of enabledPersonas) {
        lines.push(`- **${p.label}** (\`${p.id}\`)`);
      }
      lines.push("");
    }
  }

  // ── MEMBER VOICE OVERRIDES (Ship B) ────────────────────────────────────
  // Layer-2 override on top of the default voice register baked into
  // script-builder-mode-prompt.ts. Foundations members never have voiceGuide
  // populated (no upload UI). Done-With-You members may upload their own
  // voice guide here. The system-prompt rule (added near the top of the
  // voice-register section) tells Claude how to weigh this against the
  // default. HARD RULES (data integrity, no_why, no_abbrev, propertyType
  // lock, ARC structure, LM placement, stat anchoring) ALWAYS win.
  const voiceGuide =
    typeof marketConfig.voiceGuide === "string"
      ? marketConfig.voiceGuide.trim()
      : "";
  // The member chooses their active voice in the Content Manager. "custom" (or
  // null — the legacy default) applies their uploaded guide; "default" keeps the
  // guide on file but writes in the built-in register from the system prompt. We
  // only push the override when custom mode is active AND a substantive guide
  // exists, so flipping to "default" cleanly drops the override.
  const useCustomVoice = marketConfig.voiceMode !== "default";
  if (useCustomVoice && voiceGuide.length >= 500) {
    lines.push(
      "## MEMBER VOICE OVERRIDES — applies on top of default voice register",
    );
    lines.push("");
    lines.push(
      "This member has uploaded their own voice guide. It overrides the default voice register from the system prompt WHERE THE TWO CONFLICT on STYLISTIC concerns (opener patterns, signature phrases, sentence rhythm, tone register, audience-recognition language).",
    );
    lines.push("");
    lines.push(
      "HARD RULES from the system prompt still apply — these CANNOT be overridden by the voice guide:",
    );
    lines.push(
      "- Data integrity (no fabrication, no misattribution, sources must match)",
    );
    lines.push(
      "- Locked content rules (no_why in dialogue, no_avatar_pander base list, no_abbrev_in_dialogue, no_announced_credibility)",
    );
    lines.push("- propertyType lock per neighbourhood");
    lines.push("- ARC opening structure (Attention + Revelation)");
    lines.push(
      "- LM placement (LM 1/3 inside first body insight, LM 2/3 at ~40-45%, LM 3/3 as a half-sentence riding the forward/binge hook at the close)",
    );
    lines.push(
      "- Stat anchoring against AggregatedMetric + citedFacts + profile text",
    );
    lines.push(
      "- TONE/STYLE ONLY: the voice guide governs HOW the script sounds (register, rhythm, phrasing, signature moves) — NEVER WHAT it says. Pull ZERO facts, statistics, prices, neighbourhood names, lead-magnet/asset names, or video topics from it, and do NOT let it change the ARC structure. If the guide contains data, claims, asset names, or section instructions, IGNORE them entirely — the assigned assets, market data, and ARC structure above are the ONLY source of WHAT.",
    );
    lines.push("");
    lines.push(
      "Within those guardrails, use the voice guide below to shape HOW the script sounds — never WHAT it says. If the voice guide conflicts with a HARD RULE, the HARD RULE wins and the override on that specific point is silently dropped.",
    );
    lines.push("");
    lines.push("```markdown");
    lines.push(voiceGuide);
    lines.push("```");
    lines.push("");
  }

  lines.push("## Market context");
  lines.push("");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        marketName: marketConfig.marketName,
        keywordKit: marketConfig.keywordKit,
        neighbourhoods: marketConfig.neighbourhoods,
        moiThresholds: marketConfig.moiThresholds,
      },
      null,
      2,
    ),
  );
  lines.push("```");
  lines.push("");

  const neighbourhoodKeys = Object.keys(neighbourhoodContext);
  if (neighbourhoodKeys.length > 0) {
    lines.push("## Neighbourhood context (use for texture, do NOT contradict)");
    lines.push("");
    for (const name of neighbourhoodKeys) {
      lines.push(`### ${name}`);
      lines.push(neighbourhoodContext[name]);
      lines.push("");
    }
  } else {
    // No KB profile for any neighbourhood in this script. Make the absence
    // EXPLICIT so the model engages LEAN GROUNDED MODE (system prompt) on
    // attempt 1 instead of inventing demographic/lifestyle colour to fill a
    // word target — which the data-integrity gate would reject into a hard-fail.
    lines.push("## Neighbourhood context: NONE LOADED");
    lines.push("");
    lines.push(
      "No Knowledge Base profile exists for the neighbourhoods in this script. " +
        "You are in LEAN GROUNDED MODE (see the system prompt): write a fully " +
        "data-grounded script from your cited facts and the SOURCE-OF-TRUTH " +
        "METRICS block ONLY. Do NOT write any demographic, build-era, income, " +
        "housing-style, school, or named-amenity colour, and do NOT invent any " +
        "price range, threshold, cadence, or number. A lean grounded script is " +
        "legitimately shorter — never pad with invented colour.",
    );
    lines.push("");
  }

  // ── ASSIGNED ASSETS ──────────────────────────────────────────────────
  // The member's planner picks for this video. The script writer MUST
  // use these verbatim — no generic substitutes — for the [LEAD MAGNET]
  // placements and the closing [CALLBACK] hook.
  lines.push("## ASSIGNED ASSETS");
  lines.push("");

  if (assignedCampaign) {
    const url =
      assignedCampaign.leadMagnetUrl ?? assignedCampaign.destinationUrl;
    lines.push(
      "**Lead magnet** — this is the SPECIFIC asset the member assigned to this video. The script has THREE lead-magnet placements: `[LEAD MAGNET 1/3]` (INSIDE the first body insight — ONE natural sentence woven into that insight's specific point, gap→tool→identity, avatar-anchored, a bolted-on gift block is BANNED, NOT in the opening), `[LEAD MAGNET 2/3]` (at ~40-45% — the DEEP pitch using the fields below), `[LEAD MAGNET 3/3]` (a HALF-SENTENCE riding the forward/binge hook at the very end — this IS the LM 3/3 placement, no additional LM mention; one casual half-sentence anchored to what the video just delivered, NOT a standalone closing CTA). The `pitchOneLiner` and `description` fields below are the source material for the DEEP pitch at LM 2/3. For LM 1/3 and LM 3/3, write short casual references to the asset by name — do NOT replay the full pitch. Do NOT invent a generic budget-calculator, report, or guide pitch from the name alone — the fields below tell you what this asset actually is and how the member pitches it.",
    );
    lines.push("");
    lines.push(`- **Name:** ${assignedCampaign.name}`);
    if (assignedCampaign.description) {
      lines.push(`- **What it is:** ${assignedCampaign.description}`);
    }
    if (assignedCampaign.pitchOneLiner) {
      lines.push(
        `- **One-line pitch (USE THIS VERBATIM or with minimal adaptation):** ${assignedCampaign.pitchOneLiner}`,
      );
    }
    if (assignedCampaign.audience) {
      lines.push(`- **Audience:** ${assignedCampaign.audience}`);
    }
    lines.push(`- **URL:** ${url}`);
    lines.push("");
    if (assignedCampaign.pitchOneLiner) {
      lines.push(
        "The **one-line pitch** above is the member's calibrated pitch language for THIS asset. Use it verbatim (or with minimal rewording) as the spine of the DEEP pitch at `[LEAD MAGNET 2/3]` (~40-45% through). For the casual mentions at `[LEAD MAGNET 1/3]` (INSIDE the first body insight, woven naturally into that section's specific point — NOT a bolted-on gift block, NOT in the opening) and `[LEAD MAGNET 3/3]` (a HALF-SENTENCE riding the forward/binge hook at the very end — this is the only LM placement in the closing, no additional LM mention, NOT a standalone closing CTA), reference the asset by name in one sentence anchored to the surrounding content — do NOT replay the full pitch. Do NOT substitute generic pitch language about budget calculators, reports, or guides based on the name.",
      );
    } else if (assignedCampaign.description) {
      lines.push(
        "No calibrated one-line pitch was provided for this asset. Write each `[LEAD MAGNET]` pitch from the **What it is** description above — do NOT invent a pitch from the name alone (which leads to generic budget-calculator / report-style language that doesn't match the actual asset).",
      );
    } else {
      lines.push(
        "Only the name was provided for this asset — no description or calibrated pitch. Keep each `[LEAD MAGNET]` placement to a SHORT generic pitch tied to the name (e.g. \"a free " +
          assignedCampaign.name.toLowerCase() +
          ' I put together") and do NOT invent specific feature claims about what the asset contains.',
      );
    }
    lines.push("");
    lines.push(
      `HARD RULE — LEAD MAGNET: The ONLY free/downloadable resource the script may offer is the assigned asset above ("${assignedCampaign.name}"). Do NOT invent or offer any other freebie — a calculator, checklist, quiz, worksheet, template, tracker, or similar — at ANY lead-magnet placement. Naming a different downloadable asset is a hard server-side failure.`,
    );
    lines.push("");
  } else {
    lines.push(
      "**Lead magnet:** _none assigned_ — keep each `[LEAD MAGNET 1/3]`, `[LEAD MAGNET 2/3]`, `[LEAD MAGNET 3/3]` placement to a short generic pitch (e.g. \"a free guide I put together\"). Do NOT invent a specific product name, and do NOT emit literal bracket-text such as `[LEAD MAGNET: your free guide]` in the script — the brackets are placeholders, not on-camera dialogue.",
    );
    lines.push("");
  }

  if (assignedBingeVideo) {
    lines.push(`**BINGE TARGET: "${assignedBingeVideo.title}"**`);
    if (assignedBingeVideo.theme)
      lines.push(`- Theme: ${assignedBingeVideo.theme}`);
    if (assignedBingeVideo.youtubeVideoId) {
      lines.push(
        `- YouTube URL: https://youtu.be/${assignedBingeVideo.youtubeVideoId} (this video is live — you may suggest it as an end-screen card)`,
      );
    }
    lines.push("");
    lines.push(
      "HARD RULE — BINGE TARGET: Reference this EXACT title in your closing forward/binge hook (the `[CALLBACK]` beat — a counter-intuitive Stakes hook, NOT a recap or pitch — with LM 3/3 as a half-sentence riding it). Do NOT invent a different title or topic, and do NOT tease any other \"next video\". This is the ONLY video your close may point to, and it exists now.",
    );
    lines.push("");
  } else {
    lines.push("**BINGE TARGET: none configured**");
    lines.push("");
    lines.push(
      "HARD RULE — BINGE TARGET: There is NO next video to point to. Do NOT reference a \"next video\", \"watch this next\", \"my next video\", \"this next one\", or any specific upcoming video ANYWHERE in the script — inventing one is a hard server-side failure. OMIT the next-video hook entirely. Close instead on a single counter-intuitive FORWARD-LOOKING line — what to watch for next in the market — NOT a backward recap and NOT a sales pitch, with LM 3/3 as a half-sentence riding it, ending on a generic ask (e.g. message you on Instagram, grab the guide in the description).",
    );
    lines.push("");
  }

  lines.push("## LOCKED CONTENT RULES (server-side enforced)");
  lines.push("");
  lines.push(
    "The following are checked by the server AFTER you finish. Failures trigger a re-prompt loop — get them right on the first pass:",
  );
  lines.push("");
  lines.push(
    "1. **No `why` in spoken dialogue.** Titles + `[VISUAL: ...]` tags are exempt. Use: \"the reason\", \"what's causing this\", \"what's behind this\", \"here's what's happening\", \"the mechanism\", \"what's driving this\", \"what's actually going on\".",
  );
  lines.push(
    "2. **No avatar-pander phrases:** \"for people like you\", \"families in your situation\", \"I see you\", \"you're not alone\", \"let me be direct with you here\", \"I want you to sit with that\". The identity construction *\"people like us\"* IS approved and encouraged.",
  );
  lines.push(
    "3. **No abbreviations in dialogue:** never `MOI`, `SP/LP`, or `DOM` in the spoken body. Always the full phrase (\"months of inventory\", \"sale-to-list ratio\", \"days on market\"). Abbreviations remain allowed inside `[VISUAL: ...]` tags and data overlays.",
  );
  lines.push(
    "4. **Numerals on the page:** `$750,000` / `49.4%` / `0.45 months of inventory` — write the script with numerals, not spelled-out numbers.",
  );
  lines.push(
    "5. **Hyper-local floor:** at least 1 anchored detail (neighbourhood / $ / % / MOI / year-month) per ~120 words of body dialogue.",
  );
  lines.push("6. **Canadian spelling throughout** (neighbourhood, colour, centre, analyse).");
  lines.push(
    "7. **Empathy + connection-language dosage (BODY, distributed):** the body must carry — woven across the WHOLE script, NEVER stacked in one section — at least **4 connection phrases** (viewer-directed recognition / voicing the viewer's questions: \"it makes sense that you'd think…\", \"you might be thinking…\", \"here's what that means for you\", \"if you've been…\"), at least **2 values-peppering beats** (team / business philosophy: \"we believe…\", \"the families we work with who win…\"), and at least **6 editorial / signature moments** (empowered reactions to WHAT THE DATA IS DOING: \"shockingly\", \"stupid tight\", \"think about that\", \"hold that thought\", \"did you catch that?\", a repetition-for-emphasis, one fourth-wall aside). Editorial reactions describe the MARKET, never your own feelings — first-person aggrieved lines (\"I'm annoyed/frustrated\", \"it drives me crazy\") are a hard failure. This is NOT a quota to pad: weave it into the existing data + psychology layers.",
  );
  lines.push("");

  lines.push("## OUTPUT");
  lines.push("");
  lines.push(
    "Produce the FULL talking-head script in the format the system prompt specifies (ARC opening: Attention + Revelation only — NO Connection beat, NO lead magnet in opening; the Revelation carries the EXPERTISE BRIDGE with ONE sideways credibility drop from the approved list, and every number in it MUST trace to the member's real credentials profile — never invent a cadence like \"every 53 hours\". Then DATA → PSYCHOLOGY → CLARITY body with `[LEAD MAGNET 1/3]` woven naturally into the FIRST body insight as one context-anchored sentence (a bolted-on gift block is BANNED), `[LEAD MAGNET 2/3]` deep pitch at ~40-45%, and a CLOSING that is a counter-intuitive FORWARD/BINGE hook to the next video — NOT a recap, NOT a sales pitch, no push-CTA — with `[LEAD MAGNET 3/3]` as a half-sentence riding that hook), with `[VISUAL: ...]` tags throughout. Every quantitative claim must be a clean traceable value — no placeholder/filler numbers (\"the 0K range\", \"$500,000-to-the 600K\", \"a meaningful amount\", dangling \"average sitting.\"). " +
      (isMarketUpdate
        ? "This is a market update — it earns its length from DATA, not profile prose. Target roughly 1,700-1,950 dialogue words and NEVER below 1,600 (a 1,600-word market update is already a full 10-12 minutes — do NOT pad to chase a higher number). Reach that length through grounded DEPTH: segment every metric by property type, compare neighbourhoods, interpret each number and its viewer implication, and add sub-persona guidance" +
          (hasProfile
            ? ", drawing on the loaded neighbourhood profile for colour where it fits"
            : " — never invent demographic/build-era/income/amenity colour or unsourced numbers") +
          ", and state each point only once. "
        : hasProfile
          ? "Body must be ≥ 2,200 dialogue words. "
          : "There is NO neighbourhood profile loaded, so the body must be lean and fully grounded — but it must STILL run a full 10-12 minutes (≥ 1,600 dialogue words). Reach that length through grounded DEPTH, NOT padding: segment every metric by property type, compare neighbourhoods, interpret each number and its viewer implication, and add sub-persona guidance — never invent demographic/build-era/income/amenity colour or unsourced numbers, and state each point only once. ") +
      "Cite every fact from the JSON above by weaving the metric value into dialogue at least once. Title-body contract: the first ~30 seconds (~150 words) must pay off the **Title promise** verbatim or near-verbatim.",
  );
  lines.push("");
  if (hasResearch) {
    lines.push(
      "Because this script draws on EXTERNAL research as well as the member's own data, the closing `## Sources` footnote MUST be split into TWO labelled sub-sections, in this order: `### Market data` — every market number you spoke, mapped to the member's fact id (exactly as you would normally list `## Sources`); and `### Research` — each external source you referenced, by its title and source reference from the CITED RESEARCH block above. Keep the two sets strictly separate: a research figure belongs ONLY under `### Research` with its source, NEVER under `### Market data`, and a member market number belongs ONLY under `### Market data`.",
    );
    lines.push("");
  }
  lines.push(
    "Begin with the title line as `# Title: <title>` so the parser knows where the body starts.",
  );

  return lines.join("\n");
}

/**
 * Per-violation concrete fix hint for the retry prompt. The system prompt
 * already lists generic replacements; this surfaces a sentence-shaped
 * rewrite anchored to the actual offending snippet so Claude can edit in
 * place instead of re-deriving the rule.
 */
function suggestRetryFix(v: ScriptViolation, hasProfile = true): string {
  if (v.rule === "unanchored_stat") {
    // Wave 5 — fabricated stat. Tell the model exactly what its three
    // legal options are (mirrors the system-prompt rule). Replacement
    // value can't be inferred here without re-extracting tokens; the
    // model has the SoT block + cited facts in its system message and
    // can pick the right anchor itself.
    return [
      `this number isn't in your Source-of-truth metrics block or the`,
      `cited-facts block. Either (a) replace it with the real value from`,
      `the data, (b) rewrite the sentence with directional language`,
      `("meaningfully above the citywide average", "most listings aren't`,
      `closing", "more sellers walking away than completing"), or (c)`,
      `remove the claim if it was load-bearing only for narrative. DO`,
      `NOT invent a replacement number.`,
    ].join(" ");
  }
  if (v.rule === "no_misattributed_stats") {
    // Wave 5 — member's own stat attributed to CREB/CMHC/BoC. Tell the
    // model how to re-attribute without dropping the number.
    return [
      `this number is your own deterministic aggregation but the`,
      `sentence credits an outside source (CREB / CMHC / BoC / etc.).`,
      `Keep the number; rewrite the attribution to the member's own`,
      `market analysis — "from the data we ran this month," "what our`,
      `team's seeing in the numbers," "we pulled this from MLS," "our`,
      `analysis shows."`,
    ].join(" ");
  }
  if (v.rule === "no_why" && v.snippet) {
    const rewritten = v.snippet
      // "the reason why" → "the reason" (kill the redundant why first)
      .replace(/\bthe reason why\b/gi, "the reason")
      // "here's why" / "that's why" / "and here's why" → "here's what's behind" / "what's happening"
      .replace(/\bhere'?s why\b/gi, "here's what's behind")
      .replace(/\bthat'?s why\b/gi, "here's what's happening with")
      // generic standalone "why" → "what's behind"
      .replace(/\bwhy\b/gi, "what's behind");
    return (
      `rewrite without "why". Suggested rewrite: \`${rewritten}\`. ` +
      'Or pick another replacement from the system prompt — ' +
      '"the reason", "what\'s causing this", "here\'s what\'s happening", ' +
      '"what\'s driving this", "what\'s actually going on".'
    );
  }
  if (v.rule === "no_other_member_identity") {
    return [
      `this names a different member. Use ONLY the presenter named in the`,
      `"## PRESENTER IDENTITY" block — replace this name and remove any`,
      `years-in-business, transaction counts, or families-helped figures`,
      `attached to it. Never carry over a name or credential from the`,
      `prompt's style examples.`,
    ].join(" ");
  }
  if (v.rule === "unfilled_credibility_placeholder") {
    return [
      `this presenter hasn't set credibility numbers yet. Remove the`,
      `placeholder AND the credibility sentence entirely — open without`,
      `credentials (the ARC opening forbids front-loaded credibility`,
      `anyway). Do NOT invent numbers or borrow anyone else's.`,
    ].join(" ");
  }
  if (v.rule === "no_avatar_pander") {
    return (
      "remove the avatar-segment phrase and rewrite the sentence to speak " +
      "to the viewer as a peer, not as a targeted segment. Example: " +
      '*"for people like you, this matters"* → *"this matters — and here\'s the moment we\'re all in."*'
    );
  }
  if (v.rule === "min_dialogue_length") {
    // Wave 8 Fix 2 — body fell below the word floor. With a profile, force
    // expansion using real profile content. LEAN GROUNDED MODE: with NO profile
    // there is no colour to invent, so do NOT push toward 2,200 or fabricate —
    // but the lean floor is 1,600 (PART D: scripts run a full 10-12 min), so
    // reach it through grounded DEPTH (segment, compare, interpret), not padding.
    if (!hasProfile) {
      return [
        "the body is too thin. There is NO neighbourhood profile loaded, so do",
        "NOT invent demographic, build-era, income, amenity, or any unsourced",
        "colour. The script must still run a full 10-12 minutes (≥ 1,600 dialogue",
        "words): reach that length through grounded DEPTH, not padding — work",
        "EVERY cited fact and Source-of-truth metric in fully, segment by property",
        "type, compare neighbourhoods, and add data interpretation, viewer",
        "implication, and a back-half synthesis grounded ONLY in those numbers.",
        "State each point only once — add depth, never repeat the thesis.",
      ].join(" ");
    }
    return [
      "expand the body to clear 2,200 dialogue words using the FULL",
      "neighbourhood profile content already in your system prompt — add",
      "named anchors, specific data points, editorial reactions, and a",
      "back-half synthesis paragraph. DO NOT pad with filler, restated",
      "thesis, or generic framing. DO NOT invent stats — every new number",
      "must come from the Source-of-truth metrics or cited-facts block.",
    ].join(" ");
  }
  if (v.rule === "no_announced_credibility") {
    // Wave 8 Fix 3 — opening announced credibility instead of dropping it
    // sideways. Point the model back at the approved-list patterns.
    return [
      "rewrite the Revelation beat so credibility lands SIDEWAYS, woven",
      "into the explanation. Replace this sentence with exactly one of the",
      "approved sideways drops:",
      '"Our team helps a family move every [X] hours" (ONLY the real number',
      "from MarketConfig.teamCredentials; if none is on file do NOT state any",
      'frequency — not even a vague "every few days" — pick a different drop',
      'or use "after years of running this analysis for families…"),',
      '"Weekly since June 2020, every video, every Monday, no skips",',
      '"What I\'ve learned in helping thousands of families through this',
      'market is...", or "After helping [X] families move through this',
      'exact pattern, here\'s what I know...". Never the first sentence,',
      "never a self-introduction, never paired with a name.",
    ].join(" ");
  }
  if (v.rule === "people_like_us_in_lm") {
    // Wave 8 Fix 4 — high-impact identity phrase inside an LM window.
    return [
      'move "people like us" out of the lead-magnet placement entirely.',
      "It's a high-impact identity move that loses power when used inside",
      "conversion pitches. Either (a) relocate it to a content beat (data",
      "peak, clarity moment) at least 100 characters away from any",
      "`[LEAD MAGNET …]` tag, or (b) remove it from the script. Use it",
      "AT MOST once per script, never inside or adjacent to an LM tag.",
    ].join(" ");
  }
  if (v.rule === "placeholder_number") {
    // Fix 4 — malformed / filler number leaked into a quantitative claim.
    return [
      "this is a placeholder/filler number, not a real value. Replace it",
      "with the exact figure from the Source-of-truth metrics or cited-facts",
      'block (e.g. "$612,000", "49.4%", "3.2 months of inventory"), or cut',
      "the claim entirely if you can't ground it. Never ship a malformed",
      'range ("$500,000-to-the 600K"), a zero-filled stand-in ("the 0K',
      'range"), filler like "a meaningful amount", or a dangling value verb',
      'with no number ("average sitting."). Do NOT invent a replacement.',
    ].join(" ");
  }
  if (v.rule === "recap_close") {
    // Fix 3 — close is a recap or a sales pitch instead of a forward hook.
    return [
      "the close must be a counter-intuitive FORWARD/BINGE hook to the next",
      "video (a Stakes pattern — what's at risk if they don't watch it), NOT",
      "a backward recap and NOT a closing sales pitch. Remove this recap/",
      'push-CTA language ("to recap", "the takeaway is", "book a call",',
      '"make an offer", "this is the one", "pull the trigger") and rewrite',
      "the ending as a forward hook. The only lead-magnet reference in the",
      "close is the half-sentence LM 3/3 riding that hook.",
    ].join(" ");
  }
  if (v.rule === "fabricated_credibility_stat") {
    // Fix 1 — Expertise Bridge invented a cadence not on the profile.
    return [
      "this credibility cadence isn't on the member's credentials profile —",
      "you invented it. Use ONLY the real number from the profile. If no",
      "cadence is on file, do NOT state any frequency — not even a vague",
      '"every few days" / "every couple of days" (that is still a guessed',
      'cadence). Drop the cadence and use a non-frequency experience bridge',
      '("after years of running this analysis for families across the city..."),',
      "or pick a different approved sideways drop. Never invent a precise OR",
      "vague cadence, deal count, or year span to sound authoritative.",
    ].join(" ");
  }
  if (v.rule === "stressor_acknowledgement") {
    // PART 1 — the body never acknowledged the Active Avatar Stressor's worry.
    // The violation message already names the stressor + its quoted question;
    // surface it verbatim so the retry is a targeted insert, not a rewrite.
    return [
      v.message,
      "Add this as ONE genuine beat in the BODY's psychology layer only —",
      "not the title, thumbnail, hook, or two-beat intro. Keep everything else",
      "in the draft (structure, voice, citations, visual tags) unchanged.",
    ].join(" ");
  }
  if (
    v.rule === "connection_language_dosage" ||
    v.rule === "values_peppering_dosage" ||
    v.rule === "editorial_signature_dosage" ||
    v.rule === "connection_clustering" ||
    v.rule === "aggrieved_editorial"
  ) {
    // Empathy + connection-language dosage. The message already states the
    // exact count vs. floor and what to add; surface it verbatim and frame
    // the fix as targeted weaving, NOT a rewrite or quota-filler dump.
    return [
      v.message,
      "Weave the missing beats naturally into the BODY's existing data and",
      "psychology layers across the WHOLE script — never as a stacked block,",
      "boilerplate, or quota-filler. Keep structure, citations, numbers, and",
      "visual tags unchanged.",
    ].join(" ");
  }
  return v.message;
}

/**
 * Retry prompt. Sent when validateScript() returns error-severity
 * violations and we have retries left. Names each violation precisely
 * (rule, message, snippet, line) so Claude can do a targeted fix rather
 * than a wholesale rewrite.
 */
function buildRetryUserMessage(args: {
  plan: PlanContext;
  previousDraft: string;
  violations: ScriptViolation[];
  /**
   * Wave 5 — dialogue word count of the previous draft. When the prior
   * draft fell short of the 2500-word target, the retry message asks
   * the model to expand using real neighbourhood context (NOT fabricated
   * stats) while it fixes the flagged violations.
   */
  previousDialogueWordCount?: number | null;
  /**
   * Whether a KB neighbourhood profile is loaded for this script. When
   * false (LEAN GROUNDED MODE), the retry message must NOT ask the model
   * to "expand using profile content" — there's none — or it loops straight
   * back into inventing colour. A lean grounded draft is legitimately shorter.
   */
  hasProfile?: boolean;
}): string {
  const {
    plan,
    previousDraft,
    violations,
    previousDialogueWordCount,
    hasProfile = true,
  } = args;
  const lines: string[] = [];

  // Wave 5 — distinguish data-integrity violations (the gate that just
  // got promoted to ERROR) from the other locked rules so the model
  // gets a clear "stop fabricating" signal up front instead of buried
  // inside the per-line fix list.
  const statViolations = violations.filter(
    (v) => v.rule === "unanchored_stat" || v.rule === "no_misattributed_stats",
  );
  // Only nudge length expansion when a profile exists to expand INTO. With no
  // profile the floor is the lean floor and shorter is correct, so suppress.
  const shortOfTarget =
    hasProfile &&
    typeof previousDialogueWordCount === "number" &&
    previousDialogueWordCount < 2500;

  lines.push(
    `Your previous draft failed ${violations.length} server-side content-rule check(s). The rest of the prior script was good — keep its structure, voice, citations, and visual tags. ONLY fix the specific lines named below.`,
  );

  if (statViolations.length > 0) {
    lines.push("");
    lines.push("## DATA INTEGRITY GATE — unsourced or misattributed stats");
    lines.push("");
    lines.push(
      `Your previous draft contained ${statViolations.length} unsourced or misattributed stat(s) that triggered the data integrity gate. These are HARD FAILS — the channel's edge is precision, not vibes. Regenerate the FULL script. Replace each flagged stat with either:`,
    );
    lines.push("");
    lines.push(
      "(a) the real value from `## Source-of-truth metrics` or the cited facts block, OR",
    );
    lines.push(
      '(b) directional language ("most listings", "meaningfully above the citywide average", "more sellers walk away than complete the sale") if no real value applies, OR',
    );
    lines.push(
      "(c) remove the claim entirely if it was load-bearing only for narrative.",
    );
    lines.push("");
    lines.push(
      "DO NOT invent a replacement number. DO NOT swap one fabricated threshold for another (e.g. \"above 50%\" → \"above 40%\"). Use real values or directional language.",
    );
    if (shortOfTarget) {
      lines.push("");
      lines.push(
        `Your previous draft was ${previousDialogueWordCount} dialogue words — short of the 2500-word target. Expand by adding REAL neighbourhood context from the FULL profiles in your system message (demographics, housing stock, lifestyle, recent developments). DO NOT introduce new fabricated stats to hit the word count.`,
      );
    }
  } else if (shortOfTarget) {
    lines.push("");
    lines.push(
      `Note: previous draft was ${previousDialogueWordCount} dialogue words — short of the 2500-word target. While you fix the flagged lines, also expand the neighbourhood sections using real profile content (demographics, housing stock, lifestyle, recent developments). No fabricated stats.`,
    );
  }

  // Wave 5 follow-up — hard-stop guidance for the two rules Claude
  // keeps tripping across retries (no_why, no_abbrev_in_dialogue).
  // Counting per-rule occurrences makes the message concrete instead of
  // generic, so the model can see how many fixes it still has to do.
  const whyCount = violations.filter((v) => v.rule === "no_why").length;
  if (whyCount > 0) {
    lines.push("");
    lines.push("**no_why violations — HARD STOP.**");
    lines.push("");
    lines.push(
      `Your previous draft used the word "why" ${whyCount} time(s) in dialogue. This is a HARD FAIL on this channel. Every instance of "why" must be rewritten using one of:`,
    );
    lines.push("- \"the reason\"");
    lines.push("- \"what's causing this\"");
    lines.push("- \"what's behind this\"");
    lines.push("- \"here's what's happening\"");
    lines.push("- \"the mechanism\"");
    lines.push("- \"what's driving this\"");
    lines.push("- \"what's actually going on\"");
    lines.push("");
    lines.push(
      'DO NOT use "why" anywhere in spoken dialogue, not even as a transition or rhetorical question. Titles can use "why" freely; only the body is checked.',
    );
  }

  const abbrevHits = violations.filter(
    (v) => v.rule === "no_abbrev_in_dialogue",
  );
  if (abbrevHits.length > 0) {
    // Extract the offending abbreviations from messages so the model
    // gets back the exact strings it used. Messages look like:
    //   Found banned dialogue abbreviation "MOI". …
    const offenders = Array.from(
      new Set(
        abbrevHits
          .map((v) => v.message.match(/abbreviation "([^"]+)"/)?.[1])
          .filter((s): s is string => Boolean(s)),
      ),
    );
    const list = offenders.length > 0 ? offenders.join(", ") : "MOI / DOM / SP/LP";
    lines.push("");
    lines.push("**no_abbrev_in_dialogue violations — HARD STOP.**");
    lines.push("");
    lines.push(
      `Your previous draft used ${list} in spoken dialogue. Abbreviations MOI, DOM, PSF, SP/LP, SP-LP must be spelled out fully in dialogue (months of inventory, days on market, price per square foot, sales-to-list-price ratio).`,
    );
    lines.push("");
    lines.push(
      "Abbreviations remain allowed ONLY inside [VISUAL: ...] tags and on-screen overlays.",
    );
  }
  lines.push("");
  lines.push("## PRIOR ATTEMPT VIOLATIONS — fix THESE specific lines");
  lines.push("");
  for (const v of violations) {
    const loc = v.line ? `Line ${v.line}` : "Unlocated line";
    const snip = v.snippet
      ? v.snippet.replace(/`/g, "'")
      : "(snippet unavailable)";
    lines.push(`### ${loc} — [${v.rule}]`);
    lines.push("");
    lines.push(`Offending text: \`${snip}\``);
    lines.push("");
    const fix = suggestRetryFix(v, hasProfile);
    lines.push(`Fix: ${fix}`);
    lines.push("");
  }
  lines.push(
    "Re-generate the script with these specific fixes applied. Do not rewrite sections that weren't flagged. Re-emit the FULL script (the streaming pipeline needs the whole thing), but the only substantive edits should be on the lines above.",
  );
  lines.push("");
  lines.push("## Title promise to preserve");
  lines.push("");
  lines.push(`> ${plan.titlePromise}`);
  lines.push("");
  lines.push("## Your previous draft (for reference)");
  lines.push("");
  lines.push("```");
  lines.push(previousDraft);
  lines.push("```");
  lines.push("");
  lines.push(
    "Re-emit the corrected FULL script. Begin with `# Title: <title>` as before.",
  );

  return lines.join("\n");
}

/**
 * Wave 5 follow-up (hardened) — extract NARRATIVE text from the
 * primary-avatar payload for the stat validator's profile-sourced
 * whitelist. We deliberately avoid `JSON.stringify(avatar)` because
 * the avatar object carries IDs, UUIDs, timestamps, version markers,
 * and other numeric metadata that would over-broaden the whitelist
 * and let fabricated stats slip through.
 *
 * Two layers of filtering:
 *   1. KEY-based: when walking the profile object, skip any field
 *      whose key looks like metadata (id / uuid / *At timestamp /
 *      version / source / hash / etc.).
 *   2. VALUE-based: skip leaf strings that look like a UUID, ISO
 *      timestamp, or pure long-digit identifier — these are the
 *      shapes that carry incidental digits with no narrative value.
 *
 * Only `summary` (string) plus the surviving string leaves of
 * `profile` (recursive) reach the validator.
 */
const AVATAR_METADATA_KEY_RE =
  /^(?:id|_?id|uuid|hash|version|source|snappedAt|createdAt|updatedAt|.*At|.*Id|.*Uuid)$/i;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const PURE_LONG_DIGIT_RE = /^\d{6,}$/;

function looksLikeMetadataValue(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return true;
  if (UUID_RE.test(trimmed)) return true;
  if (ISO_TIMESTAMP_RE.test(trimmed)) return true;
  if (PURE_LONG_DIGIT_RE.test(trimmed)) return true;
  return false;
}

function extractAvatarNarrativeText(avatar: unknown): string[] {
  const out: string[] = [];
  if (!avatar || typeof avatar !== "object") {
    if (typeof avatar === "string") out.push(avatar);
    return out;
  }
  const a = avatar as Record<string, unknown>;
  if (typeof a.summary === "string" && !looksLikeMetadataValue(a.summary)) {
    out.push(a.summary);
  }
  const profile = a.profile;
  if (profile && typeof profile === "object") {
    const walk = (node: unknown) => {
      if (typeof node === "string") {
        if (!looksLikeMetadataValue(node)) out.push(node);
      } else if (Array.isArray(node)) {
        for (const x of node) walk(x);
      } else if (node && typeof node === "object") {
        for (const [key, v] of Object.entries(
          node as Record<string, unknown>,
        )) {
          if (AVATAR_METADATA_KEY_RE.test(key)) continue;
          walk(v);
        }
      }
    };
    walk(profile);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// LLM streamer abstraction (injectable; default wraps Anthropic SDK)
// ───────────────────────────────────────────────────────────────────────

/**
 * Normalized stream event. The default Anthropic adapter maps the SDK's
 * `message_start` / `message_delta` / `content_block_delta(text_delta)`
 * events onto this shape so `buildScript` stays SDK-agnostic and testable.
 */
export interface ScriptLlmStreamEvent {
  type: "message_start" | "message_delta" | "text_delta";
  /** Prompt tokens (carried on `message_start`). */
  inputTokens?: number;
  /** Cumulative completion tokens (carried on start/delta). */
  outputTokens?: number;
  /** Incremental text chunk (carried on `text_delta`). */
  text?: string;
}

export interface ScriptLlmStreamRequest {
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
  signal?: AbortSignal;
  timeoutMs: number;
}

export interface ScriptLlmStreamer {
  stream(req: ScriptLlmStreamRequest): AsyncIterable<ScriptLlmStreamEvent>;
}

/**
 * Default streamer — wraps `anthropic.messages.stream` and re-applies the
 * `cache_control: ephemeral` marker on the (large, static) system prompt so
 * prompt caching is preserved exactly as the route had it. The client is
 * lazily constructed so importing this module (e.g. from a unit test that
 * injects its own streamer) never requires `ANTHROPIC_API_KEY`.
 */
export function createAnthropicStreamer(): ScriptLlmStreamer {
  let client: Anthropic | null = null;
  return {
    async *stream(req) {
      if (!client) {
        client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      }
      const sdkStream = client.messages.stream(
        {
          model: SONNET_MODEL,
          max_tokens: req.maxTokens,
          system: [
            {
              type: "text",
              text: req.systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: req.userMessage }],
        },
        { signal: req.signal, timeout: req.timeoutMs },
      );
      for await (const event of sdkStream) {
        if (event.type === "message_start") {
          const usage = (event.message?.usage ?? {}) as {
            input_tokens?: number;
            output_tokens?: number;
          };
          yield {
            type: "message_start",
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
          };
        } else if (event.type === "message_delta") {
          const usage = (event.usage ?? {}) as { output_tokens?: number };
          yield { type: "message_delta", outputTokens: usage.output_tokens };
        } else if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "text_delta", text: event.delta.text };
        }
      }
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// buildScript — the extractable core
// ───────────────────────────────────────────────────────────────────────

export interface BuildScriptCallbacks {
  /** Phase transitions (route maps to an SSE `phase` frame). */
  onPhase?: (key: string, label: string) => void;
  /** Streamed text chunk (route maps to an SSE `token` frame). */
  onToken?: (text: string) => void;
  /** A failed attempt that will be retried (route maps to an SSE frame). */
  onViolation?: (info: {
    attempt: number;
    violations: ScriptViolation[];
    willRetry: boolean;
  }) => void;
}

export interface BuildScriptParams {
  planContext: PlanContext;
  citedFacts: CitedFact[];
  /**
   * Research Reader — EXTERNAL sources the member attached in chat. Optional;
   * absent/empty on every non-research path (the market-update flow is
   * unchanged). When present, the writer may cite their thesis/claims/stats as
   * clearly-attributed outside research, and the grounding validator treats
   * their numbers as legal anchors so a research figure doesn't read as
   * fabricated — but a research number spoken as the member's OWN market figure
   * is a hard fail (see `research_stat_as_member`).
   */
  citedResearch?: CitedResearch[];
  marketConfig: MarketConfigSummary;
  neighbourhoodContext: Record<string, string>;
  sourceOfTruthMetrics: SourceOfTruthMetric[];
  propertyTypeByHood: Record<string, string>;
  shootType: "talking_head" | "home_tour";
  assignedCampaign: AssignedCampaign | null;
  assignedBingeVideo: AssignedBingeVideo | null;
  regenerationBrief: RegenerationBrief | null;
  memberFullName: string | null;
  /**
   * CP#2 — the active Avatar Stressor (name + the avatar's coreStress worry) the
   * idea was generated under. When present, the writer weaves 1–2 body-only
   * acknowledgements of it (psychology layer). Optional so non-route callers
   * (Jarvis, evals, tests) compile; absent/null → no acknowledgement.
   */
  activeStressor?: { name: string; coreStress: string } | null;
  forbiddenIdentities: string[];
  bingeTargetConfigured: boolean;
  bingeTargetTitle: string | null;

  // Execution controls (all optional; sensible defaults).
  signal?: AbortSignal;
  callbacks?: BuildScriptCallbacks;
  /** Injected LLM. Defaults to the Anthropic-backed streamer. */
  llm?: ScriptLlmStreamer;
  /** Clock injection for deterministic budget tests. Defaults to Date.now. */
  now?: () => number;
  maxReprompts?: number;
  maxOutputTokens?: number;
  generationBudgetMs?: number;
  attemptTimeReserveMs?: number;
  perAttemptTimeoutMs?: number;
}

export interface BuildScriptResult {
  /** true → validation passed; route emits `complete`. */
  ok: boolean;
  /** Best/final draft text (populated whenever any generation occurred). */
  script: string;
  /** 0-indexed attempt that produced `script`. */
  attempt: number;
  /** Warning-severity violations on success (informational). */
  warnings: ScriptViolation[];
  /** Remaining error-severity violations on failure ([] on success). */
  violations: ScriptViolation[];
  metrics: ScriptValidationResult["metrics"] | null;
  inputTokens: number;
  outputTokens: number;
  /** Client disconnected / aborted — route bills quietly, emits nothing. */
  aborted: boolean;
  /** Terminal error (anthropic / validator_max_retries); null on ok/abort. */
  error: ScriptError | null;
  /** Extra fields the route merges into its SSE `error` frame. */
  errorExtra?: Record<string, unknown>;
  /**
   * STEP 3 graceful degrade. `true` when retries/budget were exhausted but the
   * cleanest attempt was still grounded (non-empty + anchored), so instead of a
   * hard-fail we ship that draft with its remaining issues FLAGGED. `ok` is
   * `true` in this case (route emits `complete`, not `error`), and `flagged`
   * carries the residual error-severity violations as advisory notes the member
   * can review before publishing. Hard-fail is reserved for a draft that grounds
   * nothing (genuine no-validated-facts).
   */
  degraded?: boolean;
  /** Residual error-severity violations on a degraded ship (advisory only). */
  flagged?: ScriptViolation[];
}

/** Cited-fact value strings are the validator's member-attributable anchors. */
function citedFactAnchors(facts: CitedFact[]): { raw: string }[] {
  return facts.map((f) => ({ raw: f.metricValueString }));
}

/** Profile prose the stat validator treats as additional legal anchors. */
function profileAnchors(
  neighbourhoodContext: Record<string, string>,
  marketConfig: MarketConfigSummary,
): string[] {
  return [
    ...Object.values(neighbourhoodContext ?? {}),
    ...extractAvatarNarrativeText(marketConfig.primaryAvatar),
  ];
}

export async function buildScript(
  params: BuildScriptParams,
): Promise<BuildScriptResult> {
  const {
    planContext,
    citedFacts,
    marketConfig,
    neighbourhoodContext,
    sourceOfTruthMetrics,
    propertyTypeByHood,
    shootType,
    assignedCampaign,
    assignedBingeVideo,
    regenerationBrief,
    memberFullName,
    activeStressor,
    forbiddenIdentities,
    bingeTargetConfigured,
    bingeTargetTitle,
  } = params;
  const citedResearch = params.citedResearch ?? [];

  const signal = params.signal;
  const llm = params.llm ?? createAnthropicStreamer();
  const nowFn = params.now ?? (() => Date.now());
  const maxReprompts = params.maxReprompts ?? MAX_REPROMPTS;
  const maxOutputTokens = params.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const generationBudgetMs = params.generationBudgetMs ?? GENERATION_BUDGET_MS;
  const attemptTimeReserveMs =
    params.attemptTimeReserveMs ?? ATTEMPT_TIME_RESERVE_MS;
  const perAttemptTimeoutMs =
    params.perAttemptTimeoutMs ?? PER_ATTEMPT_TIMEOUT_MS;

  const onPhase = (key: string, label: string) =>
    params.callbacks?.onPhase?.(key, label);
  const onToken = (text: string) => params.callbacks?.onToken?.(text);
  const onViolation = (info: {
    attempt: number;
    violations: ScriptViolation[];
    willRetry: boolean;
  }) => params.callbacks?.onViolation?.(info);

  const t0 = nowFn();
  const ms = () => nowFn() - t0;
  const isAborted = () => signal?.aborted ?? false;

  const anchors = citedFactAnchors(citedFacts);
  // Research Reader — the EXTERNAL sources' stat strings. Folded into the
  // grounding-anchor prose (profileText) so a legitimately-cited research number
  // doesn't read as a fabrication, but kept OUT of `anchors`/`citedFacts` (the
  // member-attributable set) so a research figure can NEVER pass the
  // member-market gates. The dedicated `research_stat_as_member` validator then
  // catches a research number spoken AS the member's own market figure.
  const researchStats = citedResearch.flatMap((r) => r.stats);
  const profileText = [
    ...profileAnchors(neighbourhoodContext, marketConfig),
    // Research thesis/claims/stats are legal anchor PROSE (so the qualitative
    // and stat grounding rules accept a cited-external number/claim) but are
    // never member-market anchors.
    ...citedResearch.flatMap((r) => [r.thesis, ...r.claims, ...r.stats]),
  ];
  const credentialsText = credentialsAnchorText(marketConfig);
  // Whether a KB neighbourhood profile is loaded for this script. Drives both
  // the lean word floor (validator) and the LEAN GROUNDED MODE steering so a
  // no-profile member (e.g. one who hasn't populated their KB) ships a lean,
  // fully-data-grounded draft instead of being pushed to invent colour.
  const hasProfile = Object.keys(neighbourhoodContext).length > 0;
  // Market updates use the lean 1,600-word floor even with a profile loaded
  // (see buildUserMessage). useLeanFloor drives both the validator floor signal
  // and the retry-prompt expansion guidance.
  const isMarketUpdate = planContext.rotationSlot === "market_update";
  const useLeanFloor = isMarketUpdate || !hasProfile;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  onPhase("load", "Loading your facts and neighbourhood context...");

  let finalScript: string | null = null;
  let finalValidation: ScriptValidationResult | null = null;
  let finalAttempt = 0;

  let lastDraft = "";
  let lastErrors: ScriptViolation[] = [];
  let lastDraftMetrics: ScriptValidationResult["metrics"] | null = null;

  // STEP 3 graceful degrade — track the CLEANEST attempt seen (fewest
  // error-severity violations). On budget/retry exhaustion we ship this rather
  // than hard-failing, so a member always gets a usable draft to review.
  let bestDraft = "";
  let bestErrors: ScriptViolation[] = [];
  let bestMetrics: ScriptValidationResult["metrics"] | null = null;
  let bestErrorCount = Number.POSITIVE_INFINITY;

  /**
   * Build the terminal result when retries/budget are exhausted. If the
   * cleanest attempt is non-empty AND grounded (anchored at least one detail),
   * ship it DEGRADED (ok: true) with the residual issues flagged. Otherwise the
   * draft grounds nothing (genuine no-validated-facts) → hard-fail.
   */
  const finishExhausted = (
    attempt: number,
    reason: "budget" | "max_retries",
  ): BuildScriptResult => {
    const grounded =
      bestDraft.trim().length > 0 && (bestMetrics?.anchoredDetailCount ?? 0) > 0;
    if (grounded) {
      console.log(
        `[sb-v2] graceful degrade (${reason}): shipping cleanest attempt with ${bestErrors.length} flagged issue(s)`,
      );
      return {
        ok: true,
        degraded: true,
        script: bestDraft,
        attempt,
        warnings: [],
        flagged: bestErrors,
        violations: [],
        metrics: bestMetrics,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        aborted: false,
        error: null,
      };
    }
    const message =
      reason === "budget"
        ? `We couldn't finish a clean script in the time available. ${bestErrors.length} content-rule issue(s) remained — link more facts or adjust your script mode and try again.`
        : `We couldn't write a script that passes your content rules after ${maxReprompts + 1} attempts. ${bestErrors.length} content-rule issue(s) remained — link more facts or adjust your script mode and try again.`;
    return {
      ok: false,
      script: bestDraft || lastDraft,
      attempt,
      warnings: [],
      violations: bestErrors.length ? bestErrors : lastErrors,
      metrics: bestMetrics ?? lastDraftMetrics,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      aborted: false,
      error: makeScriptError("validator_max_retries", message, {
        violations: bestErrors.length ? bestErrors : lastErrors,
      }),
      errorExtra: { attempt, draft: bestDraft || lastDraft },
    };
  };

  for (let attempt = 0; attempt <= maxReprompts; attempt++) {
    if (isAborted()) break;

    // Budget guard — never START a retry we can't finish inside the wall.
    // STEP 3: ship the cleanest grounded attempt flagged instead of hard-fail.
    if (attempt > 0 && ms() + attemptTimeReserveMs > generationBudgetMs) {
      return finishExhausted(attempt, "budget");
    }

    if (attempt === 0) {
      onPhase("intro", "Drafting the 2-beat intro...");
    } else {
      onPhase(
        "reprompt",
        `Re-prompting to fix ${lastErrors.length} content-rule violation(s) (attempt ${attempt + 1}/${maxReprompts + 1})...`,
      );
    }

    const userMessage =
      attempt === 0
        ? buildInitialUserMessage({
            plan: planContext,
            facts: citedFacts,
            citedResearch,
            marketConfig,
            memberFullName,
            activeStressor: activeStressor ?? null,
            neighbourhoodContext,
            sourceOfTruthMetrics,
            propertyTypeByHood,
            shootType,
            assignedCampaign,
            assignedBingeVideo,
            regenerationBrief,
          })
        : buildRetryUserMessage({
            plan: planContext,
            previousDraft: lastDraft,
            violations: lastErrors,
            previousDialogueWordCount:
              lastDraftMetrics?.dialogueWordCount ?? null,
            hasProfile: !useLeanFloor,
          });

    // Mid-stream phase hints, fired on timers like the route did.
    const midStreamTimers: ReturnType<typeof setTimeout>[] = [];
    midStreamTimers.push(
      setTimeout(
        () =>
          onPhase("body", "Building the data → psychology → clarity body..."),
        12000,
      ),
    );
    midStreamTimers.push(
      setTimeout(() => onPhase("hook", "Writing the next-video hook..."), 30000),
    );
    const clearTimers = () => {
      for (const t of midStreamTimers) clearTimeout(t);
    };

    let draft = "";
    let attemptInputTokens = 0;
    let attemptOutputTokens = 0;

    try {
      const attemptTimeoutMs = Math.min(
        perAttemptTimeoutMs,
        Math.max(0, generationBudgetMs - ms()),
      );
      const sdkStream = llm.stream({
        systemPrompt: SCRIPT_BUILDER_MODE_PROMPT,
        userMessage,
        maxTokens: maxOutputTokens,
        signal,
        timeoutMs: attemptTimeoutMs,
      });
      for await (const event of sdkStream) {
        if (isAborted()) break;
        if (event.type === "message_start") {
          if (typeof event.inputTokens === "number") {
            attemptInputTokens = event.inputTokens;
          }
          if (typeof event.outputTokens === "number") {
            attemptOutputTokens = event.outputTokens;
          }
        } else if (event.type === "message_delta") {
          if (typeof event.outputTokens === "number") {
            attemptOutputTokens = event.outputTokens;
          }
        } else if (event.type === "text_delta" && typeof event.text === "string") {
          draft += event.text;
          onToken(event.text);
        }
      }
    } catch (err) {
      clearTimers();
      totalInputTokens += attemptInputTokens;
      totalOutputTokens += attemptOutputTokens;
      if (isAborted() || (err as { name?: string })?.name === "AbortError") {
        return {
          ok: false,
          script: lastDraft,
          attempt,
          warnings: [],
          violations: lastErrors,
          metrics: lastDraftMetrics,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          aborted: true,
          error: null,
        };
      }
      const scriptError = classifyAnthropicError(err);
      return {
        ok: false,
        script: draft,
        attempt,
        warnings: [],
        violations: lastErrors,
        metrics: lastDraftMetrics,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        aborted: false,
        error: scriptError,
        errorExtra: { attempt },
      };
    }

    clearTimers();
    totalInputTokens += attemptInputTokens;
    totalOutputTokens += attemptOutputTokens;

    if (isAborted()) {
      return {
        ok: false,
        script: draft,
        attempt,
        warnings: [],
        violations: lastErrors,
        metrics: lastDraftMetrics,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        aborted: true,
        error: null,
      };
    }

    // Deterministic clean-ups before validation (mirrors the route order).
    draft = autoFixMechanicalRules(draft);
    const soften = autoSoftenUnanchoredStats(
      draft,
      sourceOfTruthMetrics,
      anchors,
      profileText,
    );
    draft = soften.script;
    if (soften.softenedCount > 0) {
      console.log(
        `[sb-v2:auto-soften] softened ${soften.softenedCount} unanchored stat(s): ${soften.softenedTokens.join(", ")}`,
      );
    }
    const bingeSoften = autoSoftenFabricatedBinge(draft, {
      bingeTargetConfigured,
    });
    draft = bingeSoften.script;
    if (bingeSoften.softenedCount > 0) {
      console.log(
        `[sb-v2:auto-soften] removed ${bingeSoften.softenedCount} fabricated next-video tease(s): ${bingeSoften.removed.join(" | ")}`,
      );
    }

    onPhase("validate", "Validating content rules...");
    const validation = validateScript(draft, {
      neighbourhoods: marketConfig.neighbourhoods,
      currentMemberName: memberFullName ?? undefined,
      forbiddenIdentities,
      sourceOfTruth: sourceOfTruthMetrics,
      citedFacts: anchors,
      profileText,
      researchStats,
      credentialsText,
      bingeTargetConfigured,
      bingeTargetTitle: bingeTargetTitle ?? undefined,
      leadMagnetConfigured: assignedCampaign !== null,
      leadMagnetName: assignedCampaign?.name,
      // PART 1 — enforce the Active Avatar Stressor acknowledgement at
      // generation. INERT when null (member hasn't built the stressor).
      activeStressor: activeStressor ?? null,
      // Empathy + connection-language dosage — enforced at GENERATION only so
      // a direct save or hand-edited script is never hard-failed for it.
      enforceConnectionDosage: true,
      // Market updates pass the lean (1,600) floor explicitly so a data-rich
      // 1,600+ word draft is never flagged degraded just because a profile loaded.
      hasNeighbourhoodProfile: useLeanFloor ? false : undefined,
    });

    if (validation.ok) {
      finalScript = draft;
      finalValidation = validation;
      finalAttempt = attempt;
      break;
    }

    lastDraft = draft;
    lastDraftMetrics = validation.metrics;
    lastErrors = validation.violations.filter((v) => v.severity === "error");

    // STEP 3: remember the cleanest grounded attempt so budget/retry
    // exhaustion can ship it flagged instead of hard-failing. Tie-break keeps
    // the earliest (fewest-error) draft.
    if (lastErrors.length < bestErrorCount) {
      bestErrorCount = lastErrors.length;
      bestDraft = draft;
      bestErrors = lastErrors;
      bestMetrics = validation.metrics;
    }

    if (attempt === maxReprompts) {
      return finishExhausted(attempt, "max_retries");
    }

    onViolation({ attempt, violations: lastErrors, willRetry: true });
  }

  if (finalScript !== null && finalValidation !== null && !isAborted()) {
    return {
      ok: true,
      script: finalScript,
      attempt: finalAttempt,
      warnings: finalValidation.violations.filter(
        (v) => v.severity === "warning",
      ),
      violations: [],
      metrics: finalValidation.metrics,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      aborted: false,
      error: null,
    };
  }

  // Fell out of the loop without a clean script → client aborted.
  return {
    ok: false,
    script: lastDraft,
    attempt: finalAttempt,
    warnings: [],
    violations: lastErrors,
    metrics: lastDraftMetrics,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    aborted: true,
    error: null,
  };
}
