import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { withRouteErrorHandling } from "@/lib/api-error-wrapper";

export const GET = withRouteErrorHandling("member/leads", GET_impl);

async function GET_impl() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leads = await prisma.lead.findMany({
    where: {
      click: {
        link: {
          campaign: {
            userId: user.id,
            deletedAt: null,
          },
        },
      },
    },
    include: {
      click: {
        include: {
          pageViews: { orderBy: { timestamp: "asc" } },
          link: {
            select: {
              id: true,
              name: true,
              youtubeVideoUrl: true,
              youtubeThumbnailUrl: true,
              campaign: { select: { id: true, name: true, sourceType: true } },
            },
          },
        },
      },
    },
    orderBy: { timestamp: "desc" },
    take: 500,
  });

  return NextResponse.json(leads);
}
