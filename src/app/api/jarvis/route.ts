/**
 * POST /api/jarvis
 *
 * Jarvis (AI Content Manager) orchestrator turn. Streams Server-Sent Events:
 *   event: assistant_token   data: { text }      // live chat prose
 *   event: tool              data: { name, status, summary }
 *   event: script_start      data: {}
 *   event: script_token      data: { text }      // live draft script
 *   event: script_done       data: {}
 *   event: script_error      data: { message }
 *   event: assistant_final   data: { messageId, text, proposal }
 *   event: error             data: { message }
 *
 * Gated behind the `tool_jarvis` feature flag (object-form allowlist) and the
 * member's monthly cost cap. Persists the member turn, the assistant turn, and
 * a tool record of any facts surfaced (so later turns rebuild the ledger).
 */
import { type NextRequest } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getCostCapStatus, isHardCapExempt, logUsage } from "@/lib/ai-tool-cost";
import { loadMarketConfigSummary } from "@/lib/content-engine-context";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { runJarvisTurn, type JarvisHistoryTurn } from "@/lib/jarvis/orchestrator";
import { coerceExtractedClaims } from "@/lib/jarvis/research-ingest";
import {
  JARVIS_TOOL_TYPE,
  type FactsToolContent,
  type LedgerFact,
  type MessageContent,
} from "@/lib/jarvis/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonError(status: number, error: string, message?: string): Response {
  return new Response(JSON.stringify(message ? { error, message } : { error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const resolved = await resolveUserFromSession();
  if (!resolved) return jsonError(401, "Unauthorized");
  const userId = resolved.id;

  const flags = await getFeatureFlags({ userId, userRole: resolved.role });
  if (!flags.tool_jarvis) return jsonError(404, "not_enabled");

  // Admin impersonating a member is exempt from the HARD block (tokens still
  // logged); real, non-impersonated members stay fully capped.
  const cap = await getCostCapStatus(userId);
  if (cap.hardBlocked && !isHardCapExempt(resolved)) {
    const pct =
      cap.capUsd > 0 ? Math.min(100, Math.round((cap.monthSpendUsd / cap.capUsd) * 100)) : 100;
    return jsonError(
      402,
      "monthly_cost_cap_reached",
      `You've used ${pct}% of your monthly AI allowance, so I can't run another draft right now. It refreshes on the 1st of next month — any drafts you've already saved stay safe in My Work.`,
    );
  }

  let body: { threadId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json");
  }
  const message = (body.message ?? "").trim();
  if (!message) return jsonError(400, "empty_message");

  // ── Resolve / create the thread (ownership-filtered) ──────────────────────
  let threadId = body.threadId;
  if (threadId) {
    const owned = await prisma.contentManagerThread.findFirst({
      where: { id: threadId, userId },
      select: { id: true },
    });
    if (!owned) return jsonError(404, "thread_not_found");
  } else {
    const created = await prisma.contentManagerThread.create({
      data: { userId, title: message.slice(0, 60) },
      select: { id: true },
    });
    threadId = created.id;
  }

  // ── Persist the member turn ───────────────────────────────────────────────
  await prisma.contentManagerMessage.create({
    data: { threadId, role: "user", content: { kind: "text", text: message } },
  });
  await prisma.contentManagerThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  // ── Rebuild conversation history + fact ledger from the thread ────────────
  const rows = await prisma.contentManagerMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  const history: JarvisHistoryTurn[] = [];
  const priorLedger: LedgerFact[] = [];
  const seenFactIds = new Set<string>();
  for (const r of rows) {
    const c = r.content as unknown as MessageContent;
    if (r.role === "tool") {
      if (c && (c as FactsToolContent).kind === "facts") {
        for (const f of (c as FactsToolContent).facts) {
          if (!seenFactIds.has(f.id)) {
            seenFactIds.add(f.id);
            priorLedger.push(f);
          }
        }
      }
      continue;
    }
    if ((r.role === "user" || r.role === "assistant") && c && c.kind === "text") {
      history.push({ role: r.role, text: c.text });
    }
  }

  // Pre-draft asset menus so Jarvis can PROPOSE a lead magnet + binge target
  // before drafting (the member confirms or swaps). Both ownership-scoped, the
  // same queries that back the planner's lead-magnet linker (/api/campaigns)
  // and binge selector (/api/member/content-plans/list-for-binge-selector).
  const [memberRecord, marketConfig, campaignRows, recentVideoRows, researchRows] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
      loadMarketConfigSummary(userId),
      prisma.campaign.findMany({
        where: { userId, deletedAt: null, name: { not: "__test_installation__" } },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, name: true, pitchOneLiner: true, audience: true },
      }),
      prisma.contentPlan.findMany({
        where: { userId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, title: true, status: true, theme: true },
      }),
      // Research Reader — the EXTERNAL sources the member attached in THIS thread
      // (ownership + thread scoped). Surfaced to Jarvis as the outside lens; the
      // member's own validated facts still lead. Empty on non-research threads.
      prisma.researchSource.findMany({
        where: { userId, threadId },
        orderBy: { createdAt: "asc" },
        take: 5,
        select: {
          id: true,
          title: true,
          type: true,
          sourceRef: true,
          extractedClaims: true,
        },
      }),
    ]);
  const memberFullName = memberRecord?.fullName?.trim() || null;
  const campaigns = campaignRows.map((c) => ({
    id: c.id,
    name: c.name,
    pitchOneLiner: c.pitchOneLiner ?? null,
    audience: c.audience ?? null,
  }));
  const recentVideos = recentVideoRows.map((v) => ({
    id: v.id,
    title: v.title,
    status: v.status,
    theme: v.theme ?? null,
  }));
  const researchSources = researchRows.map((r) => {
    const claims = coerceExtractedClaims(r.extractedClaims);
    return {
      id: r.id,
      title: r.title,
      type: r.type,
      sourceRef: r.sourceRef,
      thesis: claims.thesis,
      claims: claims.claims,
      stats: claims.stats,
    };
  });

  // ── Open the SSE stream ───────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const clientSignal = req.signal;
  const internalAbort = new AbortController();
  const onClientAbort = () => internalAbort.abort();
  clientSignal.addEventListener("abort", onClientAbort);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | null = setInterval(() => {
        if (clientSignal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`: hb ${Date.now()}\n\n`));
        } catch {
          /* closed */
        }
      }, 2000);
      const stopHeartbeat = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };
      const emit = (event: string, data: unknown) => {
        if (clientSignal.aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* closed */
        }
      };

      emit("thread", { threadId });

      // Mutated in place by the orchestrator so we can bill usage even if the
      // turn throws partway through the tool loop.
      const usage = { inputTokens: 0, outputTokens: 0 };

      try {
        const turn = await runJarvisTurn({
          userId,
          threadId: threadId!,
          history,
          priorLedger,
          memberFullName,
          marketConfig,
          campaigns,
          recentVideos,
          researchSources,
          emit,
          signal: internalAbort.signal,
          usage,
        });

        // Persist any facts surfaced this turn (rebuilds the ledger later).
        if (turn.newLedgerFacts.length > 0) {
          await prisma.contentManagerMessage.create({
            data: {
              threadId: threadId!,
              role: "tool",
              content: {
              kind: "facts",
              query: {},
              facts: turn.newLedgerFacts,
            } as unknown as Prisma.InputJsonValue,
            },
          });
        }

        // Persist the assistant turn (with toolCalls + any proposal).
        const assistantMsg = await prisma.contentManagerMessage.create({
          data: {
            threadId: threadId!,
            role: "assistant",
            content: { kind: "text", text: turn.assistantText },
            toolCalls:
              turn.toolCalls.length > 0
                ? (turn.toolCalls as unknown as Prisma.InputJsonValue)
                : undefined,
            proposalState: turn.proposal
              ? (turn.proposal as unknown as Prisma.InputJsonValue)
              : undefined,
          },
          select: { id: true },
        });

        emit("assistant_final", {
          messageId: assistantMsg.id,
          text: turn.assistantText,
          proposal: turn.proposal
            ? { ...turn.proposal, messageId: assistantMsg.id }
            : null,
        });
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? String(err);
        console.error("[jarvis] turn failed:", msg);
        emit("error", { message: "Something went wrong drafting that. Try again." });
      } finally {
        // Bill whatever tokens accrued, even on a partial/failed turn.
        if (usage.inputTokens || usage.outputTokens) {
          try {
            await logUsage(userId, JARVIS_TOOL_TYPE, usage.inputTokens, usage.outputTokens);
          } catch (e) {
            console.error("[jarvis] logUsage failed:", (e as Error)?.message ?? e);
          }
        }
        stopHeartbeat();
        clientSignal.removeEventListener("abort", onClientAbort);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      internalAbort.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
