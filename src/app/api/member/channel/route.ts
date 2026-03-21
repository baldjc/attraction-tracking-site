import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { fetchContactByEmail, updateContactCustomField, GHL_FIELDS } from "@/lib/ghl";
import { getChannelInfo } from "@/lib/youtube";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.user.findUnique({
    where: { id: user.id },
    select: { youtubeChannelUrl: true, youtubeHandle: true, youtubeChannelName: true },
  });

  return NextResponse.json({
    youtubeChannelUrl: member?.youtubeChannelUrl ?? null,
    youtubeHandle: member?.youtubeHandle ?? null,
    youtubeChannelName: member?.youtubeChannelName ?? null,
    locked: !!member?.youtubeChannelUrl,
  });
}

export async function PUT(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { youtubeChannelUrl: true, email: true },
  });

  if (existing?.youtubeChannelUrl) {
    return NextResponse.json(
      { error: "Channel is locked. Contact your admin to change it." },
      { status: 403 }
    );
  }

  const { youtubeChannelUrl } = await req.json();
  const url: string | null = youtubeChannelUrl?.trim() || null;

  let youtubeHandle: string | null = null;
  let youtubeChannelName: string | null = null;

  if (url) {
    const handleMatch = url.match(/@[\w-]+/);
    if (handleMatch) {
      youtubeHandle = handleMatch[0];
    } else {
      const parts = url.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && last !== "youtube.com") {
        youtubeHandle = last.startsWith("@") ? last : `@${last}`;
      }
    }

    if (youtubeHandle) {
      try {
        const info = await getChannelInfo(youtubeHandle);
        if (info?.channelName) youtubeChannelName = info.channelName;
      } catch {}
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      youtubeChannelUrl: url,
      ...(youtubeHandle !== null && { youtubeHandle }),
      ...(youtubeChannelName !== null && { youtubeChannelName }),
    },
  });

  if (existing?.email && url) {
    try {
      const contact = await fetchContactByEmail(existing.email);
      if (contact?.id) {
        await updateContactCustomField(contact.id, GHL_FIELDS.YOUTUBE_CHANNEL_URL, url);
      }
    } catch {}
  }

  return NextResponse.json({
    youtubeChannelUrl: url,
    youtubeHandle,
    youtubeChannelName,
    locked: !!url,
  });
}
