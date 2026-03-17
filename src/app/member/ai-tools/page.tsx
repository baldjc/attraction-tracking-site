import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";
import AIToolsHub from "@/components/ai-tools/AIToolsHub";

export default async function AIToolsHubPage() {
  const session = await auth();
  const isAdmin = (session?.user as any)?.role === "admin";
  const featureFlags = isAdmin ? null : await getFeatureFlags();

  return <AIToolsHub basePath="/member/ai-tools" featureFlags={featureFlags} />;
}
