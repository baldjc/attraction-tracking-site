import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags, DEFAULT_FLAGS } from "@/lib/feature-flags";
import { isListingVideoBuilderTester } from "@/lib/listing-video-builder-access";
import AIToolsHub from "@/components/ai-tools/AIToolsHub";
import AIToolsUsageLink from "@/components/ai-tools/AIToolsUsageLink";

export default async function AIToolsHubPage() {
  // role = real account role (privilege check); email = resolved member email so
  // the tester allowlist reflects the member being impersonated.
  const resolved = await resolveUserFromSession();
  const role = resolved?.role as string;
  const email = resolved?.email ?? null;

  const isPrivileged = role === "admin" || role === "editor";

  const baseFlags = isPrivileged
    ? { ...DEFAULT_FLAGS }
    : await getFeatureFlags();

  const featureFlags =
    isPrivileged || isListingVideoBuilderTester(email)
      ? { ...baseFlags, tool_listing_video_builder: true }
      : baseFlags;

  return (
    <div className="font-sans text-[var(--abv-text)]">
      <header className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--abv-azure-tint)] text-[var(--abv-azure)] text-[11px] font-bold uppercase tracking-[0.12em]">
            <span className="w-[5px] h-[5px] rounded-full bg-[var(--abv-azure)]" />
            Members tools
          </span>
          <h1 className="font-display text-[48px] font-black tracking-[-0.03em] leading-[1.05] mt-3.5 mb-3 max-w-[720px]">
            Build, write, <span className="text-[var(--abv-azure)]">review</span>.
          </h1>
          <p className="text-[15.5px] text-[var(--abv-text-muted)] m-0 max-w-[620px] leading-[1.55]">
            Five tools that turn your channel into a system. Use them in this order until they become muscle memory.
          </p>
        </div>
        <AIToolsUsageLink basePath="/member/content-tools" />
      </header>
      <AIToolsHub basePath="/member/content-tools" featureFlags={featureFlags} />
    </div>
  );
}
