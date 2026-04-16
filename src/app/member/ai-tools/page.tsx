import { auth } from "@/lib/auth";
import { getFeatureFlags, DEFAULT_FLAGS } from "@/lib/feature-flags";
import { isListingVideoBuilderTester } from "@/lib/listing-video-builder-access";
import AIToolsHub from "@/components/ai-tools/AIToolsHub";
import PageHeader from "@/components/PageHeader";
import AIToolsUsageLink from "@/components/ai-tools/AIToolsUsageLink";

export default async function AIToolsHubPage() {
  const session = await auth();
  const role = (session?.user as any)?.role as string;
  const email = session?.user?.email ?? null;

  const baseFlags =
    role === "admin" || role === "editor"
      ? { ...DEFAULT_FLAGS }
      : await getFeatureFlags();

  // Testing override: force the Listing Video Builder ON for allowlisted
  // member emails, even if the global flag is OFF. Remove once the tool
  // is rolled out to all eligible tiers.
  const featureFlags = isListingVideoBuilderTester(email)
    ? { ...baseFlags, tool_listing_video_builder: true }
    : baseFlags;

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
