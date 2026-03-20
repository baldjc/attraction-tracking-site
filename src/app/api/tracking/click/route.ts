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

    console.log(`[click] IN ref=${ref_code} member=${member_id} page_url=${page_url}`);

    if (!ref_code || !member_id) {
      return NextResponse.json({ error: "ref_code and member_id required" }, { status: 400, headers });
    }

    const ua = req.headers.get("user-agent");
    if (isBot(ua)) {
      console.log(`[click] SKIP bot`);
      return NextResponse.json({ session_id: null }, { headers });
    }

    const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("x-real-ip")
      ?? null;

    // SERVER-SIDE DEDUP: if this exact ref_code + IP already fired within 30 seconds,
    // return the existing session_id without creating another click record.
    if (rawIp) {
      const dedupCutoff = new Date(Date.now() - 30 * 1000);
      const existing = await prisma.click.findFirst({
        where: { refCode: ref_code, ipAddress: rawIp, timestamp: { gte: dedupCutoff } },
        orderBy: { timestamp: "desc" },
      });
      if (existing) {
        console.log(`[click] DEDUP — returning existing click=${existing.id} session=${existing.sessionId}`);
        return NextResponse.json({ session_id: existing.sessionId }, { headers });
      }
    }

    const member = await prisma.user.findUnique({
      where: { id: member_id },
      select: { id: true, thankYouPageUrl: true },
    });
    if (!member) {
      console.log(`[click] REJECT unknown member ${member_id}`);
      return NextResponse.json({ error: "Invalid member" }, { status: 400, headers });
    }

    console.log(`[click] member thankYouPageUrl="${member.thankYouPageUrl ?? "NULL"}"`);

    const link = await prisma.trackingLink.findFirst({
      where: { refCode: ref_code, deletedAt: null },
    });
    if (!link) {
      console.log(`[click] REJECT unknown ref_code ${ref_code}`);
      return NextResponse.json({ error: "Invalid ref_code" }, { status: 400, headers });
    }

    // If this page IS the thank-you page, attribute the lead to the most recent
    // existing click for this ref_code rather than creating a duplicate click.
    if (member.thankYouPageUrl && page_url) {
      const saved = normPath(member.thankYouPageUrl);
      const current = normPath(page_url);
      const isMatch = current === saved;
      console.log(`[click] TY check: current="${current}" saved="${saved}" match=${isMatch}`);

      if (isMatch) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentClick = await prisma.click.findFirst({
          where: { refCode: ref_code, timestamp: { gte: cutoff } },
          orderBy: { timestamp: "desc" },
        });
        console.log(`[click] recentClick=${recentClick?.id ?? "NONE"}`);

        if (recentClick) {
          await prisma.lead.upsert({
            where: { clickId: recentClick.id },
            create: { clickId: recentClick.id },
            update: {},
          });
          console.log(`[click] LEAD CREATED for existing click ${recentClick.id}`);
          return NextResponse.json({ session_id: null }, { headers });
        }
        // No recent click — fall through and create a new click+lead
        console.log(`[click] No recent click found, creating new click+lead`);
      }
    } else {
      console.log(`[click] TY check SKIPPED: thankYouPageUrl="${member.thankYouPageUrl ?? "NULL"}" page_url="${page_url ?? "NULL"}"`);
    }

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

    // Edge case: no prior click within 24h — create new click and lead together
    if (member.thankYouPageUrl && page_url) {
      const saved = normPath(member.thankYouPageUrl);
      const current = normPath(page_url);
      if (current === saved) {
        await prisma.lead.upsert({
          where: { clickId: click.id },
          create: { clickId: click.id },
          update: {},
        });
        console.log(`[click] LEAD CREATED (new click edge case) click=${click.id}`);
      }
    }

    console.log(`[click] OK new click=${click.id} session=${sessionId}`);
    return NextResponse.json({ session_id: sessionId }, { headers });
  } catch (err) {
    console.error("[click] ERROR", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers });
  }
}
