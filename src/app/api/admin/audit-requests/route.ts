import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdmin } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const requests = await prisma.auditRequest.findMany({
    orderBy: [
      { status: "asc" },
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json({ requests });
}
