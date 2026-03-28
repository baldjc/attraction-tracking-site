import { getFeatureFlags } from "@/lib/feature-flags";
import AIToolsHub from "@/components/ai-tools/AIToolsHub";
import PageHeader from "@/components/PageHeader";
import AIToolsUsageLink from "@/components/ai-tools/AIToolsUsageLink";
import { SparklesIcon } from "@heroicons/react/24/outline";

export default async function AIToolsHubPage() {
  const featureFlags = await getFeatureFlags();
  return (
    <>
      <PageHeader
        icon={SparklesIcon}
        title="AI Tools"
        description="Your content team that never sleeps."
        colour="#6ba3c7"
        action={<AIToolsUsageLink basePath="/member/ai-tools" />}
      />
      <AIToolsHub basePath="/member/ai-tools" featureFlags={featureFlags} />
    </>
  );
}
