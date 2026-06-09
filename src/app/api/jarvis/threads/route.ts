/**
 * GET /api/jarvis/threads
 *
 * Lists the member's Content Manager (Jarvis) chat threads for the history
 * switcher — newest first, ownership-scoped. Empty threads (created but never
 * sent to) are excluded so the switcher only shows real conversations.
 *
 * Thread management only — no change to the chat loop, grounding, or context
 * assembly. Admins reach this as the impersonated member via the shared
 * session resolver, same as the chat page.
 */
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const userId = resolved.id;

  const flags = await getFeatureFlags({ userId, userRole: resolved.role });
  if (!flags.tool_jarvis) {
    return new Response(JSON.stringify({ error: "not_enabled" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const rows = await prisma.contentManagerThread.findMany({
    where: { userId, messages: { some: {} } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, dataMonth: true, updatedAt: true },
  });

  const threads = rows.map((t) => ({
    id: t.id,
    title: t.title,
    dataMonth: t.dataMonth,
    updatedAt: t.updatedAt.toISOString(),
  }));

  return new Response(JSON.stringify({ threads }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
