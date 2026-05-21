// Wave 1.5 — Neighbourhood Knowledge Base
// Server-only auth gate for /api/member/knowledge-base/* routes. Mirrors
// `market-config-server.requireMarketAccess()` exactly so behaviour stays
// uniform across the data-first surfaces. Lives in a separate file because it
// imports `next/headers` via `session-utils`.

import { getFeatureFlags } from "@/lib/feature-flags";
import {
  resolveUserFromSession,
  type ResolvedUser,
} from "@/lib/session-utils";

export interface KnowledgeBaseAccessOk {
  ok: true;
  user: ResolvedUser;
}
export interface KnowledgeBaseAccessDenied {
  ok: false;
  response: Response;
}

export async function requireKnowledgeBaseAccess(): Promise<
  KnowledgeBaseAccessOk | KnowledgeBaseAccessDenied
> {
  const user = await resolveUserFromSession();
  if (!user) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  }
  const flags = await getFeatureFlags({
    userId: user.id,
    userRole: user.role,
  });
  if (!flags.tool_neighbourhood_knowledge) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    };
  }
  return { ok: true, user };
}
