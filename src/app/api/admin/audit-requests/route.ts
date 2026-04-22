import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdmin } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const requests = await prisma.auditRequest.findMany({
    orderBy: [
      { status: "asc" },
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json({ requests });
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fullName = (body.fullName ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const youtubeChannelUrl = (body.youtubeChannelUrl ?? "").trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  const currentYoutubeIncome = body.currentYoutubeIncome
    ? String(body.currentYoutubeIncome).trim()
    : null;
  const desiredYoutubeIncome = body.desiredYoutubeIncome
    ? String(body.desiredYoutubeIncome).trim()
    : null;

  if (!fullName) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!youtubeChannelUrl) {
    return NextResponse.json({ error: "YouTube channel URL is required" }, { status: 400 });
  }

  if (!/youtube\.com|youtu\.be/i.test(youtubeChannelUrl)) {
    return NextResponse.json(
      { error: "YouTube channel URL must contain youtube.com or youtu.be" },
      { status: 400 },
    );
  }

  const existing = await prisma.auditRequest.findFirst({
    where: { email, status: "pending" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A pending audit request already exists for this email", existingId: existing.id },
      { status: 409 },
    );
  }

  const created = await prisma.auditRequest.create({
    data: {
      fullName,
      email,
      phone,
      youtubeChannelUrl,
      currentYoutubeIncome,
      desiredYoutubeIncome,
    },
  });

  return NextResponse.json({ ok: true, request: created });
}
