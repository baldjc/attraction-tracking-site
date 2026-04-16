import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const staff = await prisma.user.findMany({
    where: { role: { in: ["admin", "editor"] } },
    select: { id: true, fullName: true, email: true, role: true },
    orderBy: { fullName: "asc" },
  });
  return NextResponse.json({
    staff: staff.map((s) => ({ id: s.id, name: s.fullName || s.email, email: s.email, role: s.role })),
  });
}
