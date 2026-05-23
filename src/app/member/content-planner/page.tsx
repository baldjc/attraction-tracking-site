import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ContentPlannerWrapper from "./ContentPlannerWrapper";
import { auth } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/feature-flags";

export default async function ContentPlannerPage() {
  // Wave 2 (additive): show the AI wizard entry point when the flag is on
  // for this member. The existing inline "Add Video" flow on
  // ContentPlannerClient is untouched — both entry points coexist.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const userRole = session?.user?.role ?? null;
  const flags = userId
    ? await getFeatureFlags({ userId, userRole })
    : { tool_content_engine_v2: false };

  return (
    <>
      <PageHeader
        emoji="📅"
        title="Content Planner"
        description="Plan, track, and manage your entire video pipeline in one place."
      />
      {flags.tool_content_engine_v2 && (
        <div className="mx-auto mb-4 flex max-w-7xl items-center justify-end px-4 sm:px-6 lg:px-8">
          <Link
            href="/member/content-planner/wizard?step=1"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <span aria-hidden>✨</span> New Content (AI)
          </Link>
        </div>
      )}
      <ContentPlannerWrapper />
    </>
  );
}
