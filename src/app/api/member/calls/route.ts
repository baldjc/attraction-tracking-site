import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const calls = await prisma.clientCall.findMany({
    where: { userId: user.id },
    orderBy: { callDate: "desc" },
  });

  return NextResponse.json({ calls });
}
