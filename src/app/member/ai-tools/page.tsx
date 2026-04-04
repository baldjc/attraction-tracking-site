import { auth } from "@/lib/auth";
import { getFeatureFlags, DEFAULT_FLAGS } from "@/lib/feature-flags";
import AIToolsHub from "@/components/ai-tools/AIToolsHub";
import PageHeader from "@/components/PageHeader";
import AIToolsUsageLink from "@/components/ai-tools/AIToolsUsageLink";
export default async function AIToolsHubPage() {
  const session = await auth();
  const role = (session?.user as any)?.role as string;
  const featureFlags =
    role === "admin" || role === "editor"
      ? { ...DEFAULT_FLAGS }
      : await getFeatureFlags();
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
