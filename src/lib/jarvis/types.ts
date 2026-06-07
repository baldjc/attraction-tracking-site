// Jarvis (AI Content Manager) — shared types.
//
// One streaming chat per member at /member/jarvis. The orchestrator (Claude)
// can pull the member's live market facts (get_facts), draft a script via the
// extracted buildScript() core (build_script), and propose saving it as a
// DRAFT SavedScript. Saving is gated behind an explicit member two-tap
// confirmation — see save.ts.

import type { RotationSlotKey } from "@/lib/content-engine-validation";

/** Orchestrator model — spec-required. buildScript keeps its own model. */
export const JARVIS_MODEL = "claude-sonnet-4-6";

/** AIToolUsage.toolType tag for orchestrator-side token billing. */
export const JARVIS_TOOL_TYPE = "jarvis";

/**
 * A market fact the orchestrator has surfaced this thread. Every number the
 * assistant is allowed to state must trace back to one of these — the
 * grounding pass (tools.ts) redacts any currency/percent/decimal token that
 * isn't present in the thread's fact ledger.
 */
export interface LedgerFact {
  id: string;
  label: string;
  neighbourhood: string;
  value: string;
  monthYear: string;
  source: string;
  /**
   * Present only on texture-only fallback facts (usageClass
   * `supporting_texture_only`): a "use as background colour, not a headline
   * claim" warning. Headline-safe facts omit it.
   */
  caveat?: string;
}

/** Lifecycle of a script-save proposal. */
export type ProposalStatus = "proposed" | "confirming" | "created" | "declined";

/**
 * Persisted on the assistant ContentManagerMessage that proposes a save.
 * `script` is the full draft; on `created` we stamp `savedScriptId`.
 */
export interface ProposalState {
  status: ProposalStatus;
  title: string;
  script: string;
  rotationSlot: RotationSlotKey;
  linkedFactIds: string[];
  /**
   * Distinct facts + source-of-truth metrics cited in the script's "## Sources"
   * footnote. The proposal card shows this so the count agrees with what the
   * script actually cites; `linkedFactIds` undercounts (it omits SoT-derived
   * citations). Optional for backward compatibility with proposals persisted
   * before this field existed.
   */
  citedSourceCount?: number;
  metrics?: unknown;
  savedScriptId?: string;
  /**
   * Member-confirmed lead-magnet Campaign this draft was built against (chosen
   * BEFORE drafting, not a generic placeholder). Persisted onto the created
   * ContentPlan's `linkedCampaignId` on Approve & save. Null/absent → the member
   * had no campaign to assign, so the draft used generic pitch language.
   */
  campaignId?: string | null;
  /**
   * Member-confirmed binge / "watch this next" ContentPlan this draft points to.
   * Persisted onto the created ContentPlan's `bingeVideoId` on Approve & save.
   * Null/absent → no next-video chosen, so the close is a generic forward line.
   */
  bingeVideoId?: string | null;
  /**
   * Humanised data period of the facts this draft is grounded on (e.g. "June
   * 2026"). Used only to render the standing "verify against your live MLS" UI
   * line near the proposal's source count — it is NOT baked into the script
   * text. Null/absent → the line falls back to period-less phrasing.
   */
  dataPeriod?: string | null;
  /**
   * On `created`, the id of the ContentPlan this approved draft was routed into
   * (the Content Planner is the single home for member content). Optional for
   * proposals saved before this routing existed, or when plan routing failed
   * (the SavedScript draft is still created — routing is best-effort).
   */
  contentPlanId?: string;
}

// ── Persisted ContentManagerMessage.content shapes ──────────────────────────

export interface UserTextContent {
  kind: "text";
  text: string;
}

/**
 * Inserted by the proposal "save" action immediately before the shared gated
 * save runs. Its presence as the latest member message is the gate signal.
 */
export interface SaveConfirmationContent {
  kind: "save_confirmation";
  proposalMessageId: string;
}

/**
 * Inserted by the KB-merge confirm action immediately before the shared gated
 * apply runs. Its presence as the latest member message is the gate signal that
 * lets `applyConfirmedMerge` (and the apply_merge tool) actually mutate the KB.
 */
export interface MergeConfirmationContent {
  kind: "merge_confirmation";
  mergeRunId: string;
}

export interface AssistantTextContent {
  kind: "text";
  text: string;
}

export interface FactsToolContent {
  kind: "facts";
  query: { month?: string; neighbourhood?: string; metric?: string };
  facts: LedgerFact[];
}

export type MessageContent =
  | UserTextContent
  | SaveConfirmationContent
  | AssistantTextContent
  | FactsToolContent;

/** A tool-status row persisted on an assistant turn (muted UI rows). */
export interface ToolCallRecord {
  name: string;
  status: "ok" | "error";
  summary: string;
}
