import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isBot, generateSessionId, geolocateIp, CORS_HEADERS } from "@/lib/tracking-utils";

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
    const { ref_code, page_url, member_id } = await req.json();
    if (!ref_code || !member_id) {
      return NextResponse.json({ error: "ref_code and member_id required" }, { status: 400, headers });
    }

    const ua = req.headers.get("user-agent");
    if (isBot(ua)) {
      return NextResponse.json({ session_id: null }, { headers });
    }

    const member = await prisma.user.findUnique({
      where: { id: member_id },
      select: { id: true, thankYouPageUrl: true },
    });
    if (!member) return NextResponse.json({ error: "Invalid member" }, { status: 400, headers });

    const link = await prisma.trackingLink.findFirst({
      where: { refCode: ref_code, deletedAt: null },
    });
    if (!link) return NextResponse.json({ error: "Invalid ref_code" }, { status: 400, headers });

    const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("x-real-ip")
      ?? null;

    const [geo, sessionId] = await Promise.all([
      geolocateIp(rawIp ?? ""),
      Promise.resolve(generateSessionId()),
    ]);

    const click = await prisma.click.create({
      data: {
        trackingLinkId: link.id,
        refCode: ref_code,
        sessionId,
        ipAddress: rawIp,
        city: geo.city,
        province: geo.province,
        country: geo.country,
        userAgent: ua,
        referrer: req.headers.get("referer"),
      },
    });

    await prisma.pageView.create({
      data: { clickId: click.id, pageUrl: page_url ?? "" },
    });

    if (member.thankYouPageUrl && page_url) {
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

    return NextResponse.json({ session_id: sessionId }, { headers });
  } catch (err) {
    console.error("[tracking/click]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers });
  }
}
