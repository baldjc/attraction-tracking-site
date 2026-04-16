import prisma from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/feature-flags";

interface SaveArtifactArgs {
  contentPlanId: string | null | undefined;
  userId: string;
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Best-effort save of a PlanArtifact when a tool result is linked to a plan.
 * Returns true if the artifact was created, false otherwise. Never throws —
 * tool routes should not fail just because the planner save failed.
 *
 * Gated behind the `tool_planner_linkage` feature flag and ownership check.
 */
export async function maybeSavePlanArtifact(args: SaveArtifactArgs): Promise<{ saved: boolean; artifactId?: string }> {
  const { contentPlanId, userId, type, content, metadata } = args;
  if (!contentPlanId) return { saved: false };

  try {
    const flags = await getFeatureFlags();
    if (!flags.tool_planner_linkage) return { saved: false };

    const plan = await prisma.contentPlan.findFirst({ where: { id: contentPlanId, userId } });
    if (!plan) return { saved: false };

    const existing = await prisma.planArtifact.findFirst({
      where: { planId: plan.id, type, supersededById: null },
      orderBy: { version: "desc" },
    });
    const nextVersion = existing ? existing.version + 1 : 1;

    const created = await prisma.$transaction(async (tx) => {
      const newArtifact = await tx.planArtifact.create({
        data: {
          planId: plan.id,
          type,
          content,
          metadata: (metadata as never) ?? null,
          version: nextVersion,
        },
      });
      if (existing) {
        await tx.planArtifact.update({
          where: { id: existing.id },
          data: { supersededById: newArtifact.id },
        });
      }
      return newArtifact;
    });

    return { saved: true, artifactId: created.id };
  } catch (err) {
    console.error(`[save-plan-artifact] failed for type=${type}:`, err);
    return { saved: false };
  }
}
