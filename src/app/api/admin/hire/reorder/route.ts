import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function adminOnly(role: string | undefined) {
  return !role || role !== "admin";
}

export async function PUT(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || adminOnly(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { type, items } = body as { type: "category" | "package"; items: { id: string; sortOrder: number }[] };

  await Promise.all(
    items.map((item) => {
      if (type === "category") {
        return prisma.serviceCategory.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
      } else {
        return prisma.servicePackage.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
      }
    })
  );

  return NextResponse.json({ success: true });
}
