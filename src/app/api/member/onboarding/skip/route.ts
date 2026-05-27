import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";

/**
 * POST /api/member/onboarding/skip
 *
 * Member chose "Save and finish later" from any wizard step. We stamp
 * `onboardingSkippedAt` so the dashboard nudge banner can prompt them to
 * resume. `onboardingStep` is left at whatever the wizard last persisted so
 * the resume link can drop them at the right place.
 */
export async function POST() {
  const user = await resolveUserFromSession();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { onboardingSkippedAt: new Date() },
  });

  return Response.json({ ok: true });
}
