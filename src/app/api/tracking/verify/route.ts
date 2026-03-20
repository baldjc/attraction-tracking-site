import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { CORS_HEADERS } from "@/lib/tracking-utils";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const headers = { ...CORS_HEADERS, "Content-Type": "application/json" };
  const refCode = req.nextUrl.searchParams.get("refCode");
  if (!refCode) return NextResponse.json({ found: false }, { headers });

  const click = await prisma.click.findFirst({
    where: { refCode },
    select: { id: true },
  });

  return NextResponse.json({ found: !!click }, { headers });
}
