// Jarvis (AI Content Manager) — shared types.
//
// One streaming chat per member at /member/jarvis. The orchestrator (Claude)
// can pull the member's live market facts (get_facts), draft a script via the
// extracted buildScript() core (build_script), and propose saving it as a
// DRAFT SavedScript. Saving is gated behind an explicit member two-tap
// confirmation — see save.ts.

import type { RotationSlotKey } from "@/lib/content-engine-validation";
import { SONNET_MODEL } from "@/lib/ai-models";

/** Orchestrator model — spec-required. buildScript keeps its own model. */
export const JARVIS_MODEL = SONNET_MODEL;

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
  /**
   * REFINE mode target: the EXISTING planner video this draft is refining. When
   * set, an approved save UPDATES that ContentPlan in place (new script + linked
   * script) instead of creating a new one — set by the planner "↻ Regenerate"
   * hand-off (see seed.ts) and stamped by the orchestrator onto every proposal
   * built in a refine thread. Absent on a normal "build a new script" flow.
   */
  targetContentPlanId?: string;
  /**
   * External ResearchSource ids this draft was grounded against (Research
   * Reader). Persisted onto the saved script + ContentPlan so the two-source
   * provenance survives approval. Absent → a normal market-only draft.
   */
  researchSourceIds?: string[];
}

// ── Browse-all-content-ideas front door (Task #60) ──────────────────────────

/**
 * The conversational path an `IdeasState` belongs to, so the UI can label the
 * card list and so each card carries the right hand-off.
 *  - `story_lead`   — a ranked market story lead the member can script.
 *  - `theme_option` — one of the rotation-slot "themes" to explore (a chooser,
 *                     not a buildable idea; tapping it asks Jarvis to generate
 *                     ideas for that theme).
 *  - `theme_idea`   — a generated, validated idea card (buildable).
 *  - `validation`   — the result of validating a member's own idea (buildable
 *                     when the verdict supports/partially-supports it).
 */
export type IdeaCardKind =
  | "story_lead"
  | "theme_option"
  | "theme_idea"
  | "validation";

/**
 * One selectable card rendered in the Jarvis chat as part of an `IdeasState`.
 * Tapping a card sends its `prompt` as the next member message (the same
 * natural-language hand-off the dashboard seed uses), so the model runs the
 * normal pre-draft proposal + build_script flow — no new build short-circuit.
 *
 * `prompt` embeds everything the model needs (title/slot/premise and, for
 * buildable cards, the exact fact ids to pass to build_script.linkedFactIds).
 */
export interface IdeaCardItem {
  /** Stable id for React keys + selection (card-local, not a DB id). */
  id: string;
  kind: IdeaCardKind;
  title: string;
  /** Rotation-slot / theme label shown as a tag (e.g. "Market Update"). */
  themeLabel?: string;
  /** One-line hook / why-it-matters shown under the title. */
  hook?: string;
  /** Count of member facts this idea is anchored on (shown as provenance). */
  citedFactCount?: number;
  /** The natural-language message sent when the member picks this card. */
  prompt: string;
}

/**
 * Persisted on the assistant ContentManagerMessage (column `ideasState`) and
 * emitted live as an `ideas` SSE frame. Renders a list of selectable idea
 * cards beneath the assistant's prose. Mirrors how `ProposalState` rides along
 * an assistant turn.
 */
export interface IdeasState {
  kind: "ideas";
  /** Which front-door path produced these cards. */
  path: "story_leads" | "themes" | "theme_ideas" | "validation";
  /** Optional heading shown above the cards. */
  heading?: string;
  /** Optional one-line note shown above the cards (e.g. a thin-data caveat). */
  note?: string;
  items: IdeaCardItem[];
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
