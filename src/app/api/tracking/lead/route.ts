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
    if (!ref_code || !member_id) {
      return NextResponse.json({ error: "ref_code and member_id required" }, { status: 400, headers });
    }

    const ua = req.headers.get("user-agent");
    if (isBot(ua)) return NextResponse.json({ success: true }, { headers });

    let click = null;

    // Primary: match by session_id + ref_code (most precise)
    if (session_id) {
      click = await prisma.click.findFirst({
        where: { sessionId: session_id, refCode: ref_code },
      });
    }

    // Fallback: most recent click for this ref_code in the last 24h.
    // Handles the common case where sessionStorage is wiped by a cross-origin
    // form submission redirect before landing on the thank-you page.
    if (!click) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      click = await prisma.click.findFirst({
        where: { refCode: ref_code, timestamp: { gte: cutoff } },
        orderBy: { timestamp: "desc" },
      });
    }

    if (!click) {
      console.log(`[lead] no click found for ref_code=${ref_code} session_id=${session_id ?? "none"}`);
      return NextResponse.json({ success: true }, { headers });
    }

    const existing = await prisma.lead.findUnique({ where: { clickId: click.id } });
    if (!existing) {
      await prisma.lead.create({ data: { clickId: click.id } });
      console.log(`[lead] CREATED for click=${click.id} ref_code=${ref_code}`);
    } else {
      console.log(`[lead] already exists for click=${click.id}`);
    }

    return NextResponse.json({ success: true }, { headers });
  } catch (err) {
    console.error("[tracking/lead]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers });
  }
}
