import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor, editorTierFilter } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tierFilter = editorTierFilter(role);

  const audits = await prisma.audit.findMany({
    where: tierFilter ? { user: tierFilter } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, fullName: true, email: true, serviceTier: true } },
    },
  });

  return NextResponse.json({ audits });
}
