/**
 * POST /api/jarvis/research
 *
 * Research Reader ingest. The member attaches 1–5 EXTERNAL research items in
 * chat (PDF / pasted text / URL / chart-image); we read each one, extract a
 * {thesis, claims[], stats[]} summary, and persist a `ResearchSource` row tied
 * to the thread. Nothing here drafts or publishes — it only makes the attached
 * material available to Jarvis as the "outside lens" on the NEXT chat turn.
 *
 * Accepts EITHER:
 *   - multipart/form-data: `files` (one or more PDF/image), repeated `url`,
 *     repeated `text`, optional `threadId`.
 *   - application/json: `{ threadId?, urls?: string[], texts?: string[] }`.
 *
 * Returns `{ threadId, sources: [...], failures: [...] }`. An unreadable item
 * is ALWAYS reported as a failure — it is never silently dropped (acceptance b).
 *
 * Gated behind the `tool_jarvis` feature flag, the same as the chat turn.
 */
import { type NextRequest } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import prisma from "@/lib/prisma";
import {
  ingestResearchItems,
  type ResearchInputItem,
} from "@/lib/jarvis/research-ingest";
import { loadLatestValidatedUpload } from "@/lib/content-engine-context";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonError(status: number, error: string, message?: string): Response {
  return new Response(JSON.stringify(message ? { error, message } : { error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const MAX_ITEMS = 5;

export async function POST(req: NextRequest) {
  const resolved = await resolveUserFromSession();
  if (!resolved) return jsonError(401, "Unauthorized");
  const userId = resolved.id;

  const flags = await getFeatureFlags({ userId, userRole: resolved.role });
  if (!flags.tool_jarvis) return jsonError(404, "not_enabled");

  const items: ResearchInputItem[] = [];
  // Items rejected before ingest (e.g. empty uploads) — reported as failures so
  // nothing the member attached is ever silently dropped (acceptance b).
  const preFailures: { type: string; sourceRef: string; reason: string }[] = [];
  let threadId: string | null = null;

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const tid = form.get("threadId");
      if (typeof tid === "string" && tid.trim()) threadId = tid.trim();

      for (const f of form.getAll("files")) {
        if (f instanceof File && f.size > 0) {
          const isImage = (f.type || "").startsWith("image/");
          items.push({
            type: isImage ? "image" : "pdf",
            file: f,
            title: f.name || undefined,
          });
        } else if (f instanceof File) {
          // Zero-byte upload — report it, don't drop it.
          preFailures.push({
            type: (f.type || "").startsWith("image/") ? "image" : "pdf",
            sourceRef: f.name || "(empty file)",
            reason: "the file was empty",
          });
        }
      }
      for (const u of form.getAll("url")) {
        if (typeof u === "string" && u.trim()) {
          items.push({ type: "url", url: u.trim() });
        }
      }
      for (const t of form.getAll("text")) {
        if (typeof t === "string" && t.trim()) {
          items.push({ type: "text", text: t });
        }
      }
    } else {
      const body = (await req.json()) as {
        threadId?: string;
        urls?: unknown;
        texts?: unknown;
      };
      if (typeof body.threadId === "string" && body.threadId.trim()) {
        threadId = body.threadId.trim();
      }
      if (Array.isArray(body.urls)) {
        for (const u of body.urls) {
          if (typeof u === "string" && u.trim()) {
            items.push({ type: "url", url: u.trim() });
          }
        }
      }
      if (Array.isArray(body.texts)) {
        for (const t of body.texts) {
          if (typeof t === "string" && t.trim()) {
            items.push({ type: "text", text: t });
          }
        }
      }
    }
  } catch {
    return jsonError(400, "invalid_request");
  }

  if (items.length === 0) {
    // Everything attached failed before ingest (e.g. only empty files) — still
    // report those failures rather than dropping them silently.
    if (preFailures.length > 0) {
      return new Response(
        JSON.stringify({ threadId, sources: [], failures: preFailures }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return jsonError(400, "no_research_items");
  }
  if (items.length > MAX_ITEMS) {
    return jsonError(
      400,
      "too_many_items",
      `You can attach up to ${MAX_ITEMS} research items at a time.`,
    );
  }

  // Resolve / create the thread (ownership-filtered). Research is tied to a
  // thread so the chat turn can surface exactly this batch as the outside lens.
  if (threadId) {
    const owned = await prisma.contentManagerThread.findFirst({
      where: { id: threadId, userId },
      select: { id: true },
    });
    if (!owned) return jsonError(404, "thread_not_found");
  } else {
    const latestUpload = await loadLatestValidatedUpload(userId);
    const created = await prisma.contentManagerThread.create({
      data: {
        userId,
        title: "Research",
        dataMonth: latestUpload?.monthYear ?? null,
      },
      select: { id: true },
    });
    threadId = created.id;
  }

  const result = await ingestResearchItems({ userId, threadId, items });

  return new Response(
    JSON.stringify({
      threadId,
      sources: result.sources.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        sourceRef: s.sourceRef,
      })),
      failures: [...preFailures, ...result.failures],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
