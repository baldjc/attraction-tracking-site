import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { calendarToken: true },
  });
  if (!dbUser) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!dbUser.calendarToken) {
    dbUser = await prisma.user.update({
      where: { id: user.id },
      data: { calendarToken: randomUUID() },
      select: { calendarToken: true },
    });
  }

  const token = dbUser.calendarToken!;
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://members.attractionbyvideo.com";
  const url = `${baseUrl}/api/calendar/${token}`;

  return NextResponse.json({ token, url });
}
