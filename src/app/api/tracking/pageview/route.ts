import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isBot, CORS_HEADERS } from "@/lib/tracking-utils";

function normPath(raw: string): string {
  try {
    return new URL(raw).pathname.toLowerCase().replace(/\/$/, "") || "/";
  } catch {
    return raw.split("?")[0].split("#")[0].toLowerCase().replace(/\/$/, "") || "/";
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const headers = { ...CORS_HEADERS, "Content-Type": "application/json" };

  try {
    const { session_id, page_url, member_id } = await req.json();
    if (!session_id || !member_id) {
      return NextResponse.json({ error: "session_id and member_id required" }, { status: 400, headers });
    }

    const ua = req.headers.get("user-agent");
    if (isBot(ua)) return NextResponse.json({ success: true }, { headers });

    const [click, member] = await Promise.all([
      prisma.click.findFirst({ where: { sessionId: session_id } }),
      prisma.user.findUnique({ where: { id: member_id }, select: { thankYouPageUrl: true } }),
    ]);

    if (!click) return NextResponse.json({ success: true }, { headers });

    await prisma.pageView.create({
      data: { clickId: click.id, pageUrl: page_url ?? "" },
    });

    if (member?.thankYouPageUrl && page_url) {
      const saved = normPath(member.thankYouPageUrl);
      const current = normPath(page_url);
      if (current === saved) {
        await prisma.lead.upsert({
          where: { clickId: click.id },
          create: { clickId: click.id },
          update: {},
        });
      }
    }

    return NextResponse.json({ success: true }, { headers });
  } catch (err) {
    console.error("[tracking/pageview]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers });
  }
}
