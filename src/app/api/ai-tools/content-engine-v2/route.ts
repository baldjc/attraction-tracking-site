/**
 * POST /api/ai-tools/content-engine-v2
 *
 * Wave 2 — Content Engine v2 idea generation. Returns a JSON batch of 5
 * idea cards anchored on the member's validated facts library, with
 * optional Story Lead or validated-idea context.
 *
 * Cost budget: ≤ $0.25 per batch (Sonnet, full Content Engine Mode prompt
 * cached, dynamic context kept compact).
 *
 * Server-side validation gate (`content-engine-validation.ts`) runs on
 * every card before we return — failures trigger a re-prompt loop (max 2
 * retries) where Claude is told exactly which cards failed and why.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getCostCapStatus, isHardCapExempt, logUsage } from "@/lib/ai-tool-cost";
import {
  loadLatestValidatedUpload,
  loadHeadlineSafeFacts,
  loadMarketConfigSummary,
  loadStoryLead,
  type CompactFact,
  type StoryLeadDetail,
} from "@/lib/content-engine-context";
import {
  ROTATION_SLOTS,
  type RotationSlotKey,
} from "@/lib/content-engine-validation";
import {
  parsePropertyTypeFocus,
  type PropertyTypeFocus,
} from "@/lib/property-type-focus";
import {
  runIdeaGenerationLoop,
  extractLeadNeighbourhoods,
} from "@/lib/content-engine-generate";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_IDEA_COUNT = 5;
const FACTS_LIMIT = 120;

interface RequestBody {
  rotationSlot?: RotationSlotKey;
  storyLeadId?: string;
  validatedIdea?: string;
  count?: number;
  /** Wave 4 — property-type lock from the wizard (Any|Detached|…). */
  propertyTypeFocus?: PropertyTypeFocus | string | null;
}

export async function POST(req: NextRequest) {
  // Impersonation-aware — resolve to the impersonated member so idea
  // generation reads the member's validated upload/facts and attributes
  // cost-cap usage to the member, not the admin account.
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = resolved.id;
  const userRole = resolved.role;

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_content_engine_v2) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  // Admin impersonating a member is exempt from the HARD block (tokens still
  // logged); real, non-impersonated members stay fully capped.
  const cap = await getCostCapStatus(userId);
  if (cap.hardBlocked && !isHardCapExempt(resolved)) {
    return NextResponse.json(
      {
        error: "monthly_cost_cap_reached",
        message: `You've hit your $${cap.capUsd.toFixed(2)} monthly AI budget. It resets on the 1st of next month.`,
      },
      { status: 402 },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Optional rotation slot validation — falls through to Claude's INTAKE
  // step when unspecified (the cached prompt knows how to pick a rotation
  // order for batch generation).
  if (
    body.rotationSlot &&
    !ROTATION_SLOTS.includes(body.rotationSlot)
  ) {
    return NextResponse.json(
      { error: "invalid_rotation_slot", allowed: ROTATION_SLOTS },
      { status: 400 },
    );
  }
  const count = Math.min(Math.max(body.count ?? DEFAULT_IDEA_COUNT, 1), 10);
  const propertyTypeFocus = parsePropertyTypeFocus(body.propertyTypeFocus ?? null);

  // Load the per-member context. All three are required-or-empty: no upload
  // → 409, no config → 409, no headline-safe facts → 409. Each error tells
  // the wizard exactly which prerequisite to send the member to.
  const upload = await loadLatestValidatedUpload(userId);
  if (!upload) {
    return NextResponse.json(
      {
        error: "no_validated_upload",
        message: "Upload market data first — Content Engine v2 needs a validated facts library.",
      },
      { status: 409 },
    );
  }
  const config = await loadMarketConfigSummary(userId);
  if (!config) {
    return NextResponse.json(
      {
        error: "no_market_config",
        message: "Configure your market (avatar, sub-personas, keyword kit) before generating ideas.",
      },
      { status: 409 },
    );
  }
  const allFacts = await loadHeadlineSafeFacts(upload.id, upload.monthYear, {
    limit: FACTS_LIMIT,
  });
  // Wave 4 beta — Finding 10: server-side property-type data filter.
  // When the wizard locked a non-Any focus, prune facts whose
  // propertyType is a different SPECIFIC type BEFORE the LLM call so
  // Claude can't drift into Detached numbers on a Row/Townhouse video.
  // We keep:
  //   - facts whose propertyType matches the lock (e.g. "Row/Townhouse")
  //   - city/neighbourhood rollups (propertyType === null)
  //   - "All" rollups (propertyType === "All")
  // The prompt-side HARD CONSTRAINT block (buildFocusConstraintBlock)
  // backstops this — but pre-filtering means the LLM never even sees
  // the wrong-type rows, removing a class of failure modes.
  const facts =
    propertyTypeFocus === "Any"
      ? allFacts
      : allFacts.filter(
          (f) =>
            f.propertyType === null ||
            f.propertyType === "All" ||
            f.propertyType === propertyTypeFocus,
        );
  if (facts.length < 3) {
    return NextResponse.json(
      {
        error: "no_headline_safe_facts",
        message:
          propertyTypeFocus === "Any"
            ? "Your latest upload doesn't have enough headline-safe facts (need ≥3). Re-run validation or upload a fresher month."
            : `Your latest upload doesn't have enough headline-safe facts for ${propertyTypeFocus} (need ≥3 after the property-type filter). Try a different focus or upload a fresher month.`,
      },
      { status: 409 },
    );
  }

  let storyLead: StoryLeadDetail | null = null;
  if (body.storyLeadId) {
    storyLead = await loadStoryLead(userId, body.storyLeadId);
    if (!storyLead) {
      return NextResponse.json(
        { error: "story_lead_not_found" },
        { status: 404 },
      );
    }
  }

  // Wave 4 beta — Finding 8 HARD ANCHOR. When a Story Lead is selected
  // we derive the set of fact IDs that the lead actually anchors (its
  // named neighbourhood(s), parsed out of pattern + dataThreads with
  // word-boundary matching so e.g. "Bridgeland" doesn't pull in
  // "Bridgeland-Riverside" rows and vice-versa) and trim the LLM's
  // fact pool to ONLY those facts (plus city-wide rollups whose
  // neighbourhood is empty/All). The validator (below) backstops this
  // server-side so even prompt-drift can't slip an off-scope cite past
  // the gate.
  let storyLeadFactIds: Set<string> | null = null;
  let storyLeadHoodFactIds: Set<string> | null = null;
  let factsForLlm: CompactFact[] = facts;
  if (storyLead) {
    const leadHoods = extractLeadNeighbourhoods(storyLead, config.neighbourhoods);
    if (leadHoods.length > 0) {
      const marketLower = config.marketName.toLowerCase();
      // Partition facts into:
      //   - hoodScoped: facts whose neighbourhood EXACTLY matches one of
      //     the lead-named hoods (after lowercasing) — these anchor the
      //     story.
      //   - cityRollup: city/All rows — kept as supplemental context.
      // Anything else (other hoods) is excluded entirely.
      const hoodScoped: CompactFact[] = [];
      const cityRollup: CompactFact[] = [];
      for (const f of facts) {
        const hood = (f.neighbourhood ?? "").trim().toLowerCase();
        if (!hood || hood === "all" || hood === "city" || hood === marketLower) {
          cityRollup.push(f);
        } else if (leadHoods.includes(hood)) {
          hoodScoped.push(f);
        }
      }
      // Only enforce the lock if there's at least one hood-scoped fact
      // — otherwise the validator's "cite ≥1 hood fact" rule would
      // 422-storm every batch on a thin upload for that hood. Fall
      // back to prompt-only enforcement in that edge case.
      if (hoodScoped.length >= 1 && hoodScoped.length + cityRollup.length >= 3) {
        factsForLlm = [...hoodScoped, ...cityRollup];
        storyLeadFactIds = new Set(factsForLlm.map((f) => f.id));
        storyLeadHoodFactIds = new Set(hoodScoped.map((f) => f.id));
      }
    }
  }

  const headlineSafeIds = new Set(factsForLlm.map((f) => f.id));

  // ── Generate + validate + (up to 2) re-prompts (shared engine) ──────
  const result = await runIdeaGenerationLoop({
    count,
    rotationSlot: body.rotationSlot,
    config,
    factsForLlm,
    headlineSafeIds,
    storyLead,
    storyLeadFactIds,
    storyLeadHoodFactIds,
    validatedIdea: body.validatedIdea,
    monthYear: upload.monthYear,
    propertyTypeFocus,
  });

  // Always charge for whatever was spent (initial + re-prompts), even on
  // failure — admins are exempt; members shouldn't pay nothing for a
  // partially-spent batch.
  if (result.inputTokens || result.outputTokens) {
    await logUsage(userId, "content_engine_v2", result.inputTokens, result.outputTokens);
  }

  if (!result.ok) {
    if (result.kind === "claude") {
      return NextResponse.json(
        { error: "claude_call_failed", message: "Idea generation is unavailable right now. Try again in a moment." },
        { status: 502 },
      );
    }
    if (result.kind === "parse") {
      return NextResponse.json(
        { error: "parse_failed", message: "Idea generator returned an unparseable response after retries." },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        error: "validation_gate_failed",
        message:
          "Couldn't generate ideas that pass the title rules after 2 retries. Try again with a different rotation slot or refresh your facts library.",
        perCardErrors: result.perCardErrors,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ideas: result.ideas,
    upload: { id: upload.id, monthYear: upload.monthYear, label: upload.label },
    storyLeadId: storyLead?.id ?? null,
    factsConsidered: facts.length,
    requestedCount: count,
    returnedCount: result.ideas.length,
    partial: result.partial,
  });
}
