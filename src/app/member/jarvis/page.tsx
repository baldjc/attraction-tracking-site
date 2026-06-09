import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { loadLatestValidatedUpload } from "@/lib/content-engine-context";
import JarvisChat, {
  type InitialMessage,
  type ThreadSummary,
} from "@/components/jarvis/JarvisChat";
import type { MessageContent, ProposalState, ToolCallRecord } from "@/lib/jarvis/types";

export const dynamic = "force-dynamic";

export default async function JarvisPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const user = await resolveUserFromSession();
  if (!user) redirect("/login");

  const flags = await getFeatureFlags({ userId: user.id, userRole: user.role });
  if (!flags.tool_jarvis) redirect("/member/dashboard");

  const { thread: requestedThreadId } = await searchParams;

  const [memberRecord, threadRows, latestUpload] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true },
    }),
    // Threads with at least one message — newest first — for the history
    // switcher and to resolve the active thread.
    prisma.contentManagerThread.findMany({
      where: { userId: user.id, messages: { some: {} } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, title: true, dataMonth: true, updatedAt: true },
    }),
    loadLatestValidatedUpload(user.id),
  ]);

  const memberFirstName =
    (memberRecord?.fullName ?? "").trim().split(/\s+/)[0] || null;
  const currentDataMonth = latestUpload?.monthYear ?? null;

  const threads: ThreadSummary[] = threadRows.map((t) => ({
    id: t.id,
    title: t.title,
    dataMonth: t.dataMonth,
    updatedAt: t.updatedAt.toISOString(),
  }));

  // Resolve the active thread:
  //  - `?thread=new` is the explicit "fresh conversation" sentinel → no thread,
  //    empty context (never falls back to a past thread).
  //  - an owned `?thread=<id>` wins.
  //  - an unknown/unowned `?thread=` falls back to the most-recent thread.
  //  - no param → most-recent thread, so history survives reloads.
  const isNewConversation = requestedThreadId === "new";
  let activeThread: (typeof threadRows)[number] | null = null;
  if (!isNewConversation) {
    if (requestedThreadId) {
      activeThread =
        threadRows.find((t) => t.id === requestedThreadId) ??
        threadRows[0] ??
        null;
    } else {
      activeThread = threadRows[0] ?? null;
    }
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
          };
        }
        return null;
      })
      .filter((m): m is InitialMessage => m !== null);
  }

  return (
    <JarvisChat
      key={activeKey}
      threadId={activeThread?.id ?? null}
      activeThreadMonth={activeThread?.dataMonth ?? null}
      currentDataMonth={currentDataMonth}
      threads={threads}
      initialMessages={initialMessages}
      memberFirstName={memberFirstName}
    />
  );
}
