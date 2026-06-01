/**
 * Layer-1 auto-enrichment for Script Builder v2.
 *
 * Problem: a ContentPlan minted from a Story Lead ("Use as Video") carries
 * only the facts that resolved from the lead's named neighbourhoods. Narrow
 * leads (one hood, one metric family) can land with 1–2 linked facts, which
 * trips the ≥3 "not enough linked facts" gate and dead-ends the member at the
 * Build Script step.
 *
 * Layer 1 fixes the common case WITHOUT any paid work: it pulls additional
 * headline-safe facts that are already in the SAME scope as the plan's
 * existing linked facts (same neighbourhoods, same upload, same property-type
 * lock) and links them before the gate runs. It never widens scope — it only
 * deepens coverage inside the scope the lead already established.
 *
 * When Layer 1 cannot reach the gate target, `enrichPlanWithRelatedFacts`
 * now describes the remaining gaps in `skippedNeedingPaid` (rich
 * `ScriptDataNeed`s + a USD estimate) so the Unresolved Facts banner can offer
 * the member a paid Layer-2 "Run data search" on a concrete need.
 */
import prisma from "@/lib/prisma";
import { EXCLUDE_LEGACY_FAILURE_RATE } from "@/lib/market-status-buckets";
import { loadHeadlineSafeFacts } from "@/lib/content-engine-context";
import {
  type ScriptDataNeed,
  MetricFamily,
  estimateExtractionCostUsd,
} from "@/lib/script-data-resolver";

/** The gate threshold Script Builder v2 enforces everywhere. */
export const FACT_GATE_TARGET = 3;

export type FactGateStatus = "ok" | "low" | "block";

/**
 * Count-based gate verdict shared by the streaming route, the wizard page and
 * the planner modal so they never drift:
 *   - 0 facts  → "block" (cannot anchor a script at all)
 *   - 1–2      → "low"   (allowed, but surface a non-blocking Low Support banner)
 *   - ≥ target → "ok"    (silent)
 */
export function evaluateFactGate(
  count: number,
  target: number = FACT_GATE_TARGET,
): FactGateStatus {
  if (count <= 0) return "block";
  if (count < target) return "low";
  return "ok";
}

/** Minimal fact shape the scope/ranking logic needs (DB-agnostic, testable). */
export interface EnrichInputFact {
  id: string;
  neighbourhood: string | null;
  propertyType: string | null;
  metricFamily: string;
}

/** A remaining gap the member can pay to fill, with what the search will cost. */
export interface SkippedNeed {
  need: ScriptDataNeed;
  reason: string;
  estimatedCostUsd: number;
}

export interface EnrichmentScope {
  neighbourhoods: string[];
  lockedPropertyType: string | null;
  leadSpansMultipleTypes: boolean;
  uploadIds: string[];
}

export interface EnrichmentResult {
  before: number;
  added: EnrichInputFact[];
  after: number;
  targetReached: boolean;
  scope: EnrichmentScope;
  /** Gaps Layer 1 couldn't close — the banner offers a paid search per need. */
  skippedNeedingPaid: SkippedNeed[];
  persisted: boolean;
}

const CITY_ROLLUP_HOODS = new Set(["", "all", "city"]);

function hoodKey(neighbourhood: string | null): string {
  return (neighbourhood ?? "").trim().toLowerCase();
}

/**
 * Pure scope-derivation + ranking. Exported for unit testing — it must NEVER
 * select a fact outside the scope established by the already-linked facts.
 *
 * Scope rules (in-scope candidates only):
 *   - neighbourhood (case-insensitive) must be one the linked facts already
 *     cover;
 *   - property type:
 *       · locked (plan.propertyTypeFocus set, not "All") → a non-rollup
 *         candidate's propertyType must equal the lock EXACTLY. A null/"All"
 *         (hood-level aggregate across every type) is broader than the lock and
 *         is rejected — enriching with it would widen scope;
 *       · unlocked (city-wide / dual-audience lead) → any property type is
 *         allowed, constrained only by the neighbourhood scope.
 *   `leadSpansMultipleTypes` is informational (carried into the scope report);
 *   it cannot coexist with a lock, so it does not loosen the gate.
 *
 * Ranking: breadth before depth.
 *   - Tier 1: a metric family NOT yet represented among the linked facts.
 *   - Tier 2: a metric family already represented (deeper coverage).
 * Within a tier, ties break deterministically by metricFamily then id.
 */
export function selectEnrichmentFacts(
  linked: EnrichInputFact[],
  candidates: EnrichInputFact[],
  opts: {
    target?: number;
    maxAdds?: number;
    lockedPropertyType: string | null;
    leadSpansMultipleTypes: boolean;
    marketNameLower?: string;
  },
): { added: EnrichInputFact[]; scopeHoods: string[]; rejectedOutOfScope: number } {
  const target = opts.target ?? FACT_GATE_TARGET;
  const maxAdds = opts.maxAdds ?? 8;
  const marketLower = (opts.marketNameLower ?? "").trim().toLowerCase();
  const lockedType =
    opts.lockedPropertyType && opts.lockedPropertyType !== "All"
      ? opts.lockedPropertyType
      : null;

  const scopeHoodSet = new Set<string>();
  const representedFamilies = new Set<string>();
  for (const f of linked) {
    scopeHoodSet.add(hoodKey(f.neighbourhood));
    if (f.metricFamily) representedFamilies.add(f.metricFamily);
  }

  const isCityRollup = (h: string) =>
    CITY_ROLLUP_HOODS.has(h) || (marketLower !== "" && h === marketLower);

  const linkedIds = new Set(linked.map((f) => f.id));
  const need = Math.max(0, target - linked.length);
  if (need === 0) {
    return { added: [], scopeHoods: [...scopeHoodSet], rejectedOutOfScope: 0 };
  }

  let rejectedOutOfScope = 0;
  const inScope: EnrichInputFact[] = [];
  for (const c of candidates) {
    if (linkedIds.has(c.id)) continue;
    const h = hoodKey(c.neighbourhood);
    if (!scopeHoodSet.has(h)) {
      rejectedOutOfScope++;
      continue;
    }
    // Property-type gate (only for hood-anchored, non-rollup candidates).
    // Strict: a lock means the candidate's type must match EXACTLY. null/"All"
    // is a hood-level aggregate across every type — broader than the lock — so
    // it is rejected to honour the never-widen-scope guarantee.
    if (lockedType && !isCityRollup(h)) {
      if (c.propertyType !== lockedType) {
        rejectedOutOfScope++;
        continue;
      }
    }
    inScope.push(c);
  }

  const tier1: EnrichInputFact[] = [];
  const tier2: EnrichInputFact[] = [];
  for (const c of inScope) {
    if (representedFamilies.has(c.metricFamily)) tier2.push(c);
    else tier1.push(c);
  }
  const byFamilyThenId = (a: EnrichInputFact, b: EnrichInputFact) =>
    a.metricFamily === b.metricFamily
      ? a.id.localeCompare(b.id)
      : a.metricFamily.localeCompare(b.metricFamily);
  tier1.sort(byFamilyThenId);
  tier2.sort(byFamilyThenId);

  const added: EnrichInputFact[] = [];
  const cap = Math.min(need, maxAdds);
  // Tier 1 also dedupes by family so breadth additions don't all pile onto the
  // same newly-introduced family before we've widened coverage.
  const usedFamilies = new Set(representedFamilies);
  for (const c of tier1) {
    if (added.length >= cap) break;
    if (usedFamilies.has(c.metricFamily)) continue;
    usedFamilies.add(c.metricFamily);
    added.push(c);
  }
  for (const c of tier2) {
    if (added.length >= cap) break;
    added.push(c);
  }

  return { added, scopeHoods: [...scopeHoodSet], rejectedOutOfScope };
}

// Families we'll offer a paid search for, in priority order. Count concepts
// (sold/active/new-listing) all live under INVENTORY (see script-data-resolver).
const PAID_SEARCH_FAMILY_PRIORITY: MetricFamily[] = [
  MetricFamily.MEDIAN,
  MetricFamily.DOM,
  MetricFamily.SP_LP,
  MetricFamily.MOI,
  MetricFamily.INVENTORY,
];

/**
 * Describe the gaps Layer 1 couldn't close as concrete, payable needs. Pure so
 * the wiring stays testable. Emits up to `missing` needs for families NOT yet
 * represented, anchored on the lead's own scope (first named neighbourhood, or
 * market-wide when the scope is a city rollup). `estimatedCostUsd` is a coarse
 * ceiling from total row count — the banner recomputes precisely from the
 * actually-filtered rows before charging.
 */
export function buildSkippedNeeds(args: {
  memberId: string;
  marketConfigId: string;
  representedFamilies: Set<string>;
  scopeHoods: string[];
  lockedPropertyType: string | null;
  timeWindow: { startMonth: string; endMonth: string };
  estimateRowCount: number;
  missing: number;
}): SkippedNeed[] {
  if (args.missing <= 0) return [];

  // Anchor on the first named (non-rollup) neighbourhood; null = market-wide.
  const namedHood =
    args.scopeHoods.find((h) => h && !CITY_ROLLUP_HOODS.has(h)) ?? null;

  const estimatedCostUsd = estimateExtractionCostUsd(args.estimateRowCount);
  const needs: SkippedNeed[] = [];
  for (const family of PAID_SEARCH_FAMILY_PRIORITY) {
    if (needs.length >= args.missing) break;
    if (args.representedFamilies.has(family)) continue;
    needs.push({
      need: {
        memberId: args.memberId,
        marketConfigId: args.marketConfigId,
        neighbourhood: namedHood,
        propertyType: args.lockedPropertyType,
        metricFamily: family,
        timeWindow: args.timeWindow,
      },
      reason: namedHood
        ? `No ${family} data found for ${namedHood} in scope`
        : `No ${family} data found in scope`,
      estimatedCostUsd,
    });
  }
  return needs;
}

/**
 * Load the plan's linked facts, derive their scope, and link additional
 * in-scope headline-safe facts until the gate target is reached (Layer 1).
 *
 * Safe to call on every Build-Script entry: it no-ops when the plan already
 * has ≥ target facts or has zero (nothing to derive scope from), and it never
 * removes or reorders existing links — it only appends.
 */
export async function enrichPlanWithRelatedFacts(args: {
  userId: string;
  planId: string;
  target?: number;
  maxAdds?: number;
  persist?: boolean;
}): Promise<EnrichmentResult> {
  const target = args.target ?? FACT_GATE_TARGET;
  const persist = args.persist ?? true;

  const plan = await prisma.contentPlan.findFirst({
    where: { id: args.planId, userId: args.userId },
    select: { id: true, linkedFactIds: true, propertyTypeFocus: true },
  });

  const emptyScope: EnrichmentScope = {
    neighbourhoods: [],
    lockedPropertyType: null,
    leadSpansMultipleTypes: false,
    uploadIds: [],
  };
  if (!plan) {
    return {
      before: 0,
      added: [],
      after: 0,
      targetReached: false,
      scope: emptyScope,
      skippedNeedingPaid: [],
      persisted: false,
    };
  }

  const linkedIds: string[] = Array.isArray(plan.linkedFactIds)
    ? (plan.linkedFactIds as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];

  const lockedPropertyType =
    plan.propertyTypeFocus && plan.propertyTypeFocus !== "All"
      ? plan.propertyTypeFocus
      : null;

  // Already healthy, or nothing to anchor scope on → no-op (gate decides).
  if (linkedIds.length >= target || linkedIds.length === 0) {
    return {
      before: linkedIds.length,
      added: [],
      after: linkedIds.length,
      targetReached: linkedIds.length >= target,
      scope: {
        ...emptyScope,
        lockedPropertyType,
      },
      skippedNeedingPaid: [],
      persisted: false,
    };
  }

  // Load the linked facts to derive scope (which uploads + neighbourhoods).
  const linkedFacts = await prisma.marketFact.findMany({
    where: { ...EXCLUDE_LEGACY_FAILURE_RATE, id: { in: linkedIds }, userId: args.userId },
    select: {
      id: true,
      neighbourhood: true,
      propertyType: true,
      metricFamily: true,
      uploadId: true,
    },
  });

  const uploadIds = [...new Set(linkedFacts.map((f) => f.uploadId))];
  const uploads = uploadIds.length
    ? await prisma.marketDataUpload.findMany({
        where: { id: { in: uploadIds }, userId: args.userId },
        select: { id: true, monthYear: true, rowCount: true },
      })
    : [];

  // Candidate pool: every headline-safe fact in the same upload(s).
  const candidates: EnrichInputFact[] = [];
  for (const up of uploads) {
    const facts = await loadHeadlineSafeFacts(up.id, up.monthYear, {
      limit: 500,
      orderByNeighbourhoodFirst: true,
    });
    for (const f of facts) {
      candidates.push({
        id: f.id,
        neighbourhood: f.neighbourhood,
        propertyType: f.propertyType,
        metricFamily: String(f.metricFamily),
      });
    }
  }

  const linkedInput: EnrichInputFact[] = linkedFacts.map((f) => ({
    id: f.id,
    neighbourhood: f.neighbourhood,
    propertyType: f.propertyType,
    metricFamily: String(f.metricFamily),
  }));

  // Derive "dual-audience" from the data itself rather than parsing a marker
  // string out of researchNotes (which is fragile to copy edits). With no lock,
  // ≥2 distinct named property types among the linked facts means the lead
  // genuinely spans types. Informational only — it never loosens the gate.
  const distinctNamedTypes = new Set(
    linkedInput
      .map((f) => f.propertyType)
      .filter((t): t is string => !!t && t !== "All"),
  );
  const leadSpansMultipleTypes =
    lockedPropertyType === null && distinctNamedTypes.size >= 2;

  const { added, scopeHoods } = selectEnrichmentFacts(linkedInput, candidates, {
    target,
    maxAdds: args.maxAdds,
    lockedPropertyType,
    leadSpansMultipleTypes,
  });

  const scope: EnrichmentScope = {
    neighbourhoods: scopeHoods,
    lockedPropertyType,
    leadSpansMultipleTypes,
    uploadIds,
  };

  let persisted = false;
  if (added.length > 0 && persist) {
    // De-dupe defensively: deterministic selection means a concurrent enrich
    // would compute the same additions, but a Set guarantees count-based gates
    // are never skewed by a duplicated id slipping into linkedFactIds.
    const next = [...new Set([...linkedIds, ...added.map((a) => a.id)])];
    await prisma.contentPlan.updateMany({
      where: { id: plan.id, userId: args.userId },
      data: { linkedFactIds: next },
    });
    persisted = true;
  }

  const after = linkedIds.length + added.length;

  // Gaps Layer 1 couldn't close → describe them as payable needs for the banner.
  let skippedNeedingPaid: SkippedNeed[] = [];
  if (after < target) {
    const marketConfig = await prisma.marketConfig.findUnique({
      where: { userId: args.userId },
      select: { id: true },
    });
    if (marketConfig) {
      const months = uploads
        .map((u) => u.monthYear.slice(0, 7))
        .filter((m) => m.length === 7)
        .sort();
      const timeWindow =
        months.length > 0
          ? { startMonth: months[0], endMonth: months[months.length - 1] }
          : { startMonth: "0000-00", endMonth: "9999-99" };
      const representedFamilies = new Set(
        [...linkedInput, ...added].map((f) => f.metricFamily),
      );
      const estimateRowCount = uploads.reduce((s, u) => s + u.rowCount, 0);
      skippedNeedingPaid = buildSkippedNeeds({
        memberId: args.userId,
        marketConfigId: marketConfig.id,
        representedFamilies,
        scopeHoods,
        lockedPropertyType,
        timeWindow,
        estimateRowCount,
        missing: target - after,
      });
    }
  }

  return {
    before: linkedIds.length,
    added,
    after,
    targetReached: after >= target,
    scope,
    skippedNeedingPaid,
    persisted,
  };
}
