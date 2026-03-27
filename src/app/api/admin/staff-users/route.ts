import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staff = await prisma.user.findMany({
    where: { role: { in: ["admin", "editor"] } },
    select: { id: true, fullName: true, email: true, role: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  return NextResponse.json({ staff });
}
