import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import JarvisChat, { type InitialMessage } from "@/components/jarvis/JarvisChat";
import type { MessageContent, ProposalState, ToolCallRecord } from "@/lib/jarvis/types";

export const dynamic = "force-dynamic";

export default async function JarvisPage() {
  const user = await resolveUserFromSession();
  if (!user) redirect("/login");

  const flags = await getFeatureFlags({ userId: user.id, userRole: user.role });
  if (!flags.tool_jarvis) redirect("/member/dashboard");

  const memberRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { fullName: true },
  });
  const memberFirstName =
    (memberRecord?.fullName ?? "").trim().split(/\s+/)[0] || null;

  // Rehydrate the member's most-recent thread (one chat per member, but we key
  // off the latest thread so history survives reloads).
  const thread = await prisma.contentManagerThread.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  let initialMessages: InitialMessage[] = [];
  if (thread) {
    const rows = await prisma.contentManagerMessage.findMany({
      where: { threadId: thread.id },
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
      threadId={thread?.id ?? null}
      initialMessages={initialMessages}
      memberFirstName={memberFirstName}
    />
  );
}
