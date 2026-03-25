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

    // Fallback: most recent click for this ref_code in the last 24h
    if (!click) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      click = await prisma.click.findFirst({
        where: { refCode: ref_code, timestamp: { gte: cutoff } },
        orderBy: { timestamp: "desc" },
      });
    }

    // Silently succeed if no matching click found — do not error
    if (!click) {
      console.log(`[returning-visit] no click found for ref_code=${ref_code} session_id=${session_id ?? "none"}`);
      return NextResponse.json({ success: true }, { headers });
    }

    // Only stamp "returning" — never overwrite an already-classified "new"
    if (click.visitorType !== "new") {
      await prisma.click.update({
        where: { id: click.id },
        data: { visitorType: "returning" },
      });
      console.log(`[returning-visit] stamped click=${click.id} as returning`);
    } else {
      console.log(`[returning-visit] click=${click.id} already "new" — not overwriting`);
    }

    return NextResponse.json({ success: true }, { headers });
  } catch (err) {
    console.error("[tracking/returning-visit]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers });
  }
}
