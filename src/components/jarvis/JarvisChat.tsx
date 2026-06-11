"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ClockIcon,
  SparklesIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  MicrophoneIcon,
  PaperAirplaneIcon,
  PlusIcon,
  UserCircleIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "@/components/ToastProvider";
import type { ProposalState, ToolCallRecord } from "@/lib/jarvis/types";
import { buildMlsVerifyLine } from "@/lib/mls-verify-reminder";
import { clearJarvisSeed, consumeJarvisSeed } from "@/lib/jarvis/seed";
import ContextPanel from "@/components/jarvis/ContextPanel";

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

/** A past conversation, shown in the history switcher. */
export interface ThreadSummary {
  id: string;
  title: string;
  dataMonth: string | null;
  updatedAt: string;
}

/** One row in the "What Jarvis knows about you" context panel. */
export interface JarvisContextItem {
  /** Short value shown on the chip (e.g. the market name, "Custom voice"). */
  label: string;
  /** Longer description shown in the panel. */
  detail: string;
  /**
   * Optional short bullet points shown in the panel INSTEAD of `detail`. Used by
   * the avatar row so the popover shows ~3–4 concise takeaways rather than the
   * full multi-thousand-character avatar spec. Presentation only.
   */
  bullets?: string[];
}

/** Real ContentProfile context for the header chips + panel (read-only). */
export interface JarvisContext {
  voice: JarvisContextItem;
  avatar: JarvisContextItem;
  market: JarvisContextItem;
  /** Where "Update my context" routes (the member's settings surface). */
  updateHref: string;
}

/** "2026-05" → "May 2026". Falls back to the raw value if unparseable. */
function formatDataMonth(monthYear: string | null): string | null {
  if (!monthYear) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(monthYear);
  if (!m) return monthYear;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (Number.isNaN(date.getTime())) return monthYear;
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** ISO timestamp → coarse relative label ("just now", "2 days ago"). */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  if (day < 30) {
    const w = Math.floor(day / 7);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  if (day < 365) {
    const mo = Math.floor(day / 30);
    return `${mo} month${mo === 1 ? "" : "s"} ago`;
  }
  const yr = Math.floor(day / 365);
  return `${yr} year${yr === 1 ? "" : "s"} ago`;
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

/** A research item attached this thread, shown as a read/failed status chip. */
interface ResearchChip {
  id: string;
  label: string;
  status: "read" | "failed";
}

const SUGGESTIONS = [
  "What's happening in my market right now?",
  "Draft a market-update video from my latest numbers",
  "Give me a contrarian-take video idea",
];

/** Compact quick-reply chips shown above the composer. */
const QUICK_REPLIES = [
  "What's happening in my market?",
  "Draft a market update",
  "Give me a contrarian take",
];

export default function JarvisChat({
  memberId,
  threadId: initialThreadId,
  activeThreadMonth,
  currentDataMonth,
  threads: initialThreads,
  initialMessages,
  memberFirstName,
  context,
  resumeEligible = false,
  initialVoiceMode = "custom",
  hasCustomGuide = false,
  customVoiceLabel = "Your custom voice",
  voiceDefaultSummary = "Jarvis writes in the built-in default voice register.",
  voiceManageHref = "/member/market-data/setup",
}: {
  memberId: string;
  threadId: string | null;
  activeThreadMonth: string | null;
  currentDataMonth: string | null;
  threads: ThreadSummary[];
  initialMessages: InitialMessage[];
  memberFirstName: string | null;
  context: JarvisContext;
  /**
   * True only on a bare (no `?thread=`) page load — NOT on `?thread=new`. When
   * set, the client may resume the conversation last active in THIS browser
   * session (sessionStorage), but a cold/fresh login (no marker) stays empty.
   */
  resumeEligible?: boolean;
  /** Member's active voice selection (server-rendered initial state). */
  initialVoiceMode?: "default" | "custom";
  /** Whether a substantive voice guide is on file (gates the "My voice" option). */
  hasCustomGuide?: boolean;
  /** Label for the custom voice (source filename or a neutral fallback). */
  customVoiceLabel?: string;
  /** Summary of the built-in default register, shown when default is active. */
  voiceDefaultSummary?: string;
  /** Where the member uploads / manages their voice guide. */
  voiceManageHref?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [threads, setThreads] = useState<ThreadSummary[]>(initialThreads);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  // The active thread was started under an OLDER data month than the current
  // latest validated upload → offer (never force) a fresh thread for the new
  // month. Dismissible; reappears only if the mismatch persists on next load.
  const monthMismatch =
    !!activeThreadMonth &&
    !!currentDataMonth &&
    activeThreadMonth !== currentDataMonth;
  const [monthBannerDismissed, setMonthBannerDismissed] = useState(false);
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
  // Research Reader — attached EXTERNAL sources for this thread, shown as
  // read/failed status chips. A failed item is always reported, never dropped.
  const [researchChips, setResearchChips] = useState<ResearchChip[]>([]);
  const [researchBusy, setResearchBusy] = useState(false);
  const [showResearchPanel, setShowResearchPanel] = useState(false);
  const [researchText, setResearchText] = useState("");
  // Voice selection — the member's ACTIVE voice (default register vs. their
  // uploaded guide). Switching persists via PATCH so the Script Builder reads it
  // on the next generation; we update locally so the chip reflects it instantly.
  const [voiceMode, setVoiceMode] = useState<"default" | "custom">(
    initialVoiceMode,
  );
  const [voiceBusy, setVoiceBusy] = useState(false);

  // REFINE mode — the planner video this thread is refining (seeded by the
  // planner "↻ Regenerate" hand-off). Sent on every turn so the build's proposal
  // routes an approved save BACK to this same plan. The ref mirrors state so the
  // `send` closure always reads the current target without re-creating.
  const [refinePlanId, setRefinePlanId] = useState<string | null>(null);
  const refinePlanIdRef = useRef<string | null>(null);
  refinePlanIdRef.current = refinePlanId;

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleVoiceSelect = useCallback(
    async (mode: "default" | "custom") => {
      if (voiceBusy || mode === voiceMode) return;
      if (mode === "custom" && !hasCustomGuide) {
        toast.info("Upload a voice doc first to write in your own voice.");
        return;
      }
      const prev = voiceMode;
      setVoiceMode(mode); // optimistic — the chip updates instantly
      setVoiceBusy(true);
      try {
        const res = await fetch("/api/member/voice-guide/upload", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceMode: mode }),
        });
        if (!res.ok) throw new Error("switch failed");
        toast.success(
          mode === "custom"
            ? "Jarvis will write in your voice."
            : "Jarvis will use the default voice.",
        );
      } catch {
        setVoiceMode(prev); // roll back on failure
        toast.error("Couldn't switch voice. Try again.");
      } finally {
        setVoiceBusy(false);
      }
    },
    [voiceBusy, voiceMode, hasCustomGuide, toast],
  );

  // The voice chip + panel reflect the LIVE selection (local state), not just
  // the server-rendered context. Custom is shown only when a guide is on file.
  const customVoiceActive = hasCustomGuide && voiceMode === "custom";
  const displayContext: JarvisContext = {
    ...context,
    voice: {
      label: customVoiceActive ? "My voice" : "Default voice",
      detail: customVoiceActive
        ? customVoiceLabel
          ? `Jarvis writes in your uploaded voice — ${customVoiceLabel}. Switch back to the default register anytime.`
          : "Jarvis writes in your uploaded voice. Switch back to the default register anytime."
        : voiceDefaultSummary,
    },
  };

  const ingestResearch = useCallback(
    async (build: (fd: FormData) => boolean) => {
      if (researchBusy || busy) return;
      const fd = new FormData();
      if (threadId) fd.append("threadId", threadId);
      if (!build(fd)) return;
      setResearchBusy(true);
      try {
        const resp = await fetch("/api/jarvis/research", {
          method: "POST",
          body: fd,
        });
        const data = (await resp.json().catch(() => null)) as {
          threadId?: string;
          sources?: Array<{ id: string; title: string }>;
          failures?: Array<{ sourceRef: string; reason: string }>;
          message?: string;
          error?: string;
        } | null;
        if (!resp.ok || !data) {
          toast.error(data?.message ?? "Couldn't read that research. Try again.");
          return;
        }
        if (typeof data.threadId === "string") setThreadId(data.threadId);
        const next: ResearchChip[] = [];
        for (const s of data.sources ?? []) {
          next.push({ id: s.id, label: s.title || "Untitled source", status: "read" });
        }
        for (const f of data.failures ?? []) {
          next.push({
            id: `fail-${f.sourceRef}-${Date.now()}-${next.length}`,
            label: `${f.sourceRef} — ${f.reason}`,
            status: "failed",
          });
        }
        setResearchChips((prev) => [...prev, ...next]);
        if ((data.sources?.length ?? 0) > 0) {
          toast.success(
            `Read ${data.sources!.length} research ${
              data.sources!.length === 1 ? "source" : "sources"
            }.`,
          );
        }
      } catch {
        toast.error("Couldn't read that research. Try again.");
      } finally {
        setResearchBusy(false);
      }
    },
    [busy, researchBusy, threadId, toast],
  );

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

      // Live-update the build_script tool pill's summary so the member watches
      // the real drafting stages roll by instead of a frozen "Drafting…".
      const updateBuildPill = (summary: string) =>
        setLiveTools((prev) => {
          const next = [...prev];
          const i = next.findIndex((t) => t.name === "build_script");
          if (i >= 0) next[i] = { ...next[i], status: "running", summary };
          else next.push({ name: "build_script", status: "running", summary });
          return next;
        });

      try {
        const resp = await fetch("/api/jarvis", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            threadId,
            message: trimmed,
            ...(refinePlanIdRef.current ? { refinePlanId: refinePlanIdRef.current } : {}),
          }),
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
              case "script_phase":
                // Surface the REAL build stage on the build_script pill instead
                // of a silent pause (load → intro → body → hook → validate).
                updateBuildPill(String(data.label ?? "Working…"));
                break;
              case "script_retry":
                // Be honest when a draft failed its content rules and is being
                // retried, rather than hiding it behind "…".
                updateBuildPill(
                  `Tightening the draft — fixing ${Number(data.count ?? 0)} content-rule issue${
                    Number(data.count ?? 0) === 1 ? "" : "s"
                  } (attempt ${Number(data.attempt ?? 0) + 2})…`,
                );
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
                          // F4: the live draft buffer (draftBuf) is the RAW stream
                          // and still carries internal slot markers ([STRESSOR BEAT],
                          // [LEAD MAGNET n/3], [VALUES BEAT n/2], [VISUAL: …], [CALLBACK]).
                          // Once the build resolves, swap the rendered draft to the
                          // FINAL server-cleaned proposal.script (markers stripped,
                          // stats softened) so the member never reads the scaffolding.
                          ...(proposal?.script
                            ? {
                                draft: proposal.script,
                                draftStatus: "done" as const,
                              }
                            : {}),
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

  // Planner "↻ Regenerate" → refine hand-off. Fetch the existing plan (+ its
  // script artifact) so Jarvis opens with the real script + title in context,
  // remember the refine target for this thread (so an approved save routes back
  // to the SAME plan), then auto-send an OPENER that makes Jarvis ASK what to
  // change — it must not blindly rebuild. Falls back to a context-less opener if
  // the plan fetch fails (the target is still set, so the save still routes back).
  const startRefineFromPlan = useCallback(
    async (planId: string, framing: string) => {
      setRefinePlanId(planId);
      refinePlanIdRef.current = planId;
      let title = "";
      let script = "";
      try {
        const [planRes, artRes] = await Promise.all([
          fetch(`/api/member/content-plans/${planId}`),
          fetch(`/api/member/content-plans/${planId}/artifacts`),
        ]);
        const planData = planRes.ok ? await planRes.json() : null;
        const artData = artRes.ok ? await artRes.json() : null;
        title = planData?.plan?.title ?? "";
        script =
          artData?.artifacts?.script?.[0]?.content || planData?.plan?.script || "";
      } catch {
        /* fall back to a context-less opener — the target plan is still set */
      }
      const opener = [
        framing.trim() ||
          "I'd like to refine an existing script for one of my planner videos.",
        title ? `\n\nVideo title: ${title}` : "",
        script ? `\n\nHere's the current script:\n\n---\n${script}\n---` : "",
        "\n\nDon't rewrite it yet — start by asking me what I'd like to change. " +
          "Keep everything that's working and only adjust what I ask for, staying " +
          "grounded in my real numbers and lead magnet.",
      ].join("");
      void send(opener);
    },
    [send],
  );

  // Dashboard "Build a script" hand-off. The dashboard stashes a one-shot,
  // member-scoped prompt and routes here with ?thread=new. On mount we READ +
  // REMOVE it (one-shot, ref-guarded against React double-invoke), but only
  // auto-send when it belongs to THIS member and the thread is genuinely empty.
  // Consuming unconditionally means a stale/foreign seed is cleared either way
  // and can never linger into a later "+ New conversation" or another member.
  // A seed carrying a `refinePlanId` enters refine mode instead (above).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const seed = consumeJarvisSeed(memberId);
    if (!seed) return;
    if (initialMessages.length > 0) return; // never inject into an existing convo
    if (seed.refinePlanId) {
      void startRefineFromPlan(seed.refinePlanId, seed.prompt);
    } else {
      void send(seed.prompt);
    }
  }, [memberId, initialMessages.length, send, startRefineFromPlan]);

  // Session-gated resume. On a BARE page load (resumeEligible — never the
  // explicit `?thread=new` fresh start), reopen the thread this browser session
  // last had active IF it still exists. A cold/fresh login has no marker, so it
  // stays empty instead of dumping a stale, weeks-old thread. Mount-only.
  const resumeCheckedRef = useRef(false);
  useEffect(() => {
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;
    if (!resumeEligible || threadId) return;
    let last: string | null = null;
    try {
      last = sessionStorage.getItem(`jarvis:lastThread:${memberId}`);
    } catch {
      return; // storage disabled → stay empty
    }
    if (last && initialThreads.some((t) => t.id === last)) {
      router.replace(`/member/jarvis?thread=${last}`);
    }
  }, [resumeEligible, threadId, memberId, initialThreads, router]);

  // Mark the active thread for THIS session so a same-session reload can resume
  // it (above). Cleared on "+ New conversation" for a guaranteed-empty start.
  useEffect(() => {
    if (!threadId) return;
    try {
      sessionStorage.setItem(`jarvis:lastThread:${memberId}`, threadId);
    } catch {
      /* private mode / storage disabled — resume just won't persist */
    }
  }, [threadId, memberId]);

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
            j.alreadySaved
              ? "Already in your Content Planner."
              : "Added to your Content Planner as a planned video.",
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

  // Start a genuinely fresh conversation: drop the active thread + all local
  // state so the next send creates a NEW thread (the route rebuilds context
  // per-thread, so an empty thread = clean model context — no carry-over of any
  // earlier refusal). Never deletes past threads; they stay in history. We also
  // clear the `?thread=` URL param so a reload doesn't reopen a stale thread.
  const newConversation = useCallback(() => {
    if (busy) return;
    abortRef.current?.abort();
    // Drop any pending dashboard seed so an explicit fresh start is ALWAYS
    // empty — a "+ New conversation" must never auto-fire a leftover prompt.
    clearJarvisSeed();
    // Forget the session resume marker so a later reload also stays empty.
    try {
      sessionStorage.removeItem(`jarvis:lastThread:${memberId}`);
    } catch {
      /* ignore */
    }
    // Leave refine mode — an explicit fresh start is a brand-new build, never a
    // continuation of the planner video we were refining.
    setRefinePlanId(null);
    refinePlanIdRef.current = null;
    setThreadId(null);
    setMessages([]);
    setResearchChips([]);
    setLiveTools([]);
    setInput("");
    setShowResearchPanel(false);
    setResearchText("");
    setHistoryOpen(false);
    setMonthBannerDismissed(true);
    // Navigate to the explicit "fresh" sentinel so a reload stays empty (the
    // bare URL would rehydrate the latest thread). page.tsx keys the component
    // on this, so it remounts clean.
    router.replace("/member/jarvis?thread=new");
  }, [busy, router, memberId]);

  // Open the history switcher and refresh the thread list so conversations
  // started this session (created on first send) show up immediately.
  const openHistory = useCallback(async () => {
    setHistoryOpen((v) => !v);
    try {
      const resp = await fetch("/api/jarvis/threads");
      if (!resp.ok) return;
      const data = (await resp.json()) as { threads?: ThreadSummary[] };
      if (Array.isArray(data.threads)) setThreads(data.threads);
    } catch {
      /* keep the SSR list on failure */
    }
  }, []);

  const greeting = memberFirstName ? `Hi ${memberFirstName}` : "Hi there";

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-abv-bg">
      <header className="border-b border-abv-border bg-abv-card px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <JarvisAvatar />
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 font-display text-xl font-bold leading-none text-abv-text">
                Jarvis
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" aria-label="online" />
              </h1>
              <p className="mt-1.5 text-sm text-abv-text-secondary">your Content Manager</p>
            </div>
          </div>
          <div className="relative flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-1.5 lg:flex">
              <ContextChip
                icon={MicrophoneIcon}
                label="Voice"
                value={displayContext.voice.label}
                onClick={() => setContextOpen((v) => !v)}
              />
              <ContextChip
                icon={UserCircleIcon}
                label="Avatar"
                value={context.avatar.label}
                onClick={() => setContextOpen((v) => !v)}
              />
              <ContextChip
                icon={MapPinIcon}
                label="Market"
                value={context.market.label}
                onClick={() => setContextOpen((v) => !v)}
              />
            </div>
            <button
              type="button"
              onClick={() => setContextOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={contextOpen}
              className="flex items-center gap-1.5 rounded-full border border-abv-border px-3 py-1.5 text-xs font-medium text-abv-text transition hover:border-abv-border-strong lg:hidden"
            >
              <SparklesIcon className="h-3.5 w-3.5 text-abv-ai-tools" aria-hidden />
              Context
            </button>
            {contextOpen && (
              <ContextPanel
                context={displayContext}
                onClose={() => setContextOpen(false)}
                voiceControl={{
                  mode: voiceMode,
                  hasCustomGuide,
                  busy: voiceBusy,
                  manageHref: voiceManageHref,
                  onSelect: handleVoiceSelect,
                }}
              />
            )}
            <div className="relative">
              <button
                type="button"
                onClick={openHistory}
                aria-haspopup="menu"
                aria-expanded={historyOpen}
                title="Your past conversations with Jarvis"
                className="flex items-center gap-1.5 rounded-full border border-abv-border px-3 py-1.5 text-xs font-medium text-abv-text transition hover:border-abv-border-strong"
              >
                <ClockIcon className="h-3.5 w-3.5" aria-hidden />
                History
              </button>
              {historyOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setHistoryOpen(false)}
                    aria-hidden
                  />
                  <div className="absolute right-0 z-20 mt-2 flex max-h-[26rem] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-abv-border bg-abv-card shadow-lg">
                    <div className="border-b border-abv-border px-3 py-2.5">
                      <p className="text-sm font-semibold text-abv-text">
                        Your conversations
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-abv-text-secondary">
                        Pick up where you left off with Jarvis.
                      </p>
                    </div>
                    <div className="overflow-y-auto p-1.5">
                      {threads.length === 0 ? (
                        <p className="px-3 py-6 text-center text-xs leading-relaxed text-abv-text-secondary">
                          No past conversations yet — start chatting and they’ll
                          appear here.
                        </p>
                      ) : (
                        threads.map((t) => {
                          const monthLabel = formatDataMonth(t.dataMonth);
                          const relative = formatRelative(t.updatedAt);
                          const meta = [relative, monthLabel]
                            .filter(Boolean)
                            .join(" · ");
                          const isActive = t.id === threadId;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              aria-current={isActive ? "true" : undefined}
                              onClick={() => {
                                setHistoryOpen(false);
                                if (t.id === threadId) return;
                                router.push(`/member/jarvis?thread=${t.id}`);
                              }}
                              className={`flex w-full flex-col items-start gap-0.5 rounded-lg border-l-2 px-3 py-2 text-left transition hover:bg-abv-bg ${
                                isActive
                                  ? "border-abv-ai-tools bg-abv-bg"
                                  : "border-transparent"
                              }`}
                            >
                              <span className="flex w-full items-center gap-2">
                                <span className="line-clamp-1 flex-1 text-sm font-medium text-abv-text">
                                  {t.title || "Untitled conversation"}
                                </span>
                                {isActive && (
                                  <span className="shrink-0 rounded-full bg-abv-ai-tools/15 px-1.5 py-0.5 text-[10px] font-medium text-abv-ai-tools">
                                    Active
                                  </span>
                                )}
                              </span>
                              {meta && (
                                <span className="text-[11px] text-abv-text-secondary">
                                  {meta}
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="border-t border-abv-border px-3 py-2">
                      <p className="text-[10.5px] leading-snug text-abv-text-secondary">
                        Conversations are kept for 30 days, then cleared
                        automatically. Saved scripts and your Planner are never
                        affected.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={newConversation}
              disabled={busy}
              className="rounded-full bg-abv-dark px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              + New conversation
            </button>
          </div>
        </div>

        {monthMismatch && !monthBannerDismissed && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-abv-border bg-abv-bg-warm px-4 py-2.5">
            <p className="text-xs text-abv-text">
              New market data for{" "}
              <span className="font-medium">{formatDataMonth(currentDataMonth)}</span> is in. Start a
              fresh conversation so I plan from the latest numbers.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={newConversation}
                disabled={busy}
                className="rounded-full bg-abv-dark px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                Start fresh
              </button>
              <button
                type="button"
                onClick={() => setMonthBannerDismissed(true)}
                className="rounded-full border border-abv-border px-3 py-1.5 text-xs text-abv-text transition hover:border-abv-border-strong"
              >
                Not now
              </button>
            </div>
          </div>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-abv-border bg-abv-card p-6">
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
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) {
              void ingestResearch((fd) => {
                for (const f of files.slice(0, 5)) fd.append("files", f);
                return true;
              });
            }
            e.target.value = "";
          }}
        />
        {researchChips.length > 0 && (
          <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-1.5">
            {researchChips.map((chip) => (
              <span
                key={chip.id}
                title={chip.label}
                className={`inline-flex max-w-[18rem] items-center gap-1 truncate rounded-full px-2.5 py-1 text-xs ${
                  chip.status === "read"
                    ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                }`}
              >
                <span>{chip.status === "read" ? "✓" : "⚠"}</span>
                <span className="truncate">{chip.label}</span>
              </span>
            ))}
          </div>
        )}
        {showResearchPanel && (
          <div className="mx-auto mb-2 max-w-3xl rounded-xl border border-abv-border bg-abv-card p-3">
            <textarea
              value={researchText}
              onChange={(e) => setResearchText(e.target.value)}
              rows={3}
              placeholder="Paste an article URL, or paste research text to read…"
              disabled={researchBusy}
              className="w-full resize-none rounded-lg border border-abv-border bg-abv-bg px-3 py-2 text-sm text-abv-text outline-none focus:border-abv-border-strong disabled:opacity-60"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                disabled={researchBusy}
                onClick={() => {
                  setShowResearchPanel(false);
                  setResearchText("");
                }}
                className="rounded-full border border-abv-border px-3 py-1.5 text-xs text-abv-text transition hover:border-abv-border-strong disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={researchBusy || !researchText.trim()}
                onClick={() => {
                  const value = researchText.trim();
                  if (!value) return;
                  const isUrl = /^https?:\/\/\S+$/i.test(value);
                  void ingestResearch((fd) => {
                    fd.append(isUrl ? "url" : "text", value);
                    return true;
                  });
                  setResearchText("");
                  setShowResearchPanel(false);
                }}
                className="rounded-full bg-abv-dark px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {researchBusy ? "Reading…" : "Add research"}
              </button>
            </div>
          </div>
        )}
        <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-1.5">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => send(q)}
              className="rounded-full border border-abv-border bg-abv-card px-3 py-1.5 text-xs text-abv-text transition hover:border-abv-border-strong disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2">
          <button
            type="button"
            disabled={busy || researchBusy}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-full border border-abv-border px-3 py-1.5 text-xs text-abv-text transition hover:border-abv-border-strong disabled:opacity-50"
          >
            <PlusIcon className="h-3.5 w-3.5" aria-hidden />
            {researchBusy ? "Reading…" : "Attach file/image"}
          </button>
          <button
            type="button"
            disabled={busy || researchBusy}
            onClick={() => setShowResearchPanel((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-abv-border px-3 py-1.5 text-xs text-abv-text transition hover:border-abv-border-strong disabled:opacity-50"
          >
            <PlusIcon className="h-3.5 w-3.5" aria-hidden />
            Add link/text
          </button>
        </div>
        <div className="mx-auto flex max-w-3xl items-end gap-1.5 rounded-2xl border border-abv-border bg-abv-card px-2 py-1.5 transition focus-within:border-abv-azure">
          <button
            type="button"
            onClick={() => toast.info("Voice input is coming soon.")}
            title="Voice input coming soon"
            aria-label="Voice input coming soon"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-abv-text-secondary transition hover:bg-abv-bg hover:text-abv-text"
          >
            <MicrophoneIcon className="h-5 w-5" aria-hidden />
          </button>
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
            className="max-h-40 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm text-abv-text outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-abv-dark text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <PaperAirplaneIcon className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] leading-relaxed text-abv-text-secondary">
          Jarvis proposes. You approve. Nothing is created or posted without your say-so.
        </p>
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
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-abv-text px-4 py-2.5 text-sm text-abv-bg">
          {message.text}
        </div>
      </div>
    );
  }

  // A freshly-created assistant turn before any token/tool/draft arrives →
  // show the typing indicator in place of an empty bubble.
  const showTyping =
    !message.text &&
    !message.draft &&
    !message.draftStatus &&
    !message.proposal &&
    (message.toolCalls?.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-2">
      {message.toolCalls?.map((t, i) => (
        <ToolStatusRow key={`${t.name}-${i}`} row={{ name: t.name, status: t.status, summary: t.summary }} />
      ))}

      {(message.text || showTyping) && (
        <div className="flex gap-2.5">
          <JarvisAvatar size="sm" />
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold text-abv-text-secondary">Jarvis</p>
            <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-abv-border bg-abv-card px-4 py-3 text-sm text-abv-text">
              {showTyping ? <TypingDots /> : <Markdown>{message.text}</Markdown>}
            </div>
          </div>
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
        ✓ Added to your Content Planner as a planned video. Refine and schedule it whenever you’re ready.
      </div>
    );
  }
  if (proposal.status === "declined") {
    return (
      <div className="max-w-[90%] rounded-2xl border border-abv-border bg-abv-card px-4 py-3 text-sm text-abv-text-secondary">
        <p>Draft dismissed. Changed your mind?</p>
        <button
          onClick={() => onAction(messageId, "reopen")}
          disabled={anyPending}
          className="mt-2 rounded-full border border-abv-border px-4 py-2 text-sm text-abv-text transition hover:border-abv-border-strong disabled:opacity-50"
        >
          {isPending("reopen") ? "Bringing it back…" : "Bring this draft back"}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[90%] rounded-2xl border border-abv-border bg-abv-card px-4 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-abv-azure">
        ⚡ Video idea · Proposed
      </p>
      <p className="mt-1.5 font-display text-lg font-bold leading-tight text-abv-text">
        “{proposal.title}”
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-abv-ai-tools/10 px-2 py-0.5 text-xs font-medium text-abv-ai-tools">
          {labelForSlot(proposal.rotationSlot)}
        </span>
        {sourceCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-abv-border px-2 py-0.5 text-xs text-abv-text-secondary">
            <ShieldCheckIcon className="h-3.5 w-3.5 text-green-600" aria-hidden />
            {sourceCount} source{sourceCount === 1 ? "" : "s"} cited
          </span>
        )}
      </div>

      {sourceCount > 0 && (
        <p className="mt-3 rounded-lg border border-abv-border bg-abv-bg-warm px-3 py-2 text-xs leading-relaxed text-abv-text-secondary">
          {buildMlsVerifyLine(proposal.dataPeriod)}
        </p>
      )}

      {proposal.status === "proposed" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => onAction(messageId, "confirming")}
            disabled={anyPending}
            className="rounded-full bg-abv-dark px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            Approve &amp; save
          </button>
          <button
            onClick={() => onAction(messageId, "decline")}
            disabled={anyPending}
            className="rounded-full border border-abv-border px-4 py-2 text-sm text-abv-text transition hover:border-abv-border-strong disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      {proposal.status === "confirming" && (
        <div className="mt-3">
          <p className="text-sm text-abv-text">Save this as a draft?</p>
          <p className="mt-1 text-xs text-abv-text-secondary">
            It’ll be added to your Content Planner as a planned video — nothing is published or
            scheduled, and you can edit it anytime.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => onAction(messageId, "save")}
              disabled={anyPending}
              className="rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {isPending("save") ? "Saving…" : "Yes, save it"}
            </button>
            <button
              onClick={() => onAction(messageId, "reopen")}
              disabled={anyPending}
              className="rounded-full border border-abv-border px-4 py-2 text-sm text-abv-text transition hover:border-abv-border-strong disabled:opacity-50"
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
  // Split a trailing " · detail" (e.g. "· CREB May 2026") into a mono tail.
  const [head, ...rest] = (row.summary || toolLabel(row.name)).split(" · ");
  const detail = rest.join(" · ");
  return (
    <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-abv-border bg-abv-card px-3 py-1.5 text-xs text-abv-text-secondary">
      {error ? (
        <XCircleIcon className="h-3.5 w-3.5 shrink-0 text-abv-crimson" aria-hidden />
      ) : running ? (
        <ArrowPathIcon
          className="h-3.5 w-3.5 shrink-0 animate-spin text-abv-ai-tools"
          aria-hidden
        />
      ) : (
        <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden />
      )}
      <span className="truncate text-abv-text">{head}</span>
      {detail && (
        <span className="shrink-0 font-mono text-abv-text-secondary">· {detail}</span>
      )}
    </div>
  );
}

function toolLabel(name: string): string {
  if (name === "get_facts") return "Looking up your facts…";
  if (name === "build_script") return "Drafting your script…";
  if (name === "save_script") return "Saving…";
  return name;
}

/** Movie clapperboard (slate) icon — no equivalent exists in Heroicons. */
function ClapperboardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
      <path d="m6.2 5.3 3.1 3.9" />
      <path d="m12.4 3.4 3.1 4" />
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

/** Jarvis identity avatar — blue gradient disc with a light ring + clapperboard. */
function JarvisAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8" : "h-11 w-11";
  const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span
      className={`${dim} inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-500 text-white ring-2 ring-sky-200 ring-offset-2 ring-offset-abv-card`}
    >
      <ClapperboardIcon className={icon} />
    </span>
  );
}

/** A single context chip in the header (desktop): icon + label + value. */
function ContextChip({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof MicrophoneIcon;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label}: ${value}`}
      aria-haspopup="dialog"
      className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border border-abv-border bg-abv-bg px-2.5 py-1 text-xs text-abv-text transition hover:border-abv-border-strong"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-abv-ai-tools" aria-hidden />
      <span className="shrink-0 text-abv-text-secondary">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </button>
  );
}

/** Three-dot typing indicator shown while an assistant turn is forming. */
function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-0.5" aria-label="Jarvis is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-abv-text-secondary"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
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
