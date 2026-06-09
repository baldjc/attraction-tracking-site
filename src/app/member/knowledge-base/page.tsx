import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getMarketConfigForUser } from "@/lib/market-config-server";
import KnowledgeBaseClient from "@/components/knowledge-base/KnowledgeBaseClient";
import ManageNeighbourhoods from "@/components/knowledge-base/ManageNeighbourhoods";

export const dynamic = "force-dynamic";

export default async function KnowledgeBasePage() {
  const user = await resolveUserFromSession();
  if (!user) redirect("/login");

  const flags = await getFeatureFlags({
    userId: user.id,
    userRole: user.role,
  });
  if (!flags.tool_neighbourhood_knowledge) redirect("/member/dashboard");

  const config = await getMarketConfigForUser(user.id);
  if (!config) redirect("/member/market-data/setup");

  const profiles = await prisma.neighbourhoodProfile.findMany({
    where: { userId: user.id },
    select: {
      neighbourhood: true,
      summary: true,
      content: true,
      lastUpdatedAt: true,
    },
    orderBy: { neighbourhood: "asc" },
  });

  const profileMap = new Map(profiles.map((p) => [p.neighbourhood, p]));
  const cards = config.neighbourhoodVocab.map((n) => {
    const p = profileMap.get(n);
    return {
      neighbourhood: n,
      hasProfile: !!p,
      previewSummary: p?.summary
        ? p.summary.slice(0, 80)
        : p?.content?.slice(0, 80) ?? null,
      lastUpdatedAt: p?.lastUpdatedAt?.toISOString() ?? null,
    };
  });

  const recentUploads = await prisma.neighbourhoodResearchUpload.findMany({
    where: { userId: user.id },
    orderBy: { uploadedAt: "desc" },
    take: 5,
    select: {
      id: true,
      sourceFileName: true,
      toolUsed: true,
      profileCount: true,
      parsedAt: true,
      uploadedAt: true,
      parseCostUsd: true,
      unmatchedSections: true,
    },
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Neighbourhood Knowledge Base
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {config.marketName} · {config.neighbourhoodVocab.length}{" "}
          {config.neighbourhoodVocab.length === 1
            ? "neighbourhood"
            : "neighbourhoods"}{" "}
          configured
        </p>
      </header>

      <KnowledgeBaseClient
        marketName={config.marketName}
        mlsSource={config.mlsSource}
        neighbourhoods={config.neighbourhoodVocab}
        cards={cards}
        recentUploads={recentUploads.map((u) => ({
          id: u.id,
          sourceFileName: u.sourceFileName,
          toolUsed: u.toolUsed,
          profileCount: u.profileCount,
          parsedAt: u.parsedAt?.toISOString() ?? null,
          uploadedAt: u.uploadedAt.toISOString(),
          parseCostUsd: u.parseCostUsd,
          unmatchedSections: Array.isArray(u.unmatchedSections)
            ? (u.unmatchedSections as Array<{
                rawHeading: string;
                content: string;
              }>)
            : [],
        }))}
      />

      <ManageNeighbourhoods />
    </div>
  );
}
