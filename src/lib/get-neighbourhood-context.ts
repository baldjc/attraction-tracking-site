// Wave 1.5 — Neighbourhood Knowledge Base
// Helper consumed by Wave 3 Script Builder. Returns a map of
// `neighbourhood -> context string` for the requested set of neighbourhoods.
// Default mode is "summary" (the ~200-word Claude distillation), which is what
// Script Builder injects into Claude's context. Members can opt into "full"
// for richer context when accuracy matters more than tokens.

import prisma from "@/lib/prisma";

export type NeighbourhoodContextMode = "summary" | "full";

export async function getNeighbourhoodContext(
  userId: string,
  neighbourhoods: string[],
  mode: NeighbourhoodContextMode = "summary",
): Promise<Record<string, string>> {
  if (!neighbourhoods.length) return {};
  const profiles = await prisma.neighbourhoodProfile.findMany({
    where: { userId, neighbourhood: { in: neighbourhoods } },
    select: { neighbourhood: true, content: true, summary: true },
  });

  return Object.fromEntries(
    profiles.map((p) => [
      p.neighbourhood,
      mode === "summary" ? (p.summary ?? p.content.slice(0, 500)) : p.content,
    ]),
  );
}
