import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const leads = await prisma.lead.findMany({
    where: {
      click: {
        link: {
          campaign: {
            ...(isAdmin ? {} : { userId: user.id }),
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
            include: {
              campaign: { select: { id: true, name: true } },
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
