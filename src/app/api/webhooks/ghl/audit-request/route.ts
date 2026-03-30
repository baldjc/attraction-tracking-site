import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const secret = process.env.GHL_WEBHOOK_SECRET;

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contact = body.contact ?? {};

  const fullName =
    body.full_name ?? contact.name ?? body.name ?? "";
  const email =
    body.email ?? contact.email ?? "";
  const phone =
    body.phone ?? contact.phone ?? null;
  const youtubeChannelUrl =
    body.youtube_channel_url ?? contact.youtube_channel_url ?? "";
  const currentYoutubeIncome =
    body.Current_YouTube_Commission ?? contact.Current_YouTube_Commission ?? null;
  const desiredYoutubeIncome =
    body.Desired_YouTube_Commission ?? contact.Desired_YouTube_Commission ?? null;

  if (!email || !youtubeChannelUrl) {
    return NextResponse.json({ error: "email and youtubeChannelUrl are required" }, { status: 400 });
  }

  const existing = await prisma.auditRequest.findFirst({
    where: { email, status: "pending" },
  });

  if (existing) {
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  await prisma.auditRequest.create({
    data: {
      fullName: fullName || email,
      email,
      phone,
      youtubeChannelUrl,
      currentYoutubeIncome,
      desiredYoutubeIncome,
    },
  });

  return NextResponse.json({ ok: true });
}
