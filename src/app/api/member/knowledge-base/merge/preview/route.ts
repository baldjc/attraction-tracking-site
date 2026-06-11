import { NextRequest } from "next/server";
import { requireKnowledgeBaseAccess } from "@/lib/knowledge-base-server";
import { previewCombinedSamples } from "@/lib/kb-merge/merge-run";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/member/knowledge-base/merge/preview
 * body: { variants: string[] }
 *
 * Read-only: returns the combined "sold" sample a proposed master would carry
 * from the latest validated upload, and whether it clears the member's floor.
 * Used to show a live count before confirming a manual merge.
 */
export async function POST(req: NextRequest) {
  const access = await requireKnowledgeBaseAccess();
  if (!access.ok) return access.response;

  let body: { variants?: unknown };
  try {
    body = (await req.json()) as { variants?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const variants = Array.isArray(body.variants)
    ? body.variants.filter((v): v is string => typeof v === "string")
    : [];

  try {
    const result = await previewCombinedSamples(access.user.id, variants);
    return Response.json(result);
  } catch (err) {
    console.error("[kb-merge][api] preview failed", err);
    return Response.json(
      { error: "Could not compute a preview." },
      { status: 500 },
    );
  }
}
