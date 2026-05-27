import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";

/**
 * PATCH /api/member/onboarding/progress
 *
 * Body: { step?: number, completed?: boolean }
 *
 * - `step`: persists the last completed step (0-9).
 * - `completed: true`: marks the wizard fully done (sets onboardingCompletedAt,
 *   clears onboardingSkippedAt, and flips the legacy onboardingComplete flag
 *   so existing surfaces — dashboard banner, OnboardingRedirect — stop nudging).
 *
 * Either field on its own is valid; passing neither is a 400.
 */
export async function PATCH(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const step =
    typeof body?.step === "number" && Number.isFinite(body.step)
      ? Math.max(0, Math.min(9, Math.trunc(body.step)))
      : null;
  const completed = body?.completed === true;

  if (step === null && !completed) {
    return Response.json(
      { error: "missing step or completed" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(step !== null ? { onboardingStep: step } : {}),
      ...(completed
        ? {
            onboardingCompletedAt: new Date(),
            onboardingSkippedAt: null,
            onboardingComplete: true,
          }
        : {}),
    },
  });

  return Response.json({ ok: true });
}
