import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import { loadAreaStats } from "@/lib/kb-merge/area-stats";

export const runtime = "nodejs";
// One bounded CSV read of the latest validated upload — give modest room.
export const maxDuration = 30;

/**
 * GET /api/member/knowledge-base/area-stats
 *
 * Read-only per-raw-name decision data for the cleanup / vocab lists: homes,
 * sold count, city (when available), and a sample address (when available),
 * sourced from the member's latest validated upload CSV. Degrades to an empty
 * `available:false` payload on any failure so the UI just shows plain names.
 * Impersonation-aware via requireKnowledgeBaseAccess.
 */
export async function GET() {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  try {
    const result = await loadAreaStats(access.user.id);
    return Response.json(result);
  } catch (err) {
    console.error("[kb-merge][api] area-stats failed", err);
    return Response.json(
      { stats: {}, hasCity: false, hasAddress: false, monthYear: null, available: false },
      { status: 200 },
    );
  }
}
