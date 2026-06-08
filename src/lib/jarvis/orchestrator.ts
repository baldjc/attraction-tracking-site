// Jarvis (AI Content Manager) — orchestrator. Runs one member turn as a
// Claude tool-use loop: stream prose, run get_facts / build_script /
// save_script, then return the grounded assistant text + any script proposal.

import Anthropic from "@anthropic-ai/sdk";
import type { MarketConfigSummary } from "@/lib/content-engine-context";
import {
  JARVIS_TOOLS,
  executeGetFacts,
  executeComputeCut,
  executeCleanKnowledgeBase,
  runBuildScript,
  groundAssistantText,
} from "@/lib/jarvis/tools";
import {
  JARVIS_SYSTEM_PREFIX,
  buildJarvisDynamicContext,
  type JarvisCampaignOption,
  type JarvisRecentVideoOption,
  type JarvisResearchSource,
} from "@/lib/jarvis/system-prompt";
import { saveConfirmedScript } from "@/lib/jarvis/save";
import { applyConfirmedMerge } from "@/lib/jarvis/merge";
import { extractSourcesFootnote, countCitedSources } from "@/lib/script-content-rules";
import {
  JARVIS_MODEL,
  type LedgerFact,
  type ProposalState,
  type ToolCallRecord,
} from "@/lib/jarvis/types";

const MAX_ITERS = 5;
const MAX_TOKENS = 2000;

export type JarvisEmit = (event: string, data: unknown) => void;

export interface JarvisHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface JarvisTurnResult {
  assistantText: string;
  proposal: ProposalState | null;
  newLedgerFacts: LedgerFact[];
  toolCalls: ToolCallRecord[];
  inputTokens: number;
  outputTokens: number;
}

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

export async function runJarvisTurn(args: {
  userId: string;
  threadId: string;
  history: JarvisHistoryTurn[];
  priorLedger: LedgerFact[];
  memberFullName: string | null;
  marketConfig: MarketConfigSummary | null;
  /** Pre-draft asset menus so Jarvis can PROPOSE a lead magnet + binge target
   *  before drafting (the member confirms/swaps). Loaded by the route. */
  campaigns?: JarvisCampaignOption[];
  recentVideos?: JarvisRecentVideoOption[];
  /** External research the member attached to this thread (Research Reader).
   *  Surfaced to Jarvis as EXTERNAL context — never the member's own facts. */
  researchSources?: JarvisResearchSource[];
  emit: JarvisEmit;
  signal?: AbortSignal;
  /** Mutated in place as tokens accrue, so the caller can bill usage even if
   *  this throws partway through the tool loop. */
  usage: { inputTokens: number; outputTokens: number };
}): Promise<JarvisTurnResult> {
  const {
    userId,
    threadId,
    history,
    priorLedger,
    memberFullName,
    marketConfig,
    campaigns,
    recentVideos,
    researchSources,
    emit,
    signal,
    usage,
  } = args;

  const newLedgerFacts: LedgerFact[] = [];
  const toolCalls: ToolCallRecord[] = [];
  let proposal: ProposalState | null = null;
  let assistantText = "";

  const ledger = () => [...priorLedger, ...newLedgerFacts];
  const seenFactIds = new Set(priorLedger.map((f) => f.id));

  // System holds ONLY the static behavioural prefix so it stays prompt-cacheable
  // across every member and turn. Per-member dynamic context (name, market, fact
  // ledger) is injected on the USER side below — never in the cached system block.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: JARVIS_SYSTEM_PREFIX,
      cache_control: { type: "ephemeral" },
    },
  ];

  // Real conversation turns + accumulated tool exchanges. The dynamic context is
  // prepended fresh each iteration (so the ledger stays current) but lives here
  // on the user side, not in the system prompt.
  const convo: Anthropic.MessageParam[] = history.map((t) => ({
    role: t.role,
    content: t.text,
  }));

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    if (signal?.aborted) break;

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: buildJarvisDynamicContext({
          memberFullName,
          marketConfig,
          ledger: ledger(),
          campaigns,
          recentVideos,
          researchSources,
        }),
      },
      { role: "assistant", content: "Understood — I'll use only these facts and my tools." },
      ...convo,
    ];

    const stream = client().messages.stream(
      { model: JARVIS_MODEL, max_tokens: MAX_TOKENS, system, tools: JARVIS_TOOLS, messages },
      { signal },
    );
    stream.on("text", (delta) => emit("assistant_token", { text: delta }));

    const final = await stream.finalMessage();
    usage.inputTokens += final.usage?.input_tokens ?? 0;
    usage.outputTokens += final.usage?.output_tokens ?? 0;

    for (const block of final.content) {
      if (block.type === "text") assistantText += block.text;
    }

    const toolUses = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (final.stop_reason !== "tool_use" || toolUses.length === 0) {
      convo.push({ role: "assistant", content: final.content });
      break;
    }

    // Execute each requested tool and collect tool_result blocks.
    convo.push({ role: "assistant", content: final.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tu of toolUses) {
      const resultBlock = await runTool({
        userId,
        threadId,
        tu,
        emit,
        signal,
        onFact: (f) => {
          if (!seenFactIds.has(f.id)) {
            seenFactIds.add(f.id);
            newLedgerFacts.push(f);
          }
        },
        onProposal: (p) => {
          proposal = p;
        },
        toolCalls,
      });
      toolResults.push(resultBlock);
    }

    convo.push({ role: "user", content: toolResults });
  }

  // Ground the conversational prose against the ledger AND the numbers the
  // script proposal cites in its "## Sources" footnote. The script step resolves
  // source-of-truth aggregates (median, sale-to-list, …) that never enter the
  // get_facts ledger; without this the summary/hooks would redact the very
  // metrics the script grounds and cites.
  // Cast breaks TS's null-narrowing of `proposal` (it's assigned via the
  // onProposal callback, which control-flow analysis can't see). We allow ONLY
  // the cited "## Sources" footnote numbers — not the whole script — so a
  // malformed/missing footnote can never implicitly whitelist body numbers.
  const builtProposal = proposal as ProposalState | null;
  const proposalSourceText = builtProposal
    ? extractSourcesFootnote(builtProposal.script)
    : "";
  // Research stats are EXTERNAL but legitimately quotable in cross-reference
  // prose ("a national report found X; your data shows Y"). Whitelist them as
  // extra allowed text alongside the script's cited footnote so the grounding
  // pass doesn't redact the very external numbers Jarvis is contrasting. They
  // never enter the fact ledger, so they can't be cited as member facts.
  const researchAllowedText = (researchSources ?? [])
    .flatMap((r) => [r.thesis, ...r.claims, ...r.stats])
    .filter(Boolean)
    .join("\n");
  const groundedText = groundAssistantText(
    assistantText,
    ledger(),
    [proposalSourceText, researchAllowedText].filter(Boolean).join("\n"),
  );
  return {
    assistantText: groundedText,
    proposal,
    newLedgerFacts,
    toolCalls,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}

async function runTool(ctx: {
  userId: string;
  threadId: string;
  tu: Anthropic.ToolUseBlock;
  emit: JarvisEmit;
  signal?: AbortSignal;
  onFact: (f: LedgerFact) => void;
  onProposal: (p: ProposalState) => void;
  toolCalls: ToolCallRecord[];
}): Promise<Anthropic.ToolResultBlockParam> {
  const { userId, threadId, tu, emit, signal, onFact, onProposal, toolCalls } = ctx;
  const input = (tu.input ?? {}) as Record<string, unknown>;

  const record = (status: "ok" | "error", summary: string) => {
    toolCalls.push({ name: tu.name, status, summary });
    emit("tool", { name: tu.name, status, summary });
  };
  const result = (text: string, isError = false): Anthropic.ToolResultBlockParam => ({
    type: "tool_result",
    tool_use_id: tu.id,
    content: text,
    ...(isError ? { is_error: true } : {}),
  });

  try {
    if (tu.name === "get_facts") {
      emit("tool", { name: "get_facts", status: "running", summary: "Looking up your facts…" });
      const res = await executeGetFacts(userId, {
        neighbourhood: typeof input.neighbourhood === "string" ? input.neighbourhood : undefined,
        metric: typeof input.metric === "string" ? input.metric : undefined,
      });
      for (const f of res.facts) onFact(f);
      const tier =
        res.state === "texture_only" ? " (texture-only)" : "";
      record(
        "ok",
        res.facts.length > 0
          ? `Found ${res.facts.length} fact${res.facts.length === 1 ? "" : "s"}${tier}${res.monthYear ? ` (${res.monthYear})` : ""}.`
          : res.note ?? "No matching facts.",
      );
      const payload = {
        monthYear: res.monthYear,
        state: res.state,
        textureOnly: res.textureOnly ?? false,
        note: res.note,
        facts: res.facts.map((f) => ({
          id: f.id,
          neighbourhood: f.neighbourhood,
          metric: f.label,
          value: f.value,
          monthYear: f.monthYear,
          ...(f.caveat ? { caveat: f.caveat } : {}),
        })),
      };
      return result(JSON.stringify(payload));
    }

    if (tu.name === "compute_cut") {
      emit("tool", {
        name: "compute_cut",
        status: "running",
        summary: "Computing a cut from your raw data…",
      });
      const res = await executeComputeCut(userId, {
        dimension: typeof input.dimension === "string" ? input.dimension : "",
        filterPropertyClass:
          typeof input.filterPropertyClass === "string" ? input.filterPropertyClass : undefined,
        filterNeighbourhood:
          typeof input.filterNeighbourhood === "string" ? input.filterNeighbourhood : undefined,
        filterStyle: typeof input.filterStyle === "string" ? input.filterStyle : undefined,
        filterPriceBracket:
          typeof input.filterPriceBracket === "string" ? input.filterPriceBracket : undefined,
      });
      for (const f of res.facts) onFact(f);
      record(
        res.ok && res.facts.length > 0 ? "ok" : "error",
        res.facts.length > 0
          ? `Computed ${res.facts.length} number${res.facts.length === 1 ? "" : "s"}${res.monthYear ? ` (${res.monthYear})` : ""}.`
          : res.note,
      );
      const payload = {
        monthYear: res.monthYear,
        classification: res.classification,
        ok: res.ok,
        note: res.note,
        facts: res.facts.map((f) => ({
          id: f.id,
          neighbourhood: f.neighbourhood,
          metric: f.label,
          value: f.value,
          monthYear: f.monthYear,
          ...(f.caveat ? { caveat: f.caveat } : {}),
        })),
      };
      return result(JSON.stringify(payload));
    }

    if (tu.name === "build_script") {
      emit("tool", { name: "build_script", status: "running", summary: "Drafting your script…" });
      emit("script_start", {});
      const built = await runBuildScript({
        userId,
        ideaCard: {
          title: String(input.title ?? "Untitled"),
          rotationSlot: String(input.rotationSlot ?? ""),
          titlePromise: String(input.titlePromise ?? ""),
          linkedFactIds: Array.isArray(input.linkedFactIds)
            ? (input.linkedFactIds as unknown[]).filter((x): x is string => typeof x === "string")
            : [],
          clarityPremise: typeof input.clarityPremise === "string" ? input.clarityPremise : undefined,
          campaignId: typeof input.campaignId === "string" ? input.campaignId : undefined,
          bingeVideoId: typeof input.bingeVideoId === "string" ? input.bingeVideoId : undefined,
        },
        researchSourceIds: Array.isArray(input.researchSourceIds)
          ? (input.researchSourceIds as unknown[]).filter((x): x is string => typeof x === "string")
          : [],
        onToken: (text) => emit("script_token", { text }),
        signal,
      });

      if (!built.ok) {
        record("error", built.message);
        return result(`build_script failed (${built.code}): ${built.message}`, true);
      }
      if (built.result.aborted) {
        record("error", "Drafting was cancelled.");
        return result("build_script aborted by the member.", true);
      }
      if (!built.result.ok || !built.result.script) {
        const msg = built.result.error?.message ?? "The draft didn't pass the content rules.";
        record("error", msg);
        emit("script_error", { message: msg });
        return result(`build_script could not produce a valid script: ${msg}`, true);
      }

      const proposalState: ProposalState = {
        status: "proposed",
        title: built.title,
        script: built.result.script,
        rotationSlot: built.rotationSlot,
        linkedFactIds: built.linkedFactIds,
        citedSourceCount: countCitedSources(built.result.script),
        metrics: built.result.metrics ?? undefined,
        campaignId: built.campaignId,
        bingeVideoId: built.bingeVideoId,
        dataPeriod: built.dataPeriod,
        researchSourceIds: built.researchSourceIds,
      };
      onProposal(proposalState);
      record("ok", `Drafted "${built.title}".`);
      emit("script_done", {});
      const words = built.result.metrics?.dialogueWordCount ?? null;
      // Only nudge when no USABLE binge target was wired (member had none, chose
      // none, or picked an idea-stage video that can't be teased yet). If they
      // confirmed a real next video, the close already teases it — stay quiet.
      const bingeNudge = built.bingeTargetConfigured
        ? ""
        : " No usable next-video/binge target was wired in, so the close is a generic forward-looking line. After telling them it's ready, ASK which of their recent videos to point viewers to as the \"watch this next\" — offer it as a one-tap pick from their RECENT VIDEOS, and do NOT invent or suggest a title that isn't in that list.";
      return result(
        `Script drafted successfully${words ? ` (~${words} dialogue words)` : ""}. It is shown to the member with an Approve & save button. Tell them it's ready to review; do NOT save it yourself.${bingeNudge}`,
      );
    }

    if (tu.name === "save_script") {
      // Gated. Only succeeds when a prior confirm action recorded an explicit
      // save_confirmation as the latest member message. Otherwise we refuse and
      // tell the model to direct the member to the Approve & save button.
      const proposalMessageId = String(input.proposalMessageId ?? "");
      const saved = await saveConfirmedScript({ userId, threadId, proposalMessageId });
      if (saved.ok) {
        record("ok", "Saved as a draft.");
        return result(
          `Saved as a draft (id ${saved.savedScriptId}). It now appears in My Work / the Content Planner.`,
        );
      }
      record("error", "Save not allowed yet.");
      return result(
        `save_script refused (${saved.code}): ${saved.message} Direct the member to the Approve & save button instead.`,
        true,
      );
    }

    if (tu.name === "clean_knowledge_base") {
      emit("tool", {
        name: "clean_knowledge_base",
        status: "running",
        summary: "Planning a Knowledge Base cleanup…",
      });
      const res = await executeCleanKnowledgeBase(userId);
      if (!res.mergeRunId) {
        record("ok", "Knowledge Base already clean.");
        return result(JSON.stringify(res));
      }
      record(
        "ok",
        `Proposed cleanup: ${res.rawCount} → ${res.canonicalCount} areas.`,
      );
      return result(
        JSON.stringify({
          ...res,
          instruction:
            "This is a DRY-RUN. Summarise the impact (names collapsed, areas " +
            "clearing the floor, anything queued for review) and tell the " +
            "member to apply it with the Review merges → Yes, clean it up " +
            "buttons. Do NOT call apply_merge yourself.",
        }),
      );
    }

    if (tu.name === "apply_merge") {
      // Gated. Only succeeds when a prior confirm action recorded an explicit
      // merge_confirmation as the latest member message. Otherwise we refuse
      // and tell the model to direct the member to the Review merges button.
      const mergeRunId = String(input.mergeRunId ?? "");
      const applied = await applyConfirmedMerge({ userId, threadId, mergeRunId });
      if (applied.ok) {
        record("ok", "Knowledge Base cleaned up.");
        const r = applied.result;
        return result(
          applied.alreadyApplied
            ? "That cleanup was already applied — nothing more to do."
            : `Cleanup applied: re-aggregated ${r.uploadsReaggregated} upload(s), ` +
                `relabelled ${r.factsRelabelled} fact(s), ${r.canonicalCount} ` +
                `canonical areas. Areas clearing the floor: ` +
                `${r.floorClearing.before} → ${r.floorClearing.after}.`,
        );
      }
      record("error", "Cleanup not allowed yet.");
      return result(
        `apply_merge refused (${applied.code}): ${applied.message} Direct the ` +
          "member to the Review merges → Yes, clean it up buttons instead.",
        true,
      );
    }

    record("error", `Unknown tool ${tu.name}.`);
    return result(`Unknown tool: ${tu.name}`, true);
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    record("error", msg);
    return result(`Tool ${tu.name} threw: ${msg}`, true);
  }
}
