import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function adminOnly(role: string | undefined) {
  return !role || role !== "admin";
}

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entries = await prisma.serviceWaitlistEntry.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      package: {
        select: {
          id: true,
          name: true,
          price: true,
          category: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      user: e.user,
      package: {
        id: e.package.id,
        name: e.package.name,
        price: e.package.price,
        category: e.package.category,
      },
    })),
    count: entries.length,
  });
}
