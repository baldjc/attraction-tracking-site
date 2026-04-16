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

  const isPrivileged = role === "admin" || role === "editor";

  const baseFlags = isPrivileged
    ? { ...DEFAULT_FLAGS }
    : await getFeatureFlags();

  // Admins/editors always see the Listing Video Builder (DEFAULT_FLAGS has it
  // off by default; force it on for privileged roles).
  // Testing override: also force it ON for allowlisted member emails so they
  // can test the member experience. Remove allowlist once tool is rolled out.
  const featureFlags =
    isPrivileged || isListingVideoBuilderTester(email)
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
