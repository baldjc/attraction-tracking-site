import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/feature-flags";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      repurposeName: true,
      repurposeBusiness: true,
      repurposeListSize: true,
      repurposeVoice: true,
      savedLinks: true,
    },
  });

  const flags = await getFeatureFlags();

  return NextResponse.json({
    profile: {
      name: dbUser?.repurposeName ?? "",
      business: dbUser?.repurposeBusiness ?? "",
      listSize: dbUser?.repurposeListSize ?? "",
      voice: dbUser?.repurposeVoice ?? "",
    },
    savedLinks: dbUser?.savedLinks ?? [],
    isSetup: !!(dbUser?.repurposeName && dbUser?.repurposeBusiness && dbUser?.repurposeVoice),
    toolFlags: {
      newsletter: flags.tool_repurpose_newsletter !== false,
      linkedin: flags.tool_repurpose_linkedin !== false,
      facebook: flags.tool_repurpose_facebook !== false,
      blog: flags.tool_repurpose_blog !== false,
      postcard: flags.tool_repurpose_postcard !== false,
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, business, listSize, voice, savedLinks } = await req.json();

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.repurposeName = name;
  if (business !== undefined) data.repurposeBusiness = business;
  if (listSize !== undefined) data.repurposeListSize = listSize;
  if (voice !== undefined) data.repurposeVoice = voice;
  if (savedLinks !== undefined) data.savedLinks = savedLinks;

  await prisma.user.update({
    where: { id: user.id },
    data,
  });

  return NextResponse.json({ saved: true });
}
