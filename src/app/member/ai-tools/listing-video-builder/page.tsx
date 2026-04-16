import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";
import { isListingVideoBuilderTester } from "@/lib/listing-video-builder-access";
import ListingVideoBuilderTool from "@/components/ai-tools/ListingVideoBuilderTool";

export default async function ListingVideoBuilderPage() {
  const session = await auth();
  const role = (session?.user as any)?.role as string;
  const email = session?.user?.email ?? null;

  // Admins and editors always pass. Everyone else must either be on the
  // tester allowlist OR have the global flag enabled.
  let calendarEnabled = true;
  if (role !== "admin" && role !== "editor") {
    const flags = await getFeatureFlags();
    calendarEnabled = flags?.content_calendar !== false;
    const allowed =
      flags.tool_listing_video_builder === true ||
      isListingVideoBuilderTester(email);
    if (!allowed) redirect("/member/ai-tools");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <ListingVideoBuilderTool basePath="/member/ai-tools" calendarEnabled={calendarEnabled} />
    </div>
  );
}
