import prisma from "@/lib/prisma";
import { requireMarketAccess } from "@/lib/market-config-server";

export async function GET() {
  const access = await requireMarketAccess();
  if (!access.ok) return access.response;

  const rows = await prisma.marketDataUpload.findMany({
    where: { userId: access.user.id },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      label: true,
      monthYear: true,
      csvFileName: true,
      rowCount: true,
      status: true,
      uploadedAt: true,
      validatedAt: true,
      validationError: true,
      nextAttemptAt: true,
      // Wave 6a — two-phase readiness. On the instant-cutover path `status`
      // flips to `validated` (numbers ready) while `storyStatus` tracks the
      // separate AI story-leads pass. Flag OFF ⇒ storyStatus stays
      // `not_started`, so the table renders exactly as before (parity).
      storyStatus: true,
      storyError: true,
      _count: {
        select: {
          facts: true,
          storyLeads: true,
        },
      },
    },
  });

  // Lightweight companion query: ids of uploads that have stored validator
  // output. Kept separate from the list select above so we never pull the large
  // rawValidatorOutput blob just to render a boolean.
  const withRawRows = await prisma.marketDataUpload.findMany({
    where: { userId: access.user.id, NOT: { rawValidatorOutput: null } },
    select: { id: true },
  });
  const withRawSet = new Set(withRawRows.map((r) => r.id));

  const uploads = rows.map(({ _count, storyStatus, storyError, ...rest }) => ({
    ...rest,
    factCount: _count.facts,
    storyLeadCount: _count.storyLeads,
    hasValidatorOutput: withRawSet.has(rest.id),
    // Wave 6a — only surface the two-phase story fields once the instant-cutover
    // path has actually engaged them. With the flag OFF storyStatus is always
    // "not_started", so these keys are omitted entirely and the payload stays
    // byte-identical to before (strict parity).
    ...(storyStatus && storyStatus !== "not_started"
      ? { storyStatus, storyError }
      : {}),
  }));

  return Response.json({ uploads });
}
