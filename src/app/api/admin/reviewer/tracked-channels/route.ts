import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import { isReviewerEnabled } from "@/lib/reviewer-flag";
import prisma from "@/lib/prisma";
import { getChannelInfo } from "@/lib/youtube";

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await isReviewerEnabled())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const channels = await prisma.reviewerTrackedChannel.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
    },
  });

  return NextResponse.json({ channels });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userSession = session?.user as
    | { id?: string; role?: string }
    | undefined;
  if (!session?.user || !isAdmin(userSession?.role ?? "")) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!(await isReviewerEnabled())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const addedById = userSession?.id;
  if (!addedById) {
    return NextResponse.json({ error: "No session id" }, { status: 401 });
  }

  let body: { userId?: string | null; channelInput?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim() || null;
  let channelInput = body.channelInput?.trim();

  if (!channelInput && userId) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { youtubeHandle: true, youtubeChannelUrl: true },
    });
    channelInput = u?.youtubeHandle || u?.youtubeChannelUrl || "";
  }

  if (!channelInput) {
    return NextResponse.json(
      { error: "Provide a channel handle, URL, or ID" },
      { status: 400 },
    );
  }

  const normalised = normaliseChannelInput(channelInput);
  if (!normalised) {
    return NextResponse.json(
      { error: "Could not parse channel input" },
      { status: 400 },
    );
  }

  let info: Awaited<ReturnType<typeof getChannelInfo>>;
  try {
    info = await getChannelInfo(normalised);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "lookup_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!info?.channelId) {
    return NextResponse.json(
      { error: "Channel not found on YouTube" },
      { status: 404 },
    );
  }

  const existing = await prisma.reviewerTrackedChannel.findUnique({
    where: { channelRef: info.channelId },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Channel already tracked", channel: existing },
      { status: 409 },
    );
  }

  const created = await prisma.reviewerTrackedChannel.create({
    data: {
      channelRef: info.channelId,
      channelName: info.title,
      channelHandle: info.handle ?? null,
      channelThumbnail: info.thumbnailUrl ?? null,
      userId,
      addedById,
    },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
    },
  });

  return NextResponse.json({ channel: created }, { status: 201 });
}

function normaliseChannelInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^UC[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  if (s.startsWith("@")) return s;
  try {
    const u = new URL(s);
    const parts = u.pathname.split("/").filter(Boolean);
    const handlePart = parts.find((p) => p.startsWith("@"));
    if (handlePart) return handlePart;
    const channelIdx = parts.indexOf("channel");
    if (channelIdx >= 0 && parts[channelIdx + 1]) {
      return parts[channelIdx + 1];
    }
    if (parts[0]) return parts[0].startsWith("@") ? parts[0] : `@${parts[0]}`;
  } catch {
    // not a URL, fall through
  }
  return `@${s}`;
}
