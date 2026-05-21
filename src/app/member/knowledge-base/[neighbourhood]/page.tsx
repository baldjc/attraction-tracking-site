import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getMarketConfigForUser } from "@/lib/market-config-server";
import NeighbourhoodDetailClient from "@/components/knowledge-base/NeighbourhoodDetailClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ neighbourhood: string }>;
}

export default async function NeighbourhoodDetailPage({ params }: PageProps) {
  const { neighbourhood: encoded } = await params;
  const neighbourhood = decodeURIComponent(encoded);

  const user = await resolveUserFromSession();
  if (!user) redirect("/login");

  const flags = await getFeatureFlags({
    userId: user.id,
    userRole: user.role,
  });
  if (!flags.tool_neighbourhood_knowledge) redirect("/member/dashboard");

  const config = await getMarketConfigForUser(user.id);
  if (!config) redirect("/member/market-data/setup");

  if (!config.neighbourhoodVocab.includes(neighbourhood)) {
    notFound();
  }

  const profile = await prisma.neighbourhoodProfile.findUnique({
    where: {
      userId_neighbourhood: {
        userId: user.id,
        neighbourhood,
      },
    },
    select: {
      neighbourhood: true,
      content: true,
      summary: true,
      sourceFile: true,
      uploadBatchId: true,
      lastUpdatedAt: true,
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <a
            href="/member/knowledge-base"
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            ← Back to Knowledge Base
          </a>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {neighbourhood}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            {config.marketName}
          </p>
        </div>
      </header>

      <NeighbourhoodDetailClient
        marketName={config.marketName}
        mlsSource={config.mlsSource}
        neighbourhood={neighbourhood}
        initial={
          profile
            ? {
                content: profile.content,
                summary: profile.summary,
                sourceFile: profile.sourceFile,
                lastUpdatedAt: profile.lastUpdatedAt.toISOString(),
              }
            : null
        }
      />
    </div>
  );
}
