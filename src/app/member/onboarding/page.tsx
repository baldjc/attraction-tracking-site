import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { mapServiceTierToCohort } from "@/lib/onboarding-tier";
import OnboardingWizardClient from "@/components/onboarding/OnboardingWizardClient";

/**
 * /member/onboarding — tier-aware multi-step setup wizard.
 *
 * Server component: resolves the member, their tier cohort, and whether the
 * DWY-only Voice Guide step (Step 7) should appear (gated by feature flag).
 * Anyone who already finished the wizard is bounced back to the dashboard so
 * they don't accidentally redo work.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ rerun?: string }>;
}) {
  const { rerun } = await searchParams;
  // Completed members can re-open the wizard from Settings ("Run Again"), which
  // links here with ?rerun=1. Without the flag, finished members are bounced to
  // the dashboard so they don't accidentally redo work.
  const isRerun = rerun === "1";

  const sessionUser = await resolveUserFromSession();
  if (!sessionUser) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      serviceTier: true,
      onboardingStep: true,
      onboardingCompletedAt: true,
      onboardingSkippedAt: true,
    },
  });

  if (!dbUser) {
    redirect("/login");
  }

  // Already finished — don't show the wizard again unless they explicitly asked
  // to re-run it from Settings. They can also revisit pieces via
  // /member/market-data/setup and /member/knowledge-base.
  if (dbUser.onboardingCompletedAt && !isRerun) {
    redirect("/member/dashboard");
  }

  const cohort = mapServiceTierToCohort(dbUser.serviceTier);
  const flags = await getFeatureFlags({
    userId: sessionUser.id,
    userRole: sessionUser.role,
  });
  const voiceGuideEnabled = !!flags.tool_member_voice_guide;

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-gray-950 py-10 px-4">
      <OnboardingWizardClient
        cohort={cohort}
        voiceGuideEnabled={voiceGuideEnabled}
        startStep={isRerun ? 1 : Math.max(1, (dbUser.onboardingStep ?? 0) + 1)}
      />
    </main>
  );
}
