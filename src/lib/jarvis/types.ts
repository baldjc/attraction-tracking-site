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
  metrics?: unknown;
  savedScriptId?: string;
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
