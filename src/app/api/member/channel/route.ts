import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { withRouteErrorHandling } from "@/lib/api-error-wrapper";
import { fetchContactByEmail, updateContactCustomField, GHL_FIELDS } from "@/lib/ghl";
import { getChannelInfo } from "@/lib/youtube";

export const GET = withRouteErrorHandling("member/channel", GET_impl);

async function GET_impl() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      youtubeChannelUrl: true,
      youtubeHandle: true,
      youtubeChannelName: true,
      youtubeChannelThumbnail: true,
    },
  });

  let thumbnail = member?.youtubeChannelThumbnail ?? null;

  // Backfill thumbnail for members who have a handle but no thumbnail yet
  if (!thumbnail && member?.youtubeHandle) {
    try {
      const info = await getChannelInfo(member.youtubeHandle);
      if (info?.thumbnailUrl) {
        thumbnail = info.thumbnailUrl;
        await prisma.user.update({
          where: { id: user.id },
          data: { youtubeChannelThumbnail: thumbnail },
        });
      }
    } catch {}
  }

  return NextResponse.json({
    youtubeChannelUrl: member?.youtubeChannelUrl ?? null,
    youtubeHandle: member?.youtubeHandle ?? null,
    youtubeChannelName: member?.youtubeChannelName ?? null,
    youtubeChannelThumbnail: thumbnail,
    locked: !!member?.youtubeChannelUrl,
  });
}

export const PUT = withRouteErrorHandling("member/channel", PUT_impl);

async function PUT_impl(req: NextRequest) {
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
  let youtubeChannelThumbnail: string | null = null;

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
        if (info?.title) youtubeChannelName = info.title;
        if (info?.thumbnailUrl) youtubeChannelThumbnail = info.thumbnailUrl;
      } catch {}
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      youtubeChannelUrl: url,
      ...(youtubeHandle !== null && { youtubeHandle }),
      ...(youtubeChannelName !== null && { youtubeChannelName }),
      ...(youtubeChannelThumbnail !== null && { youtubeChannelThumbnail }),
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
    youtubeChannelThumbnail,
    locked: !!url,
  });
}
