import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { prisma } from "@/lib/prisma";
import { withRouteErrorHandling } from "@/lib/api-error-wrapper";

export const GET = withRouteErrorHandling("member/changelog", GET_impl);

async function GET_impl() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.changelogEntry.findMany({
    where: { published: true, type: "changelog" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json({ entries });
}
