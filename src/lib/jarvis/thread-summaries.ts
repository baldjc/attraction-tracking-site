/**
 * Builds the member-facing "past conversations" list for the Jarvis history
 * switcher. Shared by the chat page (SSR) and GET /api/jarvis/threads so both
 * derive the SAME human-readable title for every thread.
 *
 * Presentation/titling only — ownership-scoped (`where: { userId }`), newest
 * first, and empty threads (created but never sent to) are excluded. No change
 * to the chat loop, grounding, or context assembly.
 */
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { ProposalState } from "@/lib/jarvis/types";

/** A past conversation as shown in the history switcher. */
export interface ThreadSummaryData {
  id: string;
  /** Human-readable, content-derived display title (never a bare month). */
  title: string;
  dataMonth: string | null;
  updatedAt: string;
}

/** "2026-05" → "May 2026". Falls back to the raw value if unparseable. */
function formatDataMonth(monthYear: string | null): string | null {
  if (!monthYear) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(monthYear);
  if (!m) return monthYear;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (Number.isNaN(date.getTime())) return monthYear;
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function clip(s: string, n = 70): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/**
 * Derive a recognizable title from a thread's content, preferring (in order):
 *  1. the drafted video title, if the thread produced a script proposal;
 *  2. the first real user request (cleaning the dashboard "Build a script"
 *     hand-off prefix down to the story-lead title);
 *  3. the data month + creation date, only when there's no usable content.
 */
function deriveDisplayTitle(args: {
  rawTitle: string;
  proposalTitle: string | null;
  dataMonth: string | null;
  createdAt: Date;
}): string {
  const { rawTitle, proposalTitle, dataMonth, createdAt } = args;
  if (proposalTitle && proposalTitle.trim()) return clip(proposalTitle);

  const t = (rawTitle ?? "").trim();
  // Strip the "Build a script for this story lead: "<lead>"." hand-off prefix
  // so the entry reads as the topic, not the boilerplate instruction.
  const seed = /^Build a script for this story lead:\s*["“]?(.+?)["”]?\.?$/i.exec(t);
  if (seed && seed[1].trim()) return clip(seed[1]);

  if (t && t.toLowerCase() !== "new chat") return clip(t);

  // No usable content → data month + date fallback.
  const month = formatDataMonth(dataMonth);
  const day = createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return month ? `${month} conversation` : `Conversation · ${day}`;
}

/** Conversations are retained for 30 days of inactivity, then auto-pruned. */
export const JARVIS_RETENTION_DAYS = 30;

/**
 * Delete the member's Jarvis conversations untouched for more than
 * {@link JARVIS_RETENTION_DAYS} days (by `updatedAt`, i.e. last activity).
 * Messages cascade with the thread (schema onDelete: Cascade). This ONLY ever
 * touches `ContentManagerThread`/`ContentManagerMessage` — never the member's
 * Planner videos, saved drafts, or market facts (separate tables). Best-effort:
 * a delete failure must never block listing, so callers swallow errors.
 */
export async function pruneExpiredThreads(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - JARVIS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const res = await prisma.contentManagerThread.deleteMany({
    where: { userId, updatedAt: { lt: cutoff } },
  });
  return res.count;
}

/** List a member's Jarvis conversations, newest first, with derived titles. */
export async function listThreadSummaries(userId: string): Promise<ThreadSummaryData[]> {
  // Enforce retention wherever threads are listed (SSR page + threads API) so
  // expired conversations are cleared exactly once, consistently. Best-effort —
  // never let a prune failure break the history list.
  try {
    await pruneExpiredThreads(userId);
  } catch {
    /* retention is best-effort; listing must still succeed */
  }

  const rows = await prisma.contentManagerThread.findMany({
    where: { userId, messages: { some: {} } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, dataMonth: true, updatedAt: true, createdAt: true },
  });
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  // Latest script-proposal title per thread (the "drafted video title").
  const proposalRows = await prisma.contentManagerMessage.findMany({
    where: { threadId: { in: ids }, proposalState: { not: Prisma.DbNull } },
    orderBy: { createdAt: "desc" },
    select: { threadId: true, proposalState: true },
  });
  const proposalTitleByThread = new Map<string, string>();
  for (const r of proposalRows) {
    if (proposalTitleByThread.has(r.threadId)) continue; // desc order → first is latest
    const ps = r.proposalState as ProposalState | null;
    if (ps && typeof ps.title === "string" && ps.title.trim()) {
      proposalTitleByThread.set(r.threadId, ps.title.trim());
    }
  }

  return rows.map((r) => ({
    id: r.id,
    title: deriveDisplayTitle({
      rawTitle: r.title,
      proposalTitle: proposalTitleByThread.get(r.id) ?? null,
      dataMonth: r.dataMonth,
      createdAt: r.createdAt,
    }),
    dataMonth: r.dataMonth,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
