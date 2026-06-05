// Jarvis (AI Content Manager) — orchestrator. Runs one member turn as a
// Claude tool-use loop: stream prose, run get_facts / build_script /
// save_script, then return the grounded assistant text + any script proposal.

import Anthropic from "@anthropic-ai/sdk";
import type { MarketConfigSummary } from "@/lib/content-engine-context";
import {
  JARVIS_TOOLS,
  executeGetFacts,
  runBuildScript,
  groundAssistantText,
} from "@/lib/jarvis/tools";
import {
  JARVIS_SYSTEM_PREFIX,
  buildJarvisDynamicContext,
} from "@/lib/jarvis/system-prompt";
import { saveConfirmedScript } from "@/lib/jarvis/save";
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
  emit: JarvisEmit;
  signal?: AbortSignal;
  /** Mutated in place as tokens accrue, so the caller can bill usage even if
   *  this throws partway through the tool loop. */
  usage: { inputTokens: number; outputTokens: number };
}): Promise<JarvisTurnResult> {
  const { userId, threadId, history, priorLedger, memberFullName, marketConfig, emit, signal, usage } =
    args;

  const newLedgerFacts: LedgerFact[] = [];
  const toolCalls: ToolCallRecord[] = [];
  let proposal: ProposalState | null = null;
  let assistantText = "";

  const ledger = () => [...priorLedger, ...newLedgerFacts];
  const seenFactIds = new Set(priorLedger.map((f) => f.id));

  const messages: Anthropic.MessageParam[] = history.map((t) => ({
    role: t.role,
    content: t.text,
  }));

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    if (signal?.aborted) break;

    const system: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: JARVIS_SYSTEM_PREFIX,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: buildJarvisDynamicContext({ memberFullName, marketConfig, ledger: ledger() }),
      },
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
      messages.push({ role: "assistant", content: final.content });
      break;
    }

    // Execute each requested tool and collect tool_result blocks.
    messages.push({ role: "assistant", content: final.content });
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

    messages.push({ role: "user", content: toolResults });
  }

  const groundedText = groundAssistantText(assistantText, ledger());
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
      record(
        "ok",
        res.facts.length > 0
          ? `Found ${res.facts.length} fact${res.facts.length === 1 ? "" : "s"}${res.monthYear ? ` (${res.monthYear})` : ""}.`
          : res.note ?? "No matching facts.",
      );
      const payload = {
        monthYear: res.monthYear,
        note: res.note,
        facts: res.facts.map((f) => ({
          id: f.id,
          neighbourhood: f.neighbourhood,
          metric: f.label,
          value: f.value,
          monthYear: f.monthYear,
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
        },
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
        metrics: built.result.metrics ?? undefined,
      };
      onProposal(proposalState);
      record("ok", `Drafted "${built.title}".`);
      emit("script_done", {});
      const words = built.result.metrics?.dialogueWordCount ?? null;
      return result(
        `Script drafted successfully${words ? ` (~${words} dialogue words)` : ""}. It is shown to the member with an Approve & save button. Tell them it's ready to review; do NOT save it yourself.`,
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

    record("error", `Unknown tool ${tu.name}.`);
    return result(`Unknown tool: ${tu.name}`, true);
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    record("error", msg);
    return result(`Tool ${tu.name} threw: ${msg}`, true);
  }
}
