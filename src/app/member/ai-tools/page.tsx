import { getFeatureFlags } from "@/lib/feature-flags";
import AIToolsHub from "@/components/ai-tools/AIToolsHub";

export default async function AIToolsHubPage() {
  const featureFlags = await getFeatureFlags();
  return <AIToolsHub basePath="/member/ai-tools" featureFlags={featureFlags} />;
}
