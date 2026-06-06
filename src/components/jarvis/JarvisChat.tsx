"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useToast } from "@/components/ToastProvider";
import type { ProposalState, ToolCallRecord } from "@/lib/jarvis/types";

// Markdown rendering for assistant turns + draft-script cards. react-markdown
// does NOT render raw HTML by default (no rehype-raw), so embedded HTML is
// escaped — safe for streamed model output. Re-renders incrementally as
// tokens arrive, so SSE streaming stays intact.
const MD_COMPONENTS = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => <em className="italic">{children}</em>,
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-2 list-disc pl-5 leading-relaxed last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-2 list-decimal pl-5 leading-relaxed last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li className="mb-0.5">{children}</li>,
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-2 mt-1 text-base font-bold">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-2 mt-1 text-base font-bold">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-1.5 mt-1 text-sm font-bold">{children}</h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="mb-1.5 mt-1 text-sm font-semibold">{children}</h4>
  ),
  hr: () => <hr className="my-3 border-abv-border" />,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-[var(--abv-azure)] underline">
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="mb-2 border-l-2 border-abv-border pl-3 text-abv-text-secondary">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10">
      {children}
    </code>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-abv-border px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-abv-border px-2 py-1">{children}</td>
  ),
};

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}

export interface InitialMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCallRecord[];
  proposal?: ProposalState;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCallRecord[];
  proposal?: (ProposalState & { messageId?: string }) | null;
  /** Live draft script streaming under this assistant turn. */
  draft?: string;
  draftStatus?: "streaming" | "done" | "error";
}

interface ToolRow {
  name: string;
  status: string;
  summary: string;
}

const SUGGESTIONS = [
  "What's happening in my market right now?",
  "Draft a market-update video from my latest numbers",
  "Give me a contrarian-take video idea",
];

export default function JarvisChat({
  threadId: initialThreadId,
  initialMessages,
  memberFirstName,
}: {
  threadId: string | null;
  initialMessages: InitialMessage[];
  memberFirstName: string | null;
}) {
  const toast = useToast();
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      toolCalls: m.toolCalls,
      proposal: m.proposal ? { ...m.proposal, messageId: m.id } : null,
    })),
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveTools, setLiveTools] = useState<ToolRow[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, liveTools]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      setBusy(true);
      setLiveTools([]);
      const userMsg: ChatMessage = { id: `local-${Date.now()}`, role: "user", text: trimmed };
      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", text: "" },
      ]);
      setInput("");

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const patchAssistant = (patch: Partial<ChatMessage>) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
        );

      try {
        const resp = await fetch("/api/jarvis", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId, message: trimmed }),
          signal: ctrl.signal,
        });

        if (!resp.ok || !resp.body) {
          let msg = "Something went wrong. Try again.";
          try {
            const j = await resp.json();
            msg = j.message ?? j.error ?? msg;
          } catch {
            /* non-json */
          }
          patchAssistant({ text: msg });
          toast.error(msg);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let assistantBuf = "";
        let draftBuf = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            if (!frame.trim() || frame.startsWith(":")) continue;

            let event = "message";
            const dataLines: string[] = [];
            for (const rawLine of frame.split("\n")) {
              const line = rawLine.trimEnd();
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
            }
            let data: Record<string, unknown> = {};
            try {
              data = dataLines.length ? JSON.parse(dataLines.join("\n")) : {};
            } catch {
              continue;
            }

            switch (event) {
              case "thread":
                if (typeof data.threadId === "string") setThreadId(data.threadId);
                break;
              case "assistant_token":
                assistantBuf += String(data.text ?? "");
                patchAssistant({ text: assistantBuf });
                break;
              case "tool":
                setLiveTools((prev) => {
                  const next = [...prev];
                  const i = next.findIndex((t) => t.name === data.name);
                  const row = {
                    name: String(data.name ?? ""),
                    status: String(data.status ?? ""),
                    summary: String(data.summary ?? ""),
                  };
                  if (i >= 0) next[i] = row;
                  else next.push(row);
                  return next;
                });
                break;
              case "script_start":
                draftBuf = "";
                patchAssistant({ draft: "", draftStatus: "streaming" });
                break;
              case "script_token":
                draftBuf += String(data.text ?? "");
                patchAssistant({ draft: draftBuf, draftStatus: "streaming" });
                break;
              case "script_done":
                patchAssistant({ draft: draftBuf, draftStatus: "done" });
                break;
              case "script_error":
                patchAssistant({ draftStatus: "error" });
                break;
              case "assistant_final": {
                const proposal = (data.proposal as (ProposalState & { messageId?: string }) | null) ?? null;
                const realId = typeof data.messageId === "string" ? data.messageId : assistantId;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          id: realId,
                          text: String(data.text ?? assistantBuf),
                          proposal,
                          toolCalls: liveToolsToRecords(),
                        }
                      : m,
                  ),
                );
                setLiveTools([]);
                break;
              }
              case "error":
                patchAssistant({ text: String(data.message ?? "Something went wrong.") });
                toast.error(String(data.message ?? "Something went wrong."));
                break;
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          patchAssistant({ text: "Connection lost. Please try again." });
          toast.error("Connection lost. Please try again.");
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
        setLiveTools([]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, threadId, toast],
  );

  // Snapshot live tool rows into the persisted assistant message.
  const liveToolsRef = useRef<ToolRow[]>([]);
  liveToolsRef.current = liveTools;
  const liveToolsToRecords = (): ToolCallRecord[] | undefined => {
    const rows = liveToolsRef.current.filter((t) => t.status === "ok" || t.status === "error");
    if (rows.length === 0) return undefined;
    return rows.map((t) => ({
      name: t.name,
      status: t.status === "error" ? "error" : "ok",
      summary: t.summary,
    }));
  };

  const proposalAction = useCallback(
    async (messageId: string, action: "confirming" | "reopen" | "decline" | "save") => {
      if (!threadId || pendingAction) return;
      setPendingAction(`${messageId}:${action}`);
      try {
        const resp = await fetch("/api/jarvis/proposal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId, messageId, action }),
        });
        const j = await resp.json();
        if (!resp.ok) {
          toast.error(j.message ?? "Couldn't update that.");
          return;
        }
        const proposalState = (j.proposalState as ProposalState | null) ?? null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, proposal: proposalState ? { ...proposalState, messageId } : null }
              : m,
          ),
        );
        if (action === "save" && j.ok) {
          toast.success(
            j.alreadySaved ? "Already saved to My Work." : "Saved to My Work as a draft.",
          );
        }
      } catch {
        toast.error("Couldn't update that.");
      } finally {
        setPendingAction(null);
      }
    },
    [threadId, pendingAction, toast],
  );

  const greeting = memberFirstName ? `Hi ${memberFirstName}` : "Hi there";

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="border-b border-abv-border px-6 py-4">
        <h1 className="text-lg font-semibold text-abv-text">AI Content Manager</h1>
        <p className="text-sm text-abv-text-secondary">
          Plan and draft a video from your real market numbers. Drafts save to My Work — nothing is
          ever published.
        </p>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-abv-border bg-abv-surface p-6">
              <p className="text-base font-medium text-abv-text">{greeting} 👋</p>
              <p className="mt-1 text-sm text-abv-text-secondary">
                Ask about your market or have me draft a script. Try:
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={busy}
                    className="rounded-xl border border-abv-border px-4 py-2.5 text-left text-sm text-abv-text transition hover:border-abv-border-strong disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              pendingAction={pendingAction}
              onAction={proposalAction}
            />
          ))}

          {liveTools.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {liveTools.map((t) => (
                <ToolStatusRow key={t.name} row={t} />
              ))}
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-abv-border px-4 py-4 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Message your content manager…"
            disabled={busy}
            className="min-h-[44px] max-h-40 flex-1 resize-none rounded-xl border border-abv-border bg-abv-surface px-4 py-2.5 text-sm text-abv-text outline-none focus:border-abv-border-strong disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="h-[44px] rounded-xl bg-abv-ai-tools px-5 text-sm font-medium text-white transition disabled:opacity-50"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  pendingAction,
  onAction,
}: {
  message: ChatMessage;
  pendingAction: string | null;
  onAction: (id: string, action: "confirming" | "reopen" | "decline" | "save") => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-abv-ai-tools px-4 py-2.5 text-sm text-white">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {message.toolCalls?.map((t, i) => (
        <ToolStatusRow key={`${t.name}-${i}`} row={{ name: t.name, status: t.status, summary: t.summary }} />
      ))}

      {message.text && (
        <div className="max-w-[90%] rounded-2xl border border-abv-border bg-abv-surface px-4 py-3 text-sm text-abv-text">
          <Markdown>{message.text}</Markdown>
        </div>
      )}

      {(message.draft || message.draftStatus) && (
        <ScriptDraft draft={message.draft ?? ""} status={message.draftStatus} />
      )}

      {message.proposal && (
        <ProposalCard
          proposal={message.proposal}
          messageId={message.proposal.messageId ?? message.id}
          pendingAction={pendingAction}
          onAction={onAction}
        />
      )}
    </div>
  );
}

function ScriptDraft({ draft, status }: { draft: string; status?: ChatMessage["draftStatus"] }) {
  return (
    <div className="max-w-[90%] rounded-2xl border border-abv-border bg-abv-bg-warm">
      <div className="flex items-center justify-between border-b border-abv-border px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-abv-text-secondary">
          Draft script
        </span>
        {status === "streaming" && (
          <span className="text-xs text-abv-text-secondary">writing…</span>
        )}
        {status === "error" && <span className="text-xs text-red-500">couldn’t finish</span>}
      </div>
      <div className="max-h-96 overflow-y-auto px-4 py-3 text-sm text-abv-text">
        <Markdown>{draft}</Markdown>
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  messageId,
  pendingAction,
  onAction,
}: {
  proposal: ProposalState & { messageId?: string };
  messageId: string;
  pendingAction: string | null;
  onAction: (id: string, action: "confirming" | "reopen" | "decline" | "save") => void;
}) {
  const isPending = (action: string) => pendingAction === `${messageId}:${action}`;
  const anyPending = pendingAction?.startsWith(`${messageId}:`) ?? false;
  // Prefer the count of distinct facts/SoT entries cited in the script's
  // "## Sources" footnote; fall back to linked-fact ids for proposals persisted
  // before citedSourceCount existed (or if the footnote parser returned 0).
  const sourceCount = proposal.citedSourceCount || proposal.linkedFactIds.length;

  if (proposal.status === "created") {
    return (
      <div className="max-w-[90%] rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-abv-text">
        ✓ Saved to My Work as a draft. You can refine and schedule it in the Content Planner.
      </div>
    );
  }
  if (proposal.status === "declined") {
    return (
      <div className="max-w-[90%] rounded-2xl border border-abv-border bg-abv-surface px-4 py-3 text-sm text-abv-text-secondary">
        <p>Draft dismissed. Changed your mind?</p>
        <button
          onClick={() => onAction(messageId, "reopen")}
          disabled={anyPending}
          className="mt-2 rounded-lg border border-abv-border px-4 py-2 text-sm text-abv-text disabled:opacity-50"
        >
          {isPending("reopen") ? "Bringing it back…" : "Bring this draft back"}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[90%] rounded-2xl border border-abv-border bg-abv-surface px-4 py-3">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
        Not saved yet
      </span>
      <p className="mt-2 text-sm font-medium text-abv-text">“{proposal.title}”</p>
      <p className="mt-0.5 text-xs text-abv-text-secondary">
        {labelForSlot(proposal.rotationSlot)} · {sourceCount} source
        {sourceCount === 1 ? "" : "s"} cited
      </p>

      {proposal.status === "proposed" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => onAction(messageId, "confirming")}
            disabled={anyPending}
            className="rounded-lg bg-abv-ai-tools px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Approve &amp; save
          </button>
          <button
            onClick={() => onAction(messageId, "decline")}
            disabled={anyPending}
            className="rounded-lg border border-abv-border px-4 py-2 text-sm text-abv-text disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      {proposal.status === "confirming" && (
        <div className="mt-3">
          <p className="text-sm text-abv-text">Save this as a draft?</p>
          <p className="mt-1 text-xs text-abv-text-secondary">
            It’ll be saved as a draft in My Work and the Content Planner — nothing is published or
            scheduled, and you can edit it anytime.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => onAction(messageId, "save")}
              disabled={anyPending}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isPending("save") ? "Saving…" : "Yes, save it"}
            </button>
            <button
              onClick={() => onAction(messageId, "reopen")}
              disabled={anyPending}
              className="rounded-lg border border-abv-border px-4 py-2 text-sm text-abv-text disabled:opacity-50"
            >
              Not yet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolStatusRow({ row }: { row: ToolRow }) {
  const running = row.status === "running";
  const error = row.status === "error";
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-abv-text-secondary">
      <span
        className={
          error
            ? "h-1.5 w-1.5 rounded-full bg-red-500"
            : running
              ? "h-1.5 w-1.5 animate-pulse rounded-full bg-abv-ai-tools"
              : "h-1.5 w-1.5 rounded-full bg-green-500"
        }
      />
      <span>{row.summary || toolLabel(row.name)}</span>
    </div>
  );
}

function toolLabel(name: string): string {
  if (name === "get_facts") return "Looking up your facts…";
  if (name === "build_script") return "Drafting your script…";
  if (name === "save_script") return "Saving…";
  return name;
}

function labelForSlot(slot: string): string {
  switch (slot) {
    case "market_update":
      return "Market update";
    case "neighbourhood_fact":
      return "Neighbourhood fact";
    case "contrarian_take":
      return "Contrarian take";
    case "do_not":
      return "Do-not warning";
    case "should_you":
      return "Should-you question";
    default:
      return slot;
  }
}
