import { getFeatureFlags } from "@/lib/feature-flags";
import AIToolsHub from "@/components/ai-tools/AIToolsHub";
import PageHeader from "@/components/PageHeader";
import AIToolsUsageLink from "@/components/ai-tools/AIToolsUsageLink";
export default async function AIToolsHubPage() {
  const featureFlags = await getFeatureFlags();
  return (
    <>
      <PageHeader
        emoji="✨"
        title="AI Tools"
        description="Your content team that never sleeps."
        action={<AIToolsUsageLink basePath="/member/ai-tools" />}
      />
      <AIToolsHub basePath="/member/ai-tools" featureFlags={featureFlags} />
    </>
  );
}
