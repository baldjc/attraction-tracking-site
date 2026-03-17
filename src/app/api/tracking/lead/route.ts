import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isBot, CORS_HEADERS } from "@/lib/tracking-utils";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const headers = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    const { ref_code, session_id, member_id } = await req.json();
    if (!ref_code || !session_id || !member_id) {
      return NextResponse.json({ error: "ref_code, session_id, and member_id required" }, { status: 400, headers });
    }

    const ua = req.headers.get("user-agent");
    if (isBot(ua)) return NextResponse.json({ success: true }, { headers });

    const click = await prisma.click.findFirst({
      where: { sessionId: session_id, refCode: ref_code },
    });
    if (!click) return NextResponse.json({ success: true }, { headers });

    const existing = await prisma.lead.findUnique({ where: { clickId: click.id } });
    if (!existing) {
      await prisma.lead.create({ data: { clickId: click.id } });
    }

    return NextResponse.json({ success: true }, { headers });
  } catch (err) {
    console.error("[tracking/lead]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers });
  }
}
