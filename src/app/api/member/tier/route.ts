import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { withRouteErrorHandling } from "@/lib/api-error-wrapper";

export const GET = withRouteErrorHandling("member/tier", GET_impl);

async function GET_impl() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { serviceTier: true, clientHubEnabled: true },
  });

  return NextResponse.json({
    serviceTier: dbUser?.serviceTier ?? "foundations",
    clientHubEnabled: dbUser?.clientHubEnabled ?? true,
  });
}
