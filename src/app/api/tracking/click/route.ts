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

    // SERVER-SIDE DEDUP: same ref_code + IP within 30s → return existing session.
    // But still check if THIS request is landing on the thank-you page so we can
    // create a lead against the existing click even when dedup fires.
    if (rawIp) {
      const dedupCutoff = new Date(Date.now() - 30 * 1000);
      const existing = await prisma.click.findFirst({
        where: { refCode: ref_code, ipAddress: rawIp, timestamp: { gte: dedupCutoff } },
        orderBy: { timestamp: "desc" },
        include: {
          link: {
            include: {
              campaign: {
                include: { user: { select: { id: true, thankYouPageUrl: true } } },
              },
            },
          },
        },
      });
      if (existing) {
        const dedupTyUrl = existing.link.campaign.user.thankYouPageUrl ?? null;
        if (dedupTyUrl && page_url) {
          const saved = normPath(dedupTyUrl);
          const current = normPath(page_url);
          if (current === saved) {
            await prisma.lead.upsert({
              where: { clickId: existing.id },
              create: { clickId: existing.id },
              update: {},
            });
            console.log(`[click] DEDUP — TY check: current="${current}" saved="${saved}" match=true → LEAD CREATED for click=${existing.id}`);
          } else {
            console.log(`[click] DEDUP — TY check: current="${current}" saved="${saved}" match=false`);
          }
        }
        console.log(`[click] DEDUP — returning existing click=${existing.id} session=${existing.sessionId}`);
        return NextResponse.json({ session_id: existing.sessionId }, { headers });
      }
    }

    // Look up the tracking link AND its campaign owner's thankYouPageUrl in one query.
    // We intentionally use the link's campaign owner — NOT the member_id from the snippet —
    // so that thankYouPageUrl is always resolved from the correct record, regardless of
    // whether the installed snippet has a stale or different member_id.
    const link = await prisma.trackingLink.findFirst({
      where: { refCode: ref_code, deletedAt: null },
      include: {
        campaign: {
          include: {
            user: { select: { id: true, thankYouPageUrl: true } },
          },
        },
      },
    });

    if (!link) {
      console.log(`[click] REJECT unknown ref_code ${ref_code}`);
      return NextResponse.json({ error: "Invalid ref_code" }, { status: 400, headers });
    }

    const linkOwner = link.campaign.user;
    const thankYouPageUrl = linkOwner.thankYouPageUrl ?? null;

    console.log(`[click] link owned by user=${linkOwner.id} (snippet sent member_id=${member_id}) thankYouPageUrl="${thankYouPageUrl ?? "NULL"}"`);

    // Also validate the member_id is a real user (snippet integrity check)
    const memberExists = await prisma.user.findUnique({
      where: { id: member_id },
      select: { id: true },
    });
    if (!memberExists) {
      console.log(`[click] REJECT unknown member_id ${member_id}`);
      return NextResponse.json({ error: "Invalid member" }, { status: 400, headers });
    }

    // If this page is the thank-you page, attribute the lead to the most recent
    // existing click for this ref_code rather than creating a duplicate click.
    if (thankYouPageUrl && page_url) {
      const saved = normPath(thankYouPageUrl);
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
        console.log(`[click] No recent click found, creating new click+lead`);
      }
    } else {
      console.log(`[click] TY check SKIPPED: thankYouPageUrl="${thankYouPageUrl ?? "NULL"}" page_url="${page_url ?? "NULL"}"`);
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
        countryCode: geo.countryCode,
        userAgent: ua,
        referrer: req.headers.get("referer"),
      },
    });

    await prisma.pageView.create({
      data: { clickId: click.id, pageUrl: page_url ?? "" },
    });

    // Edge case: landed directly on TY page with no prior click recorded
    if (thankYouPageUrl && page_url) {
      const saved = normPath(thankYouPageUrl);
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
