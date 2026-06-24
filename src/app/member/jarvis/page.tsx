import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import {
  loadLatestValidatedUpload,
  loadMarketConfigSummary,
} from "@/lib/content-engine-context";
import { getAvatarData } from "@/lib/avatar-utils";
import JarvisChat, {
  type InitialMessage,
  type ThreadSummary,
  type JarvisContext,
} from "@/components/jarvis/JarvisChat";
import { listThreadSummaries } from "@/lib/jarvis/thread-summaries";
import type { MessageContent, ProposalState, ToolCallRecord, IdeasState } from "@/lib/jarvis/types";

export const dynamic = "force-dynamic";

/** "2026-05" → "May 2026" (deterministic en-US). Null-safe. */
function formatMonthLabel(monthYear: string | null): string | null {
  if (!monthYear) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(monthYear);
  if (!m) return monthYear;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (Number.isNaN(d.getTime())) return monthYear;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Collapse whitespace and clip to a single-line preview for the context panel. */
function truncateText(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** The built-in default voice register, summarised for the context chip. */
const DEFAULT_VOICE_SUMMARY =
  "Jarvis writes in a warm, plain-spoken, lightly-dry default style — clear and confident, never hypey. Want it to sound exactly like you? Upload your own voice doc.";

/**
 * Derive up to 4 SHORT bullets from the member's avatar spec for the context
 * panel — so the popover shows concise takeaways instead of the full
 * multi-thousand-character spec wall. Deterministic (no model call → nothing to
 * regenerate or cache): prefers the spec's own list items, falling back to its
 * leading sentences. Presentation only; the orchestrator loads the raw avatar
 * server-side and is untouched by this.
 */
function deriveAvatarBullets(raw: string): string[] {
  const clean = (s: string) =>
    s
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`>#]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const bullets: string[] = [];
  for (const line of raw.split("\n")) {
    const m = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (!m) continue;
    const text = clean(m[1]);
    if (text.length < 3) continue;
    bullets.push(truncateText(text, 110));
    if (bullets.length >= 4) break;
  }
  if (bullets.length > 0) return bullets;

  // No list items — fall back to the first few sentences.
  const prose = clean(
    raw.replace(/```[\s\S]*?```/g, " ").replace(/^\s{0,3}#{1,6}\s+/gm, ""),
  );
  return prose
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 3)
    .map((s) => truncateText(s, 110));
}

export default async function JarvisPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; browse?: string }>;
}) {
  const user = await resolveUserFromSession();
  if (!user) redirect("/login");

  const flags = await getFeatureFlags({ userId: user.id, userRole: user.role });
  if (!flags.tool_jarvis) redirect("/member/dashboard");

  const { thread: requestedThreadId, browse } = await searchParams;
  // `?browse=1` arrives from the content-ideas front doors (dashboard / planner
  // buttons, briefing link, retired-wizard redirect) and opens the three-path
  // chooser on mount instead of a blank chat.
  const openBrowse = browse === "1";

  const [memberRecord, threads, latestUpload, avatarData, marketConfig] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { fullName: true },
      }),
      // Threads with at least one message — newest first, content-titled — for the
      // history switcher and to resolve the active thread.
      listThreadSummaries(user.id),
      loadLatestValidatedUpload(user.id),
      // Impersonation-aware: getAvatarData resolves the borrowed member's avatar
      // when an admin is testing. loadMarketConfigSummary holds voice + market.
      getAvatarData(user.id),
      loadMarketConfigSummary(user.id),
    ]);

  const memberFirstName =
    (memberRecord?.fullName ?? "").trim().split(/\s+/)[0] || null;
  const currentDataMonth = latestUpload?.monthYear ?? null;

  // Context header chips — real ContentProfile data, never fabricated. Each chip
  // shows a short label; the panel shows the detail. This is read-only display;
  // it does not feed the orchestrator (that loads its own context server-side).
  const voiceGuide = marketConfig?.voiceGuide?.trim() || null;
  const marketName = marketConfig?.marketName?.trim() || null;
  const avatarName = avatarData.avatarName?.trim() || null;
  // Prefer the avatar's own SHORT summary field (a 2–3 sentence paragraph) over
  // the avatarSummary column, and NEVER the full_document spec wall. The bullets
  // are derived from this short source so the chip can never dump the raw spec.
  const avatarProfileSummary =
    typeof (avatarData.avatarProfile as { avatar_summary?: unknown } | null)
      ?.avatar_summary === "string"
      ? (
          avatarData.avatarProfile as { avatar_summary: string }
        ).avatar_summary.trim()
      : "";
  const avatarSummary =
    avatarProfileSummary || avatarData.avatarSummary?.trim() || null;
  const currentMonthLabel = formatMonthLabel(currentDataMonth);
  const avatarBullets = avatarSummary ? deriveAvatarBullets(avatarSummary) : [];

  // Voice chip — reflects the member's ACTIVE choice, never their name. Custom
  // is active only when a guide is on file AND voiceMode isn't "default". The
  // label shows the source file (or a neutral "Your custom voice"), never a
  // derived sentence. The live switcher lives in JarvisChat (this is the
  // server-rendered initial state).
  const voiceMode: "default" | "custom" =
    marketConfig?.voiceMode === "default" ? "default" : "custom";
  // Match the Script Builder gate's threshold (voiceGuide.length >= 500): a
  // shorter "guide" never produces an override, so for display/selection it does
  // NOT count as a custom voice. This keeps the chip, the selector, and what the
  // generation loop actually applies in agreement.
  const hasCustomGuide = !!voiceGuide && voiceGuide.length >= 500;
  const customVoiceActive = hasCustomGuide && voiceMode === "custom";
  const voiceSourceLabel =
    marketConfig?.voiceGuideSourceFile?.trim() || "Your custom voice";
  const context: JarvisContext = {
    voice: {
      label: customVoiceActive
        ? truncateText(voiceSourceLabel, 60)
        : "Default voice",
      detail: customVoiceActive
        ? "Jarvis writes in your uploaded voice. Switch back to the default register anytime."
        : DEFAULT_VOICE_SUMMARY,
    },
    avatar: {
      label: avatarName ?? "Not set yet",
      bullets: avatarBullets.length > 0 ? avatarBullets : undefined,
      detail:
        avatarBullets.length > 0
          ? "Who Jarvis writes for."
          : avatarName
            ? "Your ideal-viewer avatar."
            : "Build your ideal-viewer avatar so Jarvis can target the right buyer or seller.",
    },
    market: {
      label: marketName ?? "Not set yet",
      detail: marketName
        ? currentMonthLabel
          ? `Grounded in your ${currentMonthLabel} market data.`
          : "No validated market data uploaded yet."
        : "Set your market so Jarvis can ground scripts in your numbers.",
    },
  };

  // Resolve the active thread:
  //  - `?thread=new` is the explicit "fresh conversation" sentinel → no thread,
  //    empty context (never falls back to a past thread).
  //  - an owned `?thread=<id>` wins.
  //  - an unknown/unowned `?thread=` falls back to the most-recent thread.
  //  - no param → EMPTY. A cold/fresh login starts clean instead of dumping a
  //    stale most-recent thread. The client (resumeEligible) may still reopen the
  //    thread THIS browser session last had active, so reloads mid-session resume.
  const isNewConversation = requestedThreadId === "new";
  const resumeEligible = !isNewConversation && !requestedThreadId;
  let activeThread: ThreadSummary | null = null;
  if (!isNewConversation && requestedThreadId) {
    activeThread =
      threads.find((t) => t.id === requestedThreadId) ?? threads[0] ?? null;
  }

  // Key the client component so a thread switch (query-param navigation)
  // remounts it with the selected thread's messages instead of preserving
  // stale local state.
  const activeKey = isNewConversation ? "new" : activeThread?.id ?? "empty";

  let initialMessages: InitialMessage[] = [];
  if (activeThread) {
    const rows = await prisma.contentManagerMessage.findMany({
      where: { threadId: activeThread.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        toolCalls: true,
        proposalState: true,
        ideasState: true,
      },
    });
    initialMessages = rows
      .map((r): InitialMessage | null => {
        const c = r.content as unknown as MessageContent;
        if (r.role === "user" && c?.kind === "text") {
          return { id: r.id, role: "user", text: c.text };
        }
        if (r.role === "assistant" && c?.kind === "text") {
          return {
            id: r.id,
            role: "assistant",
            text: c.text,
            toolCalls: (r.toolCalls as ToolCallRecord[] | null) ?? undefined,
            proposal: (r.proposalState as ProposalState | null) ?? undefined,
            ideas: (r.ideasState as IdeasState | null) ?? undefined,
          };
        }
        return null;
      })
      .filter((m): m is InitialMessage => m !== null);
  }

  return (
    <JarvisChat
      key={activeKey}
      memberId={user.id}
      threadId={activeThread?.id ?? null}
      activeThreadMonth={activeThread?.dataMonth ?? null}
      currentDataMonth={currentDataMonth}
      threads={threads}
      initialMessages={initialMessages}
      memberFirstName={memberFirstName}
      context={context}
      resumeEligible={resumeEligible}
      initialVoiceMode={customVoiceActive ? "custom" : "default"}
      hasCustomGuide={hasCustomGuide}
      customVoiceLabel={truncateText(voiceSourceLabel, 60)}
      voiceDefaultSummary={DEFAULT_VOICE_SUMMARY}
      voiceManageHref="/member/market-data/setup"
      openBrowseOnMount={openBrowse}
    />
  );
}
